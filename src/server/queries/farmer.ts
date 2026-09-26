import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { catalogLimits } from "@/config/catalog";
import { shippingZones, type ShippingZoneKey } from "@/config/shipping";
import { db } from "@/db";
import { getMaskedBankAccount } from "@/server/services/bank-account";
import {
  announcements,
  farmOrders,
  messages,
  orderItems,
  orders,
  payouts,
  productImages,
  productVariants,
  products,
  reviews,
  shipmentEvents,
  user,
  type FarmOrderStatus,
  type ProductStatus,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { addDays, fromYmd, monthKey, toYmd, type YMD } from "@/lib/dates";
import { zoneOf } from "@/lib/shipping";

/**
 * Farmer dashboard reads. EVERY function takes `farmId` (from requireFarm/assertFarm) and scopes by it.
 * - Analytics: "use cache" + cacheLife("dashboard") + tags.farmAnalytics(farmId) (expired by services on order events)
 * - Operational lists: request-time (render inside Suspense)
 */

/** Variants "soft-removed" from a product because order_items still reference them. Hidden in farmer UI. */
export { REMOVED_VARIANT_SORT } from "@/config/catalog";
import { REMOVED_VARIANT_SORT } from "@/config/catalog";

/** farm_order statuses that count as a sale */
export const SOLD_STATUSES: FarmOrderStatus[] = ["paid", "preparing", "shipped", "delivered"];
/** farm_order statuses waiting for the farmer to ship */
export const TO_SHIP_STATUSES: FarmOrderStatus[] = ["paid", "preparing"];

const jstDay = sql<string>`to_char(${farmOrders.createdAt} at time zone 'Asia/Tokyo', 'YYYY-MM-DD')`;
const num = (v: unknown) => Number(v ?? 0);
const delta = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
const md = (ymd: YMD) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/* ───────────────────────── Analytics (cached) ───────────────────────── */

export async function getFarmAnalytics(farmId: string) {
  "use cache";
  cacheLife("dashboard");
  cacheTag(tags.farmAnalytics(farmId));

  const now = new Date();
  const today = toYmd(now);
  const start = addDays(today, -89);

  const dailyRows = await db
    .select({
      day: jstDay,
      sales: sql<number>`coalesce(sum(${farmOrders.subtotal}), 0)`.mapWith(Number),
      orders: count(),
    })
    .from(farmOrders)
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), gte(farmOrders.createdAt, fromYmd(start))))
    .groupBy(jstDay);
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const days = Array.from({ length: 90 }, (_, i) => {
    const d = addDays(start, i);
    const r = byDay.get(d);
    return { date: d, label: md(d), sales: r?.sales ?? 0, orders: r?.orders ?? 0 };
  });

  // weekly buckets (13 weeks ending today)
  const weeks: { label: string; sales: number; orders: number }[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const slice = days.slice(Math.max(0, end - 7), end);
    weeks.unshift({ label: `${slice[0].label}〜`, sales: slice.reduce((a, d) => a + d.sales, 0), orders: slice.reduce((a, d) => a + d.orders, 0) });
  }

  const cur = days.slice(60);
  const prev = days.slice(30, 60);
  const sum = (arr: typeof days, k: "sales" | "orders") => arr.reduce((a, d) => a + d[k], 0);
  const curSales = sum(cur, "sales");
  const prevSales = sum(prev, "sales");
  const curOrders = sum(cur, "orders");
  const prevOrders = sum(prev, "orders");
  const curAov = curOrders ? Math.round(curSales / curOrders) : 0;
  const prevAov = prevOrders ? Math.round(prevSales / prevOrders) : 0;
  const weeklyAov = weeks.map((w) => (w.orders ? Math.round(w.sales / w.orders) : 0));

  // ratings: last 30 vs previous 30 days
  const ratingWindow = async (from: YMD, to: YMD) => {
    const [r] = await db
      .select({ sum: sql<number>`coalesce(sum(${reviews.rating}), 0)`.mapWith(Number), n: count() })
      .from(reviews)
      .where(and(eq(reviews.farmId, farmId), eq(reviews.isPublished, true), gte(reviews.createdAt, fromYmd(from)), lt(reviews.createdAt, fromYmd(to))));
    return r.n ? r.sum / r.n : null;
  };
  const [allRatings] = await db
    .select({ sum: sql<number>`coalesce(sum(${reviews.rating}), 0)`.mapWith(Number), n: count() })
    .from(reviews)
    .where(and(eq(reviews.farmId, farmId), eq(reviews.isPublished, true)));
  const ratingCur = await ratingWindow(addDays(today, -29), addDays(today, 1));
  const ratingPrev = await ratingWindow(addDays(today, -59), addDays(today, -29));

  // product breakdown (90 days)
  const productRows = await db
    .select({
      name: orderItems.productName,
      sales: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`.mapWith(Number),
      qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(farmOrders, eq(farmOrders.id, orderItems.farmOrderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), gte(farmOrders.createdAt, fromYmd(start))))
    .groupBy(orderItems.productName)
    .orderBy(desc(sql`2`))
    .limit(8);

  // region (90 days) — by shipping zone
  const prefExpr = sql<string>`${orders.shippingAddress}->>'prefecture'`;
  const prefRows = await db
    .select({ prefecture: prefExpr, sales: sql<number>`coalesce(sum(${farmOrders.subtotal}), 0)`.mapWith(Number) })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), gte(farmOrders.createdAt, fromYmd(start))))
    .groupBy(prefExpr);
  const zoneTotals = new Map<ShippingZoneKey, number>();
  for (const r of prefRows) {
    const z = zoneOf(r.prefecture ?? "");
    zoneTotals.set(z, (zoneTotals.get(z) ?? 0) + r.sales);
  }
  const regions = [...zoneTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: shippingZones[key].label, value }));

  // monthly payout schedule: confirmed payouts + projection for unsettled orders (paid next month on payoutDay)
  const payoutRows = await db
    .select({ scheduledFor: payouts.scheduledFor, amount: payouts.amount, status: payouts.status })
    .from(payouts)
    .where(and(eq(payouts.farmId, farmId), gte(payouts.scheduledFor, addDays(today, -95))));
  const unsettled = await db
    .select({
      month: sql<string>`to_char(${farmOrders.createdAt} at time zone 'Asia/Tokyo', 'YYYY-MM')`,
      amount: sql<number>`coalesce(sum(${farmOrders.payoutAmount}), 0)`.mapWith(Number),
    })
    .from(farmOrders)
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), isNull(farmOrders.payoutId)))
    .groupBy(sql`1`);
  const thisMonth = monthKey(now);
  const monthsAhead = (ym: string, n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const schedule = new Map<string, { confirmed: number; projected: number }>();
  for (let i = -2; i <= 2; i++) schedule.set(monthsAhead(thisMonth, i), { confirmed: 0, projected: 0 });
  for (const p of payoutRows) {
    const k = p.scheduledFor?.slice(0, 7);
    if (k && schedule.has(k)) schedule.get(k)!.confirmed += p.amount;
  }
  for (const u of unsettled) {
    const k = monthsAhead(u.month, 1);
    if (schedule.has(k)) schedule.get(k)!.projected += u.amount;
  }
  const payoutSchedule = [...schedule.entries()].map(([ym, v]) => ({ label: `${Number(ym.slice(5))}月`, ...v }));

  return {
    generatedAt: now,
    kpi: {
      sales: { value: curSales, delta: delta(curSales, prevSales), trend: cur.map((d) => d.sales) },
      orders: { value: curOrders, delta: delta(curOrders, prevOrders), trend: cur.map((d) => d.orders) },
      aov: { value: curAov, delta: delta(curAov, prevAov), trend: weeklyAov },
      rating: {
        value: allRatings.n ? Math.round((allRatings.sum / allRatings.n) * 10) / 10 : 0,
        count: allRatings.n,
        delta: ratingCur != null && ratingPrev != null ? delta(ratingCur, ratingPrev) : null,
      },
    },
    daily: days.map((d) => ({ label: d.label, sales: d.sales, orders: d.orders })),
    weekly: weeks,
    products: productRows,
    regions,
    payoutSchedule,
  };
}
export type FarmAnalytics = Awaited<ReturnType<typeof getFarmAnalytics>>;

/** 12-month sales / commission / payout breakdown for the payouts page. */
export async function getFarmMonthlyFinance(farmId: string) {
  "use cache";
  cacheLife("dashboard");
  cacheTag(tags.farmAnalytics(farmId));

  const now = new Date();
  const monthExpr = sql<string>`to_char(${farmOrders.createdAt} at time zone 'Asia/Tokyo', 'YYYY-MM')`;
  const from = fromYmd(`${monthKey(new Date(now.getTime() - 334 * 86_400_000))}-01`);
  const rows = await db
    .select({
      month: monthExpr,
      gross: sql<number>`coalesce(sum(${farmOrders.subtotal}), 0)`.mapWith(Number),
      shipping: sql<number>`coalesce(sum(${farmOrders.shippingFee}), 0)`.mapWith(Number),
      commission: sql<number>`coalesce(sum(${farmOrders.commissionAmount}), 0)`.mapWith(Number),
      payout: sql<number>`coalesce(sum(${farmOrders.payoutAmount}), 0)`.mapWith(Number),
      orders: count(),
    })
    .from(farmOrders)
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), gte(farmOrders.createdAt, from)))
    .groupBy(monthExpr);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const out: { month: string; label: string; gross: number; shipping: number; commission: number; payout: number; orders: number }[] = [];
  const base = new Date(`${monthKey(now)}-15T00:00:00+09:00`);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - i);
    const k = monthKey(d);
    const r = byMonth.get(k);
    out.push({ month: k, label: `${Number(k.slice(5))}月`, gross: r?.gross ?? 0, shipping: r?.shipping ?? 0, commission: r?.commission ?? 0, payout: r?.payout ?? 0, orders: r?.orders ?? 0 });
  }
  return out;
}

/* ───────────────────────── Overview (request-time) ───────────────────────── */

export async function getFarmTodos(farmId: string, ownerId: string, today: YMD) {
  const [[newOrders], [dueToday], [overdue], [unread], [lowStock]] = await Promise.all([
    db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, farmId), eq(farmOrders.status, "paid"))),
    db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, TO_SHIP_STATUSES), eq(farmOrders.shipByDate, today))),
    db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, TO_SHIP_STATUSES), lt(farmOrders.shipByDate, today))),
    db.select({ n: count() }).from(messages).where(and(eq(messages.farmId, farmId), ne(messages.senderId, ownerId), isNull(messages.readAt))),
    db
      .select({ n: count() })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.farmId, farmId),
          eq(products.status, "active"),
          lt(productVariants.sortOrder, REMOVED_VARIANT_SORT),
          lte(productVariants.stock, catalogLimits.lowStockThreshold),
        ),
      ),
  ]);
  return { newOrders: newOrders.n, dueToday: dueToday.n, overdue: overdue.n, unreadMessages: unread.n, lowStock: lowStock.n };
}
export type FarmTodos = Awaited<ReturnType<typeof getFarmTodos>>;

export async function getUpcomingShipments(farmId: string, limit = 6) {
  const rows = await db
    .select({
      id: farmOrders.id,
      code: farmOrders.code,
      status: farmOrders.status,
      shipByDate: farmOrders.shipByDate,
      subtotal: farmOrders.subtotal,
      address: orders.shippingAddress,
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, TO_SHIP_STATUSES)))
    .orderBy(asc(farmOrders.shipByDate), asc(farmOrders.createdAt))
    .limit(limit);
  return rows.map(({ address, ...r }) => ({ ...r, recipientName: address.recipientName, prefecture: address.prefecture }));
}

/* ───────────────────────── Products ───────────────────────── */

export async function listFarmProducts(farmId: string) {
  const rows = await db.query.products.findMany({
    where: eq(products.farmId, farmId),
    orderBy: [asc(products.sortOrder), desc(products.createdAt)],
    with: {
      variants: { where: lt(productVariants.sortOrder, REMOVED_VARIANT_SORT), orderBy: asc(productVariants.sortOrder) },
      images: { orderBy: asc(productImages.sortOrder), limit: 1 },
    },
  });
  return rows.map((p) => {
    const prices = p.variants.map((v) => v.price);
    const stock = p.variants.reduce((a, v) => a + v.stock, 0);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      status: p.status,
      image: p.images[0]?.url ?? null,
      variantCount: p.variants.length,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      stock,
      lowStock: p.variants.some((v) => v.stock <= catalogLimits.lowStockThreshold),
      soldCount: p.soldCount,
      ratingSum: p.ratingSum,
      ratingCount: p.ratingCount,
      updatedAt: p.updatedAt,
    };
  });
}
export type FarmProductRow = Awaited<ReturnType<typeof listFarmProducts>>[number];

export async function getFarmProduct(farmId: string, productId: string) {
  return db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.farmId, farmId)),
    with: {
      variants: { where: lt(productVariants.sortOrder, REMOVED_VARIANT_SORT), orderBy: asc(productVariants.sortOrder) },
      images: { orderBy: asc(productImages.sortOrder) },
    },
  });
}
export type FarmProductDetail = NonNullable<Awaited<ReturnType<typeof getFarmProduct>>>;

export const productStatusFilters: (ProductStatus | "all")[] = ["all", "active", "draft", "soldout", "archived"];

/* ───────────────────────── Orders ───────────────────────── */

const orderListSelect = {
  id: farmOrders.id,
  code: farmOrders.code,
  status: farmOrders.status,
  createdAt: farmOrders.createdAt,
  subtotal: farmOrders.subtotal,
  shippingFee: farmOrders.shippingFee,
  shipByDate: farmOrders.shipByDate,
  estimatedDeliveryDate: farmOrders.estimatedDeliveryDate,
  carrier: farmOrders.carrier,
  trackingNumber: farmOrders.trackingNumber,
  boxSize: farmOrders.boxSize,
  boxCount: farmOrders.boxCount,
  totalWeightGrams: farmOrders.totalWeightGrams,
  labelPrintedAt: farmOrders.labelPrintedAt,
  address: orders.shippingAddress,
  desiredDeliveryDate: orders.desiredDeliveryDate,
  deliveryTimeSlot: orders.deliveryTimeSlot,
  gift: orders.gift,
  customerId: orders.userId,
};

async function itemsSummary(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; label: string; qty: number }[]>();
  const items = await db
    .select({ farmOrderId: orderItems.farmOrderId, name: orderItems.productName, label: orderItems.variantLabel, qty: orderItems.quantity })
    .from(orderItems)
    .where(inArray(orderItems.farmOrderId, ids));
  const map = new Map<string, { name: string; label: string; qty: number }[]>();
  for (const it of items) (map.get(it.farmOrderId) ?? map.set(it.farmOrderId, []).get(it.farmOrderId)!).push(it);
  return map;
}

export const orderTabStatuses = ["paid", "preparing", "shipped", "delivered", "cancelled"] as const satisfies readonly FarmOrderStatus[];
export type OrderTab = (typeof orderTabStatuses)[number];

export async function getFarmOrderCounts(farmId: string) {
  const rows = await db
    .select({ status: farmOrders.status, n: count() })
    .from(farmOrders)
    .where(eq(farmOrders.farmId, farmId))
    .groupBy(farmOrders.status);
  const map = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<FarmOrderStatus, number>>;
  return { ...map, cancelled: (map.cancelled ?? 0) + (map.refunded ?? 0) } as Partial<Record<FarmOrderStatus, number>>;
}

export async function listFarmOrders(farmId: string, tab: OrderTab) {
  const statuses: FarmOrderStatus[] = tab === "cancelled" ? ["cancelled", "refunded"] : [tab];
  const rows = await db
    .select(orderListSelect)
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, statuses)))
    .orderBy(tab === "paid" || tab === "preparing" ? asc(farmOrders.shipByDate) : desc(farmOrders.createdAt))
    .limit(500);
  const items = await itemsSummary(rows.map((r) => r.id));
  return rows.map(({ address, gift, ...r }) => ({
    ...r,
    recipientName: address.recipientName,
    prefecture: address.prefecture,
    hasGift: Boolean(gift && (gift.wrapping || gift.noshi || gift.message)),
    items: items.get(r.id) ?? [],
  }));
}
export type FarmOrderRow = Awaited<ReturnType<typeof listFarmOrders>>[number];

/** Paid + preparing orders for the 出荷センター (sorted by ship-by). */
export async function getShippingQueue(farmId: string) {
  const rows = await db
    .select(orderListSelect)
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, TO_SHIP_STATUSES)))
    .orderBy(asc(farmOrders.shipByDate), asc(farmOrders.createdAt))
    .limit(500);
  const items = await itemsSummary(rows.map((r) => r.id));
  return rows.map(({ address, ...r }) => ({
    ...r,
    recipientName: address.recipientName,
    prefecture: address.prefecture,
    city: address.city,
    items: items.get(r.id) ?? [],
  }));
}
export type ShippingQueueRow = Awaited<ReturnType<typeof getShippingQueue>>[number];

export async function getFarmOrder(farmId: string, farmOrderId: string) {
  const fo = await db.query.farmOrders.findFirst({
    where: and(eq(farmOrders.id, farmOrderId), eq(farmOrders.farmId, farmId)),
    with: {
      order: true,
      items: true,
      events: { orderBy: (t, { desc: d }) => d(t.occurredAt) },
    },
  });
  if (!fo) return null;
  const customer = await db.query.user.findFirst({ where: eq(user.id, fo.order.userId), columns: { id: true, name: true } });
  const { order, ...rest } = fo;
  return {
    ...rest,
    customer: { id: order.userId, name: customer?.name ?? order.shippingAddress.recipientName },
    order: {
      code: order.code,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      shippingAddress: order.shippingAddress,
      gift: order.gift,
      note: order.note,
      desiredDeliveryDate: order.desiredDeliveryDate,
      deliveryTimeSlot: order.deliveryTimeSlot,
    },
  };
}
export type FarmOrderDetail = NonNullable<Awaited<ReturnType<typeof getFarmOrder>>>;

/** Orders for printable 納品書 (only this farm's). Keeps the requested order. */
export async function getFarmOrdersForSlip(farmId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.query.farmOrders.findMany({
    where: and(eq(farmOrders.farmId, farmId), inArray(farmOrders.id, ids)),
    with: { order: true, items: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
}
export type SlipOrder = Awaited<ReturnType<typeof getFarmOrdersForSlip>>[number];

/** Rows for the carrier label CSV (only this farm's to-ship orders). */
export async function getLabelSources(farmId: string, ids: string[]) {
  return db.query.farmOrders.findMany({
    where: and(eq(farmOrders.farmId, farmId), inArray(farmOrders.id, ids), inArray(farmOrders.status, TO_SHIP_STATUSES)),
    with: { order: true },
    orderBy: asc(farmOrders.shipByDate),
  });
}

/** Records the label print time (idempotent; first print only). Not a status change. */
export async function markLabelsPrinted(farmId: string, ids: string[], now: Date) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    const first = await tx
      .update(farmOrders)
      .set({ labelPrintedAt: now })
      .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.id, ids), isNull(farmOrders.labelPrintedAt)))
      .returning({ id: farmOrders.id });
    if (first.length) {
      await tx.insert(shipmentEvents).values(
        first.map((f) => ({ farmOrderId: f.id, type: "label_created" as const, message: "送り状データを作成しました", source: "farmer", occurredAt: now })),
      );
    }
  });
}

/** Match parsed tracking CSV rows to this farm's orders by code. */
export async function matchOrdersByCode(farmId: string, codes: string[]) {
  if (!codes.length) return [];
  return db
    .select({
      id: farmOrders.id,
      code: farmOrders.code,
      status: farmOrders.status,
      carrier: farmOrders.carrier,
      recipientName: sql<string>`${orders.shippingAddress}->>'recipientName'`,
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.code, codes)));
}

/* ───────────────────────── Reviews ───────────────────────── */

export async function getFarmReviews(farmId: string, opts: { unrepliedOnly?: boolean } = {}) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      images: reviews.images,
      reply: reviews.reply,
      repliedAt: reviews.repliedAt,
      isPublished: reviews.isPublished,
      createdAt: reviews.createdAt,
      productId: reviews.productId,
      productName: products.name,
      productSlug: products.slug,
      customerId: reviews.userId,
      customerName: user.name,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(user, eq(user.id, reviews.userId))
    .where(and(eq(reviews.farmId, farmId), opts.unrepliedOnly ? isNull(reviews.reply) : undefined))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
  return rows;
}
export type FarmReview = Awaited<ReturnType<typeof getFarmReviews>>[number];

export async function getFarmReviewStats(farmId: string) {
  const rows = await db
    .select({ rating: reviews.rating, n: count(), unreplied: sql<number>`count(*) filter (where ${reviews.reply} is null)`.mapWith(Number) })
    .from(reviews)
    .where(and(eq(reviews.farmId, farmId), eq(reviews.isPublished, true)))
    .groupBy(reviews.rating);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.find((r) => r.rating === star)?.n ?? 0 }));
  const total = distribution.reduce((a, d) => a + d.count, 0);
  const sum = distribution.reduce((a, d) => a + d.star * d.count, 0);
  const unreplied = rows.reduce((a, r) => a + r.unreplied, 0);
  return { total, average: total ? sum / total : 0, distribution, unreplied };
}

export async function getLatestReviews(farmId: string, limit = 4) {
  return db
    .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, reply: reviews.reply, createdAt: reviews.createdAt, productName: products.name, customerName: user.name })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(user, eq(user.id, reviews.userId))
    .where(eq(reviews.farmId, farmId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/* ───────────────────────── Messages side panel ───────────────────────── */

export async function getCustomerOrdersWithFarm(farmId: string, customerId: string, limit = 5) {
  const rows = await db
    .select({ id: farmOrders.id, code: farmOrders.code, status: farmOrders.status, subtotal: farmOrders.subtotal, createdAt: farmOrders.createdAt })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), eq(orders.userId, customerId), ne(farmOrders.status, "pending_payment")))
    .orderBy(desc(farmOrders.createdAt))
    .limit(limit);
  const items = await itemsSummary(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, items: items.get(r.id) ?? [] }));
}

/** Only customers who have ordered from / messaged this farm may be addressed. */
export async function getFarmCustomer(farmId: string, customerId: string) {
  const [hasOrder] = await db
    .select({ n: count() })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), eq(orders.userId, customerId)));
  const [hasMessage] = await db.select({ n: count() }).from(messages).where(and(eq(messages.farmId, farmId), eq(messages.customerId, customerId)));
  if (!hasOrder.n && !hasMessage.n) return null;
  const c = await db.query.user.findFirst({ where: eq(user.id, customerId), columns: { id: true, name: true, createdAt: true } });
  return c ?? null;
}

/* ───────────────────────── Payouts ───────────────────────── */

export async function listFarmPayouts(farmId: string) {
  return db.select().from(payouts).where(eq(payouts.farmId, farmId)).orderBy(desc(payouts.periodStart)).limit(36);
}
export type FarmPayoutRow = Awaited<ReturnType<typeof listFarmPayouts>>[number];

export async function getPayoutOrders(farmId: string, payoutId: string) {
  return db
    .select({
      id: farmOrders.id,
      code: farmOrders.code,
      status: farmOrders.status,
      createdAt: farmOrders.createdAt,
      deliveredAt: farmOrders.deliveredAt,
      subtotal: farmOrders.subtotal,
      shippingFee: farmOrders.shippingFee,
      commissionAmount: farmOrders.commissionAmount,
      payoutAmount: farmOrders.payoutAmount,
    })
    .from(farmOrders)
    .where(and(eq(farmOrders.farmId, farmId), eq(farmOrders.payoutId, payoutId)))
    .orderBy(asc(farmOrders.createdAt));
}
export type PayoutOrderRow = Awaited<ReturnType<typeof getPayoutOrders>>[number];

/** This month's projected + unsettled amounts (request-time). */
export async function getUnsettledSummary(farmId: string, now: Date) {
  const monthStart = fromYmd(`${monthKey(now)}-01`);
  const [thisMonth] = await db
    .select({
      gross: sql<number>`coalesce(sum(${farmOrders.subtotal}), 0)`.mapWith(Number),
      payout: sql<number>`coalesce(sum(${farmOrders.payoutAmount}), 0)`.mapWith(Number),
      orders: count(),
    })
    .from(farmOrders)
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD_STATUSES), gte(farmOrders.createdAt, monthStart)));
  const [paidTotal] = await db
    .select({ amount: sql<number>`coalesce(sum(${payouts.amount}), 0)`.mapWith(Number) })
    .from(payouts)
    .where(and(eq(payouts.farmId, farmId), eq(payouts.status, "paid")));
  const [next] = await db
    .select({ amount: payouts.amount, scheduledFor: payouts.scheduledFor, status: payouts.status })
    .from(payouts)
    .where(and(eq(payouts.farmId, farmId), ne(payouts.status, "paid")))
    .orderBy(asc(payouts.scheduledFor))
    .limit(1);
  return { thisMonth: { gross: num(thisMonth.gross), payout: num(thisMonth.payout), orders: thisMonth.orders }, paidTotal: num(paidTotal.amount), next: next ?? null };
}

/** Published announcements for farmers (audience all | farmer), newest first. Shared, so cached. */
export async function getFarmerAnnouncements(limit = 3) {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.announcements);
  const rows = await db
    .select({ id: announcements.id, title: announcements.title, body: announcements.body, audience: announcements.audience, publishedAt: announcements.publishedAt })
    .from(announcements)
    .where(and(eq(announcements.isPublished, true), inArray(announcements.audience, ["all", "farmer"]), sql`${announcements.publishedAt} <= now()`))
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() }));
}

/**
 * 売上明細（CSV 書き出し用）。注文日で期間を切る＝会計期間の考え方に合わせる。
 * キャンセル・返金も含めて出す（帳簿では「なかったこと」にはできないため）。
 */
export async function getSalesRows(farmId: string, from: YMD, to: YMD) {
  const rows = await db
    .select({
      id: farmOrders.id,
      orderedAt: farmOrders.createdAt,
      orderCode: orders.code,
      farmOrderCode: farmOrders.code,
      status: farmOrders.status,
      address: orders.shippingAddress,
      subtotal: farmOrders.subtotal,
      shippingFee: farmOrders.shippingFee,
      discount: farmOrders.discount,
      commission: farmOrders.commissionAmount,
      payoutAmount: farmOrders.payoutAmount,
      refundedAt: farmOrders.refundedAt,
      shippedAt: farmOrders.shippedAt,
      deliveredAt: farmOrders.deliveredAt,
      payoutScheduledFor: payouts.scheduledFor,
      payoutPaidAt: payouts.paidAt,
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .leftJoin(payouts, eq(payouts.id, farmOrders.payoutId))
    .where(
      and(
        eq(farmOrders.farmId, farmId),
        ne(farmOrders.status, "pending_payment"), // 未決済はまだ売上ではない
        gte(farmOrders.createdAt, fromYmd(from)),
        lt(farmOrders.createdAt, fromYmd(addDays(to, 1))), // to の当日ぶんを含める
      ),
    )
    .orderBy(asc(farmOrders.createdAt))
    .limit(5000);
  const items = await itemsSummary(rows.map((r) => r.id));
  return rows.map(({ id, address, ...r }) => ({
    ...r,
    prefecture: address.prefecture,
    items: (items.get(id) ?? []).map((i) => `${i.name}（${i.label}）×${i.qty}`).join(" / "),
  }));
}

/** 振込先口座（#20）。口座番号は下4桁だけ */
export async function getFarmBankAccount(farmId: string) {
  return getMaskedBankAccount(farmId);
}
