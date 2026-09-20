import "server-only";
import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { REMOVED_VARIANT_SORT } from "@/config/catalog";
import { calcCommission } from "@/config/fees";
import { routes } from "@/config/nav";
import { shippingPolicy, type DeliveryTimeSlot } from "@/config/shipping";
import { farmOrderStatusMeta, farmOrderTransitions } from "@/config/status";
import { db } from "@/db";
import type { Database } from "@/db/client";
import {
  coupons,
  farmOrders,
  farms,
  orderItems,
  orders,
  productVariants,
  products,
  reviews,
  shipmentEvents,
  user,
  type AddressSnapshot,
  type Carrier,
  type Coupon,
  type Farm,
  type FarmOrder,
  type FarmOrderStatus,
  type GiftOption,
  type ShipmentEventType,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { toYmd, type YMD } from "@/lib/dates";
import { orderCode } from "@/lib/ids";
import { quoteShipment, scheduleDelivery, type DeliverySchedule, type ShipmentQuote } from "@/lib/shipping";
import { ActionError } from "@/server/actions/_utils";
import { expireTags } from "@/server/cache";
import { readSettingsUncached } from "@/server/queries/settings";
import { emailTemplates } from "./email/templates";
import { notify } from "./notify";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

/* ───────────────────────── Quote ───────────────────────── */

export type CartLineInput = { variantId: string; quantity: number };

export type QuotedLine = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  weightGrams: number;
  lineTotal: number;
  stock: number;
};

export type QuotedFarm = {
  farm: Pick<Farm, "id" | "name" | "slug" | "ownerId" | "defaultCarrier" | "leadTimeDays" | "shipWeekdays" | "freeShippingThreshold" | "commissionRateBps">;
  lines: QuotedLine[];
  subtotal: number;
  shipping: ShipmentQuote;
  schedule: DeliverySchedule;
  commissionRateBps: number;
  discount: number;
};

export type CartQuote = {
  farms: QuotedFarm[];
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  coupon: Pick<Coupon, "code" | "description" | "type" | "value"> | null;
  couponError: string | null;
  /** lines dropped because product/variant is unavailable */
  unavailable: string[];
  /** window where every farm can deliver */
  earliestDeliveryDate: YMD;
  latestSelectableDate: YMD;
};

export async function quoteCart(
  input: { lines: CartLineInput[]; prefecture: string; desiredDate?: YMD | null; couponCode?: string | null; now: Date },
  exec: Executor = db,
): Promise<CartQuote> {
  const ids = [...new Set(input.lines.map((l) => l.variantId))];
  const rows = ids.length
    ? await exec
        .select({ v: productVariants, p: products, f: farms })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(farms, eq(farms.id, products.farmId))
        .where(inArray(productVariants.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.v.id, r]));
  const images = rows.length
    ? await exec.query.productImages.findMany({
        where: (t, { inArray: inA }) => inA(t.productId, [...new Set(rows.map((r) => r.p.id))]),
        orderBy: (t, { asc }) => asc(t.sortOrder),
      })
    : [];
  const firstImage = new Map<string, string>();
  for (const img of images) if (!firstImage.has(img.productId)) firstImage.set(img.productId, img.url);

  const settings = await readSettingsUncached(exec);
  const unavailable: string[] = [];
  const grouped = new Map<string, QuotedFarm>();

  for (const line of input.lines) {
    const r = byId.get(line.variantId);
    if (!r || r.p.status !== "active" || r.f.status !== "active" || r.v.sortOrder >= REMOVED_VARIANT_SORT || line.quantity < 1) {
      unavailable.push(line.variantId);
      continue;
    }
    const qty = Math.min(line.quantity, 99);
    let g = grouped.get(r.f.id);
    if (!g) {
      g = {
        farm: r.f,
        lines: [],
        subtotal: 0,
        shipping: null as unknown as ShipmentQuote,
        schedule: null as unknown as DeliverySchedule,
        commissionRateBps: r.f.commissionRateBps ?? settings.commissionRateBps,
        discount: 0,
      };
      grouped.set(r.f.id, g);
    }
    g.lines.push({
      variantId: r.v.id,
      productId: r.p.id,
      productSlug: r.p.slug,
      productName: r.p.name,
      variantLabel: r.v.label,
      imageUrl: firstImage.get(r.p.id) ?? null,
      unitPrice: r.v.price,
      quantity: qty,
      weightGrams: r.v.weightGrams,
      lineTotal: r.v.price * qty,
      stock: r.v.stock,
    });
    g.subtotal += r.v.price * qty;
  }

  for (const g of grouped.values()) {
    const grams = g.lines.reduce((a, l) => a + l.weightGrams * l.quantity, 0);
    g.shipping = quoteShipment({
      prefecture: input.prefecture,
      carrier: g.farm.defaultCarrier,
      productWeightGrams: grams,
      subtotal: g.subtotal,
      freeShippingThreshold: g.farm.freeShippingThreshold ?? shippingPolicy.defaultFreeShippingThreshold,
    });
    g.schedule = scheduleDelivery({
      now: input.now,
      leadTimeDays: g.farm.leadTimeDays,
      shipWeekdays: g.farm.shipWeekdays,
      transitDays: g.shipping.transitDays,
      desiredDate: input.desiredDate,
      windowDays: shippingPolicy.desiredDateWindowDays,
    });
  }

  const farmsQuoted = [...grouped.values()];
  const subtotal = farmsQuoted.reduce((a, g) => a + g.subtotal, 0);
  const shippingTotal = farmsQuoted.reduce((a, g) => a + g.shipping.fee, 0);

  // coupon (platform-funded: allocated to farm orders for display, does not reduce farm payout)
  let coupon: CartQuote["coupon"] = null;
  let couponError: string | null = null;
  let discountTotal = 0;
  if (input.couponCode) {
    const c = await exec.query.coupons.findFirst({ where: eq(coupons.code, input.couponCode.trim().toUpperCase()) });
    const now = input.now.getTime();
    if (!c || !c.isActive) couponError = "このクーポンは使用できません";
    else if (c.startsAt && c.startsAt.getTime() > now) couponError = "クーポンの利用開始前です";
    else if (c.endsAt && c.endsAt.getTime() < now) couponError = "クーポンの有効期限が切れています";
    else if (c.maxUses != null && c.usedCount >= c.maxUses) couponError = "クーポンの利用上限に達しました";
    else if (subtotal < c.minSubtotal) couponError = `${c.minSubtotal.toLocaleString()}円以上のご注文で使えます`;
    else {
      coupon = { code: c.code, description: c.description, type: c.type, value: c.value };
      discountTotal = Math.min(subtotal, c.type === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value);
      let remaining = discountTotal;
      farmsQuoted.forEach((g, i) => {
        const share = i === farmsQuoted.length - 1 ? remaining : Math.floor((discountTotal * g.subtotal) / subtotal);
        g.discount = share;
        remaining -= share;
      });
    }
  }

  const earliest = farmsQuoted.map((g) => g.schedule.earliestDeliveryDate).sort().at(-1) ?? toYmd(input.now);
  const latest = farmsQuoted.map((g) => g.schedule.latestSelectableDate).sort()[0] ?? earliest;

  return {
    farms: farmsQuoted,
    subtotal,
    shippingTotal,
    discountTotal,
    total: subtotal + shippingTotal - discountTotal,
    coupon,
    couponError,
    unavailable,
    earliestDeliveryDate: earliest,
    latestSelectableDate: latest,
  };
}

/* ───────────────────────── Create ───────────────────────── */

export type CreateOrderInput = {
  userId: string;
  email: string;
  lines: CartLineInput[];
  address: AddressSnapshot;
  desiredDeliveryDate?: YMD | null;
  deliveryTimeSlot?: DeliveryTimeSlot | null;
  gift?: GiftOption | null;
  note?: string;
  couponCode?: string | null;
  paymentProvider: "stripe" | "demo";
  now: Date;
};

/** Creates a pending order, reserving stock atomically. Throws ActionError on validation failure. */
export async function createOrder(input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const quote = await quoteCart(
      { lines: input.lines, prefecture: input.address.prefecture, desiredDate: input.desiredDeliveryDate, couponCode: input.couponCode, now: input.now },
      tx,
    );
    if (quote.unavailable.length) throw new ActionError("販売を終了した商品がカートに含まれています。カートを確認してください。");
    if (!quote.farms.length) throw new ActionError("カートが空です");
    if (quote.couponError) throw new ActionError(quote.couponError);

    // reserve stock (conditional decrement guards against oversell)
    for (const g of quote.farms) {
      for (const l of g.lines) {
        const res = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${l.quantity}` })
          .where(and(eq(productVariants.id, l.variantId), gte(productVariants.stock, l.quantity)))
          .returning({ id: productVariants.id });
        if (!res.length) throw new ActionError(`「${l.productName}（${l.variantLabel}）」の在庫が不足しています`);
      }
    }

    // Reserve the coupon use here, not at payment: the limit has to hold against simultaneous checkouts and
    // against a shopper who parks several unpaid orders on the last use. Released again if the order is cancelled.
    if (quote.coupon) {
      const [reserved] = await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(and(eq(coupons.code, quote.coupon.code), or(isNull(coupons.maxUses), lt(coupons.usedCount, coupons.maxUses))))
        .returning({ id: coupons.id });
      if (!reserved) throw new ActionError("クーポンの利用上限に達しました");
    }

    const code = orderCode(input.now);
    const [order] = await tx
      .insert(orders)
      .values({
        code,
        userId: input.userId,
        email: input.email,
        subtotal: quote.subtotal,
        shippingTotal: quote.shippingTotal,
        discountTotal: quote.discountTotal,
        total: quote.total,
        couponCode: quote.coupon?.code ?? null,
        shippingAddress: input.address,
        gift: input.gift ?? null,
        note: input.note ?? "",
        desiredDeliveryDate: input.desiredDeliveryDate ?? null,
        deliveryTimeSlot: input.deliveryTimeSlot && input.deliveryTimeSlot !== "none" ? input.deliveryTimeSlot : null,
        paymentProvider: input.paymentProvider,
      })
      .returning();

    for (const [i, g] of quote.farms.entries()) {
      const commission = calcCommission(g.subtotal, g.commissionRateBps);
      const [fo] = await tx
        .insert(farmOrders)
        .values({
          orderId: order.id,
          farmId: g.farm.id,
          code: `${code}-${i + 1}`,
          subtotal: g.subtotal,
          shippingFee: g.shipping.fee,
          discount: g.discount,
          commissionRateBps: g.commissionRateBps,
          commissionAmount: commission,
          payoutAmount: g.subtotal + g.shipping.fee - commission,
          carrier: g.farm.defaultCarrier,
          boxSize: g.shipping.boxSize,
          boxCount: g.shipping.boxCount,
          totalWeightGrams: g.shipping.totalWeightGrams,
          shipByDate: g.schedule.shipByDate,
          estimatedDeliveryDate: g.schedule.estimatedDeliveryDate,
        })
        .returning();
      await tx.insert(orderItems).values(
        g.lines.map((l) => ({
          farmOrderId: fo.id,
          productId: l.productId,
          variantId: l.variantId,
          productName: l.productName,
          variantLabel: l.variantLabel,
          imageUrl: l.imageUrl,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          weightGrams: l.weightGrams,
          lineTotal: l.lineTotal,
        })),
      );
    }
    return { order, quote };
  });
}

/* ───────────────────────── Payment ───────────────────────── */

/** Idempotent: pending_payment → paid. Triggers notifications & counters. */
export async function markOrderPaid(orderId: string, p: { paymentIntentId?: string | null; sessionId?: string | null; now: Date }) {
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .update(orders)
      .set({ status: "paid", paidAt: p.now, stripePaymentIntentId: p.paymentIntentId ?? null, stripeSessionId: p.sessionId ?? undefined })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
      .returning();
    if (!order) return null;
    const fos = await tx
      .update(farmOrders)
      .set({ status: "paid" })
      .where(and(eq(farmOrders.orderId, orderId), eq(farmOrders.status, "pending_payment")))
      .returning();
    await tx.insert(shipmentEvents).values(
      fos.map((fo) => ({ farmOrderId: fo.id, type: "order_received" as const, message: "ご注文を受け付けました", occurredAt: p.now })),
    );
    const items = await tx.select().from(orderItems).where(inArray(orderItems.farmOrderId, fos.map((f) => f.id)));
    for (const it of items) {
      if (it.productId) await tx.update(products).set({ soldCount: sql`${products.soldCount} + ${it.quantity}` }).where(eq(products.id, it.productId));
    }
    return { order, fos, items };
  });
  if (!result) return null;

  const { order, fos, items } = result;
  const customer = await db.query.user.findFirst({ where: eq(user.id, order.userId) });
  await notify({
    userId: order.userId,
    type: "order",
    title: "ご注文を受け付けました",
    body: `注文番号 ${order.code}`,
    href: routes.mypage.order(order.id),
    email: emailTemplates.orderConfirmation({
      to: order.email, name: customer?.name ?? "お客", orderId: order.id, code: order.code, total: order.total,
      items, desiredDate: order.desiredDeliveryDate, timeSlot: order.deliveryTimeSlot, farmCount: fos.length,
    }),
  });
  const farmRows = await db.select().from(farms).where(inArray(farms.id, fos.map((f) => f.farmId)));
  const owners = await db.select().from(user).where(inArray(user.id, farmRows.map((f) => f.ownerId)));
  for (const fo of fos) {
    const farm = farmRows.find((f) => f.id === fo.farmId)!;
    const owner = owners.find((o) => o.id === farm.ownerId);
    const summary = items.filter((i) => i.farmOrderId === fo.id).map((i) => `${i.productName} ${i.variantLabel}×${i.quantity}`).join(" / ");
    await notify({
      userId: farm.ownerId,
      type: "order",
      title: "新しい注文が入りました",
      body: `${fo.code}｜出荷期限 ${fo.shipByDate ?? "-"}`,
      href: routes.farmer.order(fo.id),
      email: owner ? emailTemplates.farmerNewOrder({ to: owner.email, farmName: farm.name, farmOrderId: fo.id, code: fo.code, subtotal: fo.subtotal, shipByDate: fo.shipByDate, itemsSummary: summary }) : undefined,
    });
  }
  expireTags(tags.products, tags.analytics, ...fos.map((f) => tags.farmAnalytics(f.farmId)), ...items.map((i) => i.productId && tags.product(i.productId)));
  return order;
}

/* ───────────────────────── Fulfilment state machine ───────────────────────── */

const eventFor: Partial<Record<FarmOrderStatus, { type: ShipmentEventType; message: string }>> = {
  preparing: { type: "note", message: "出荷準備を開始しました" },
  shipped: { type: "shipped", message: "商品を発送しました" },
  delivered: { type: "delivered", message: "お届けが完了しました" },
  cancelled: { type: "note", message: "ご注文がキャンセルされました" },
};

export type TransitionOptions = {
  source: "farmer" | "admin" | "customer" | "cron" | "system";
  now: Date;
  trackingNumber?: string | null;
  carrier?: Carrier;
  note?: string;
  /** when set, the farm order must belong to this farm (farmer actions) */
  farmId?: string;
};

export async function transitionFarmOrder(farmOrderId: string, to: FarmOrderStatus, opts: TransitionOptions): Promise<FarmOrder> {
  const fo = await db.query.farmOrders.findFirst({ where: eq(farmOrders.id, farmOrderId), with: { order: true, farm: true, items: true } });
  if (!fo || (opts.farmId && fo.farmId !== opts.farmId)) throw new ActionError("注文が見つかりません");
  if (fo.status === to) return fo;
  if (!farmOrderTransitions[fo.status].includes(to)) {
    throw new ActionError(`「${farmOrderStatusMeta[fo.status].label}」から「${farmOrderStatusMeta[to].label}」には変更できません`);
  }
  if (to === "shipped" && !opts.trackingNumber && !fo.trackingNumber) throw new ActionError("追跡番号を入力してください");

  const patch: Partial<typeof farmOrders.$inferInsert> = { status: to };
  if (to === "shipped") {
    patch.shippedAt = opts.now;
    patch.trackingNumber = opts.trackingNumber ?? fo.trackingNumber;
    if (opts.carrier) patch.carrier = opts.carrier;
  }
  if (to === "delivered") patch.deliveredAt = opts.now;
  if (to === "cancelled") patch.cancelledAt = opts.now;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(farmOrders).set(patch).where(and(eq(farmOrders.id, fo.id), eq(farmOrders.status, fo.status))).returning();
    if (!row) throw new ActionError("他の操作で状態が変更されました。再読み込みしてください。");
    const ev = eventFor[to];
    if (ev) {
      await tx.insert(shipmentEvents).values({
        farmOrderId: fo.id, type: ev.type, message: opts.note || ev.message, source: opts.source, occurredAt: opts.now,
        location: to === "shipped" ? fo.farm.city : to === "delivered" ? fo.order.shippingAddress.prefecture : null,
      });
    }
    if (to === "cancelled") {
      for (const it of fo.items) {
        if (it.variantId) await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${it.quantity}` }).where(eq(productVariants.id, it.variantId));
      }
      const siblings = await tx.select({ status: farmOrders.status }).from(farmOrders).where(eq(farmOrders.orderId, fo.orderId));
      if (siblings.every((s) => s.status === "cancelled" || s.status === "refunded")) {
        // conditional so the release below runs exactly once, whichever farm order flips the order
        const [flipped] = await tx
          .update(orders)
          .set({ status: "cancelled", cancelledAt: opts.now })
          .where(and(eq(orders.id, fo.orderId), ne(orders.status, "cancelled")))
          .returning({ couponCode: orders.couponCode });
        if (flipped?.couponCode) await releaseCoupon(tx, flipped.couponCode);
      }
    }
    return row;
  });

  // side effects
  if (to === "shipped") {
    await notify({
      userId: fo.order.userId, type: "shipping", title: `${fo.farm.name}から発送しました`, body: `追跡番号 ${updated.trackingNumber ?? "-"}`,
      href: routes.mypage.order(fo.orderId),
      email: emailTemplates.shipped({
        to: fo.order.email, name: fo.order.shippingAddress.recipientName, orderId: fo.orderId, farmName: fo.farm.name,
        carrier: updated.carrier, trackingNumber: updated.trackingNumber, eta: updated.estimatedDeliveryDate,
      }),
    });
  } else if (to === "delivered") {
    await notify({ userId: fo.order.userId, type: "shipping", title: "お届けが完了しました", body: `${fo.farm.name}｜${fo.code}`, href: routes.mypage.order(fo.orderId) });
  } else if (to === "cancelled") {
    await notify({ userId: fo.order.userId, type: "order", title: "ご注文がキャンセルされました", body: fo.code, href: routes.mypage.order(fo.orderId) });
    if (opts.source !== "farmer") await notify({ userId: fo.farm.ownerId, type: "order", title: "注文がキャンセルされました", body: fo.code, href: routes.farmer.order(fo.id) });
  }
  expireTags(tags.analytics, tags.farmAnalytics(fo.farmId), to === "cancelled" && tags.products);
  return updated;
}

/** Customer-initiated cancel of a whole order (only before shipment). */
export async function cancelOrderByCustomer(orderId: string, userId: string, now: Date) {
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, userId)), with: { farmOrders: true } });
  if (!order) throw new ActionError("注文が見つかりません");
  const cancellable = order.farmOrders.every((f) => ["pending_payment", "paid", "preparing", "cancelled"].includes(f.status));
  if (!cancellable) throw new ActionError("発送済みの商品を含むためキャンセルできません。メッセージで生産者にご相談ください。");
  for (const fo of order.farmOrders) {
    if (fo.status !== "cancelled") await transitionFarmOrder(fo.id, "cancelled", { source: "customer", now });
  }
  if (order.status === "paid" && order.paymentProvider === "stripe" && order.stripePaymentIntentId) {
    const { refundPayment } = await import("./payments/stripe");
    await refundPayment(order.stripePaymentIntentId, undefined, `order:${order.id}`);
    await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId));
  }
}

/** Gives a reserved coupon use back. Never below zero, so a double call cannot mint extra uses. */
async function releaseCoupon(exec: Pick<Database, "update">, code: string) {
  await exec
    .update(coupons)
    .set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` })
    .where(eq(coupons.code, code));
}

/** Expire an unpaid order: cancel all farm orders & restore stock. */
export async function expireUnpaidOrder(orderId: string, now: Date) {
  const fos = await db.select().from(farmOrders).where(and(eq(farmOrders.orderId, orderId), eq(farmOrders.status, "pending_payment")));
  for (const fo of fos) await transitionFarmOrder(fo.id, "cancelled", { source: "cron", now, note: "お支払い期限切れのためキャンセルしました" });
  const [expired] = await db
    .update(orders)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
    .returning({ couponCode: orders.couponCode });
  if (expired?.couponCode) await releaseCoupon(db, expired.couponCode);
}

/* ───────────────────────── Reviews ───────────────────────── */

export async function recomputeRatings(productId: string, farmId: string) {
  await db.execute(sql`
    update products set
      rating_sum = coalesce((select sum(rating) from ${reviews} where product_id = ${productId} and is_published), 0),
      rating_count = (select count(*) from ${reviews} where product_id = ${productId} and is_published)
    where id = ${productId}`);
  await db.execute(sql`
    update farms set
      rating_sum = coalesce((select sum(rating) from ${reviews} where farm_id = ${farmId} and is_published), 0),
      rating_count = (select count(*) from ${reviews} where farm_id = ${farmId} and is_published)
    where id = ${farmId}`);
  expireTags(tags.product(productId), tags.productReviews(productId), tags.farm(farmId), tags.reviews);
}
