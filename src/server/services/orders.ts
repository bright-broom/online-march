import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { catalogLimits, REMOVED_VARIANT_SORT } from "@/config/catalog";
import { calcCommission } from "@/config/fees";
import { couponOncePerUserCopy } from "@/config/payments";
import { routes } from "@/config/nav";
import { shippingPolicy, shippingZones, type DeliveryTimeSlot } from "@/config/shipping";
import { farmOrderStatusMeta, farmOrderTransitions } from "@/config/status";
import { db } from "@/db";
import { cancelRequestPending, WHOLE_ORDER_CANCELLABLE } from "@/lib/order-cancel";
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
  type Order,
  type ShipmentEventType,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { addDays, toYmd, type YMD } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { orderCode } from "@/lib/ids";
import { quoteShipment, scheduleDelivery, zoneOf, type DeliverySchedule, type ShipmentQuote } from "@/lib/shipping";
import { ActionError } from "@/server/actions/_utils";
import { expireTags } from "@/server/cache";
import { readSettingsUncached } from "@/server/queries/settings";
import { emailTemplates } from "./email/templates";
import { sendEmail } from "./email";
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
  /** 消費税率（%）。注文明細に控える（#10） */
  taxRate: number;
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
  /** そのうち「農園がお休み中」で落ちたもの。理由が分からないと、お客さまは待てばいいのか諦めるのか判断できない */
  pausedFarms: { name: string; until: YMD }[];
  /** window where every farm can deliver */
  earliestDeliveryDate: YMD;
  latestSelectableDate: YMD;
};

export async function quoteCart(
  input: { lines: CartLineInput[]; prefecture: string; desiredDate?: YMD | null; couponCode?: string | null; userId?: string | null; now: Date },
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

  const today = toYmd(input.now);
  const isPaused = (f: { pausedUntil: string | null }) => Boolean(f.pausedUntil && f.pausedUntil >= today);
  const pausedFarms = new Map<string, { name: string; until: YMD }>();

  for (const line of input.lines) {
    const r = byId.get(line.variantId);
    // お休み中の農園は受け付けない（出荷できない注文を作らないため。期間を過ぎれば自動で戻る）
    if (!r || r.p.status !== "active" || r.f.status !== "active" || isPaused(r.f) || r.v.sortOrder >= REMOVED_VARIANT_SORT || line.quantity < 1) {
      unavailable.push(line.variantId);
      if (r && isPaused(r.f)) pausedFarms.set(r.f.id, { name: r.f.name, until: r.f.pausedUntil as YMD });
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
      taxRate: r.p.taxRate,
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
    else if (c.oncePerUser && (!input.userId || (await hasUsedCoupon(exec, input.userId, c.code)))) couponError = couponOncePerUserCopy.used;
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
    pausedFarms: [...pausedFarms.values()],
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
  const lowStock: { farmOwnerId: string; productId: string; productName: string; variantLabel: string; stock: number }[] = [];
  const result = await db.transaction(async (tx) => {
    const quote = await quoteCart(
      { lines: input.lines, prefecture: input.address.prefecture, desiredDate: input.desiredDeliveryDate, couponCode: input.couponCode, userId: input.userId, now: input.now },
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
          .returning({ id: productVariants.id, stock: productVariants.stock });
        if (!res.length) throw new ActionError(`「${l.productName}（${l.variantLabel}）」の在庫が不足しています`);
        // この注文でしきい値を下回ったとき・売り切れたときだけ（同じ規格で何度も知らせない）。#21
        const left = res[0].stock;
        const crossedLow = left <= catalogLimits.lowStockThreshold && left + l.quantity > catalogLimits.lowStockThreshold;
        const soldOut = left === 0;
        if (crossedLow || soldOut) {
          lowStock.push({ farmOwnerId: g.farm.ownerId, productId: l.productId, productName: l.productName, variantLabel: l.variantLabel, stock: left });
        }
      }
    }

    // Reserve the coupon use here, not at payment: the limit has to hold against simultaneous checkouts and
    // against a shopper who parks several unpaid orders on the last use. Released again if the order is cancelled.
    if (quote.coupon) {
      // 「お一人さま1回」: 同じ人の同時の注文が両方とも「まだ使っていない」と読まないよう、人とコードの組で順番待ちにしてから数え直す
      const c = await tx.query.coupons.findFirst({ where: eq(coupons.code, quote.coupon.code), columns: { oncePerUser: true } });
      if (c?.oncePerUser) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coupon:${quote.coupon.code}:${input.userId}`}))`);
        if (await hasUsedCoupon(tx, input.userId, quote.coupon.code)) throw new ActionError(couponOncePerUserCopy.used);
      }
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
          taxRate: l.taxRate,
        })),
      );
    }
    return { order, quote };
  });
  // after commit: a rolled-back order must not have told the farmer anything
  for (const s of lowStock) {
    await notify({
      userId: s.farmOwnerId,
      type: "product",
      title: s.stock === 0 ? `「${s.productName}（${s.variantLabel}）」が売り切れました` : `「${s.productName}（${s.variantLabel}）」の在庫が残り${s.stock}点です`,
      body: "在庫を補充するか、販売を終える場合はそのままで大丈夫です（売り切れの表示になります）。",
      href: routes.farmer.product(s.productId),
    });
  }
  return result;
}

/* ───────────────────────── Payment ───────────────────────── */

/** Idempotent: pending_payment → paid. Triggers notifications & counters. */
export async function markOrderPaid(
  orderId: string,
  p: { paymentIntentId?: string | null; sessionId?: string | null; method?: string | null; now: Date },
) {
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: p.now,
        stripePaymentIntentId: p.paymentIntentId ?? null,
        stripeSessionId: p.sessionId ?? undefined,
        paymentMethod: p.method ?? undefined,
        // the payment slip is spent — stop offering it on the order page
        paymentVoucherUrl: null,
        paymentDueAt: null,
      })
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

/**
 * コンビニ払い等で支払い番号だけ発行された状態。注文は pending_payment のまま入金を待つ。
 * お客さまは番号を失くすと払えないので、番号ページと期限を注文に残し、メールでも送る。
 * Webhook は再送されるため、記録できた1回だけ通知する。
 */
export async function recordAwaitingPayment(
  orderId: string,
  p: { paymentIntentId?: string | null; sessionId?: string | null; method: string | null; voucherUrl: string | null; dueAt: Date | null; now: Date },
) {
  const [order] = await db
    .update(orders)
    .set({
      paymentMethod: p.method,
      paymentVoucherUrl: p.voucherUrl,
      paymentDueAt: p.dueAt,
      stripePaymentIntentId: p.paymentIntentId ?? undefined,
      stripeSessionId: p.sessionId ?? undefined,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment"), isNull(orders.paymentMethod)))
    .returning();
  if (!order) return null;

  const customer = await db.query.user.findFirst({ where: eq(user.id, order.userId) });
  await notify({
    userId: order.userId,
    type: "order",
    title: "お支払い番号を発行しました",
    body: `注文番号 ${order.code}｜お支払い期限 ${order.paymentDueAt ? formatDateTime(order.paymentDueAt) : "-"}`,
    href: routes.mypage.order(order.id),
    email: emailTemplates.paymentPending({
      to: order.email, name: customer?.name ?? "お客", orderId: order.id, code: order.code,
      total: order.total, method: p.method, voucherUrl: p.voucherUrl, dueAt: p.dueAt,
    }),
  });
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
  source: "farmer" | "admin" | "customer" | "cron" | "system" | "carrier";
  now: Date;
  trackingNumber?: string | null;
  carrier?: Carrier;
  note?: string;
  /** when set, the farm order must belong to this farm (farmer actions) */
  farmId?: string;
  /** 操作した人（オーナー・スタッフ・運営, #24）。履歴に残し、生産者の画面に名前を出す */
  actorId?: string;
};

export async function transitionFarmOrder(farmOrderId: string, to: FarmOrderStatus, opts: TransitionOptions): Promise<FarmOrder> {
  const fo = await db.query.farmOrders.findFirst({ where: eq(farmOrders.id, farmOrderId), with: { order: true, farm: true, items: true } });
  if (!fo || (opts.farmId && fo.farmId !== opts.farmId)) throw new ActionError("注文が見つかりません");
  if (fo.status === to) return fo;
  if (!farmOrderTransitions[fo.status].includes(to)) {
    throw new ActionError(`「${farmOrderStatusMeta[fo.status].label}」から「${farmOrderStatusMeta[to].label}」には変更できません`);
  }
  if (to === "shipped" && !opts.trackingNumber && !fo.trackingNumber) throw new ActionError("追跡番号を入力してください");
  // お客さまのキャンセルの依頼（#18）に回答するまで、生産者は発送済みにできない。運営が発送済みにしたときは「お断り」で閉じる
  const answerPendingRequest = to === "shipped" && cancelRequestPending(fo);
  if (answerPendingRequest && opts.source === "farmer") throw new ActionError("お客さまからキャンセルの依頼が届いています。先に回答してください");

  const patch: Partial<typeof farmOrders.$inferInsert> = { status: to };
  if (to === "shipped") {
    patch.shippedAt = opts.now;
    patch.trackingNumber = opts.trackingNumber ?? fo.trackingNumber;
    // お届け予定日を実際に発送した日から引き直す（遅れて発送したら後ろへ。早まる方には動かさない。#25）。
    // 自動の配達完了（services/shipping/delivery.ts）と発送メールの「お届け予定」がこの日を使う
    const fromShipDate = addDays(toYmd(opts.now), shippingZones[zoneOf(fo.order.shippingAddress.prefecture)].transitDays);
    if (!fo.estimatedDeliveryDate || fo.estimatedDeliveryDate < fromShipDate) patch.estimatedDeliveryDate = fromShipDate;
    if (opts.carrier) patch.carrier = opts.carrier;
    if (answerPendingRequest) Object.assign(patch, { cancelRequestAnswer: "declined", cancelRequestAnsweredAt: opts.now });
  }
  if (to === "delivered") patch.deliveredAt = opts.now;
  if (to === "cancelled") patch.cancelledAt = opts.now;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(farmOrders)
      .set(patch)
      .where(
        and(
          eq(farmOrders.id, fo.id),
          eq(farmOrders.status, fo.status),
          // 返金の途中（refundOrder が行を押さえた後）の出荷単位は、準備にも発送にも進めない（#18）
          to === "preparing" || to === "shipped" ? isNull(farmOrders.refundedAt) : undefined,
          // 読んだ後にキャンセルの依頼が届いていたら、生産者は発送できない
          to === "shipped" && opts.source === "farmer" ? or(isNull(farmOrders.cancelRequestedAt), isNotNull(farmOrders.cancelRequestAnsweredAt)) : undefined,
        ),
      )
      .returning();
    if (!row) throw new ActionError("他の操作で状態が変更されました。再読み込みしてください。");
    const ev = eventFor[to];
    if (ev) {
      await tx.insert(shipmentEvents).values({
        farmOrderId: fo.id, type: ev.type, message: opts.note || ev.message, source: opts.source, actorId: opts.actorId ?? null, occurredAt: opts.now,
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

/**
 * お客さまの「受け取りました」（#25）。自分の注文の、発送済みの荷物だけ。配達の問題が記録されていても、受け取ったなら完了にする。
 * 業者の追跡やお届け予定日のルール（services/shipping/delivery.ts）を待たずに、その場で配達完了（精算・レビュー依頼が進む）。
 */
export async function confirmReceivedByCustomer(farmOrderId: string, userId: string, now: Date) {
  const [own] = await db
    .select({ id: farmOrders.id, status: farmOrders.status })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.id, farmOrderId), eq(orders.userId, userId)))
    .limit(1);
  if (!own) throw new ActionError("ご注文が見つかりません");
  if (own.status !== "shipped") throw new ActionError(shippingPolicy.delivery.confirmNotShipped);
  return transitionFarmOrder(own.id, "delivered", { source: "customer", now, note: shippingPolicy.delivery.byCustomer, actorId: userId });
}

/** Customer-initiated cancel of a whole order (only before shipment). */
export async function cancelOrderByCustomer(orderId: string, userId: string, now: Date) {
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, userId)), with: { farmOrders: true } });
  if (!order) throw new ActionError("注文が見つかりません");
  // 注文全体を取り消せるのは、どの生産者もまだ準備を始めていないときだけ（#18）。準備中の分は生産者ごとの「キャンセルの依頼」へ
  if (order.farmOrders.some((f) => f.status === "preparing")) {
    throw new ActionError("出荷準備が始まっている生産者の分があるため、注文全体はキャンセルできません。生産者ごとにキャンセル、またはキャンセルの依頼をしてください。");
  }
  const cancellable = order.farmOrders.every((f) => WHOLE_ORDER_CANCELLABLE.includes(f.status));
  if (!cancellable) throw new ActionError("発送済みの商品を含むためキャンセルできません。メッセージで生産者にご相談ください。");
  // 支払い済みなら返金の一本道へ（二重返金の防止・返金額の記録・返金メールがそこにある）
  if (order.paidAt && order.status === "paid") {
    const { refundOrder } = await import("./refunds");
    // 残りがすべて準備前なら、返金の行を押さえる更新の中でも「新規受注のまま」を確かめる（同時に「準備を始める」が押されても通らない。#18）
    // （refundOrder が返金する対象＝まだ返金していない出荷単位。1つでも別の状態なら、ここでは確かめない）
    const targets = order.farmOrders.filter((f) => f.refundedAt == null && f.status !== "refunded");
    const onlyStatus = targets.length && targets.every((f) => f.status === "paid") ? ("paid" as const) : undefined;
    await refundOrder({ orderId, onlyStatus }, { source: "customer", note: "お客さまによるキャンセル" });
    return;
  }
  for (const fo of order.farmOrders) {
    if (fo.status !== "cancelled") await transitionFarmOrder(fo.id, "cancelled", { source: "customer", now });
  }
}

/** その人がこのクーポンを使った注文があるか。キャンセルした注文は数えない（未払い・支払済み・返金済みは数える）。 */
async function hasUsedCoupon(exec: Pick<Database, "select">, userId: string, code: string) {
  const [row] = await exec
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.couponCode, code), ne(orders.status, "cancelled")))
    .limit(1);
  return Boolean(row);
}

/** Gives a reserved coupon use back. Never below zero, so a double call cannot mint extra uses. */
async function releaseCoupon(exec: Pick<Database, "update">, code: string) {
  await exec
    .update(coupons)
    .set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` })
    .where(eq(coupons.code, code));
}

/** Expire an unpaid order: cancel all farm orders & restore stock. */
export async function expireUnpaidOrder(
  orderId: string,
  now: Date,
  opts: { source: TransitionOptions["source"]; note: string } = { source: "cron", note: "お支払い期限切れのためキャンセルしました" },
) {
  // 先に読む: 下の transition が最後の出荷単位を閉じた時点で、親の注文も cancelled になる
  const before = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  const fos = await db.select().from(farmOrders).where(and(eq(farmOrders.orderId, orderId), eq(farmOrders.status, "pending_payment")));
  for (const fo of fos) await transitionFarmOrder(fo.id, "cancelled", { source: opts.source, now, note: opts.note });
  const [expired] = await db
    .update(orders)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
    .returning({ couponCode: orders.couponCode });
  if (expired?.couponCode) await releaseCoupon(db, expired.couponCode);
  // お支払い番号を受け取った人（コンビニ払い）にだけ知らせる。決済画面を閉じただけの人に「キャンセル」メールは送らない。
  // 二度呼ばれても（webhook と cron）2回目は status が cancelled なので送らない
  if (before?.status === "pending_payment" && before.paymentDueAt) {
    await sendEmail(emailTemplates.paymentExpired({ to: before.email, name: before.shippingAddress.recipientName, orderId, code: before.code }));
  }
}

export type AbandonedCheckout =
  /** 取り消して在庫・クーポンを戻した（または、もう支払い待ちではなかった） */
  | { kind: "cancelled" }
  /** 決済画面を離れる前に支払いが済んでいた。Webhook（取りこぼしは cancel-unpaid）が確定させる */
  | { kind: "paid" }
  /** コンビニ払いの番号を受け取っている。期限まで入金を待つ */
  | { kind: "awaiting_payment" }
  | { kind: "not_pending" };

/**
 * お客さまが Stripe の決済画面から「戻る」で帰ってきた注文（#17）。期限（60分）まで在庫とクーポンを押さえたままにせず、
 * すぐ取り消す。先に Stripe の決済画面を閉じる（`resolve` が open の session を expire する）ので、別タブから後で払われることはない。
 * `resolve` は Stripe 未設定（デモ）なら null。
 */
export async function abandonCheckout(
  order: Pick<Order, "id" | "status" | "stripeSessionId">,
  now: Date,
  resolve: ((sessionId: string) => Promise<{ kind: "paid" | "awaiting_async" | "expired" }>) | null,
): Promise<AbandonedCheckout> {
  if (order.status !== "pending_payment") return { kind: "not_pending" };
  if (resolve && order.stripeSessionId) {
    const r = await resolve(order.stripeSessionId);
    if (r.kind === "paid") return { kind: "paid" };
    if (r.kind === "awaiting_async") return { kind: "awaiting_payment" };
  }
  await expireUnpaidOrder(order.id, now, { source: "customer", note: "お客さまが決済画面でお支払いをやめたため取り消しました" });
  return { kind: "cancelled" };
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
