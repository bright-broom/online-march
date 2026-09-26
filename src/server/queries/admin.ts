import "server-only";
import { and, count, countDistinct, desc, eq, gte, ilike, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { categoryKeys } from "@/config/catalog";
import { shippingZones, type ShippingZoneKey } from "@/config/shipping";
import { db } from "@/db";
import {
  adminAuditLogs,
  farmBankAccounts,
  announcements,
  coupons,
  farmOrders,
  farms,
  jobRuns,
  orderItems,
  orders,
  payouts,
  productVariants,
  products,
  reviews,
  user,
  type FarmOrderStatus,
  type OrderStatus,
  type ProductCategory,
  type UserRole,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { addDays, fromYmd, monthKey, toYmd, type YMD } from "@/lib/dates";
import { features } from "@/lib/env";
import { zoneOf } from "@/lib/shipping";
import { isJobName, jobs } from "@/server/jobs";
import type { PeriodDays } from "@/lib/validators/admin";
// vercel.json lives at the repo root (outside src/, so no "@/" alias).
import vercelConfig from "../../../vercel.json";

/**
 * 運営 (admin) read models.
 *  - Aggregate analytics: `"use cache"` + cacheLife("dashboard") + tags.analytics, keyed by explicit args
 *    (period, `nowIso` rounded to the hour by the page after `connection()`).
 *  - Lists / details: request-time (rendered inside Suspense after requireRole).
 */

/** farm_order statuses that count as sales (money captured, not reversed). */
const SOLD: FarmOrderStatus[] = ["paid", "preparing", "shipped", "delivered"];
const TZ_DAY = (col: unknown) => sql<string>`to_char(${col} at time zone 'Asia/Tokyo', 'YYYY-MM-DD')`;
const TZ_MONTH = (col: unknown) => sql<string>`to_char(${col} at time zone 'Asia/Tokyo', 'YYYY-MM')`;
const num = (v: unknown) => Number(v ?? 0);
const DAY_MS = 86_400_000;

const days = (fromYmdStr: YMD, n: number) => Array.from({ length: n }, (_, i) => addDays(fromYmdStr, i));
const md = (ymd: YMD) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const deltaOf = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / prev);

/* ───────────────────────── Overview analytics (cached) ───────────────────────── */

export async function getAdminAnalytics(period: PeriodDays, nowIso: string) {
  "use cache";
  cacheLife("dashboard");
  cacheTag(tags.analytics);

  const now = new Date(nowIso);
  const today = toYmd(now);
  const startYmd = addDays(today, -(period - 1));
  const prevStartYmd = addDays(startYmd, -period);
  const end = fromYmd(addDays(today, 1));
  const start = fromYmd(startYmd);
  const prevStart = fromYmd(prevStartYmd);

  const soldInRange = (from: Date, to: Date) =>
    and(inArray(farmOrders.status, SOLD), gte(orders.paidAt, from), lt(orders.paidAt, to));

  const dayExpr = TZ_DAY(orders.paidAt);
  const userDayExpr = TZ_DAY(user.createdAt);
  const firstMonth = shiftMonth(monthKey(now), -11);
  const monthExpr = TZ_MONTH(user.createdAt);

  const [daily, userDaily, farmsCur, farmsPrev, ranking, byCategory, byPref, byStatus, members, [overdue], [pendingFarms]] =
    await Promise.all([
      db
        .select({
          d: dayExpr,
          gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number),
          commission: sql<number>`coalesce(sum(${farmOrders.commissionAmount}), 0)`.mapWith(Number),
          orders: countDistinct(orders.id),
        })
        .from(farmOrders)
        .innerJoin(orders, eq(orders.id, farmOrders.orderId))
        .where(soldInRange(prevStart, end))
        .groupBy(dayExpr),
      db.select({ d: userDayExpr, n: count() }).from(user).where(and(gte(user.createdAt, prevStart), lt(user.createdAt, end))).groupBy(userDayExpr),
      db.select({ n: countDistinct(farmOrders.farmId) }).from(farmOrders).innerJoin(orders, eq(orders.id, farmOrders.orderId)).where(soldInRange(start, end)),
      db.select({ n: countDistinct(farmOrders.farmId) }).from(farmOrders).innerJoin(orders, eq(orders.id, farmOrders.orderId)).where(soldInRange(prevStart, start)),
      db
        .select({
          farmId: farms.id,
          name: farms.name,
          gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number),
          orders: count(),
        })
        .from(farmOrders)
        .innerJoin(orders, eq(orders.id, farmOrders.orderId))
        .innerJoin(farms, eq(farms.id, farmOrders.farmId))
        .where(soldInRange(start, end))
        .groupBy(farms.id, farms.name)
        .orderBy(desc(sql`3`))
        .limit(8),
      db
        .select({ category: products.category, amount: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`.mapWith(Number) })
        .from(orderItems)
        .innerJoin(farmOrders, eq(farmOrders.id, orderItems.farmOrderId))
        .innerJoin(orders, eq(orders.id, farmOrders.orderId))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(soldInRange(start, end))
        .groupBy(products.category),
      db
        .select({
          pref: sql<string>`${orders.shippingAddress}->>'prefecture'`,
          orders: count(),
          amount: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
        })
        .from(orders)
        .where(and(isNotNull(orders.paidAt), gte(orders.paidAt, start), lt(orders.paidAt, end)))
        .groupBy(sql`1`),
      db
        .select({ status: farmOrders.status, n: count() })
        .from(farmOrders)
        .where(and(gte(farmOrders.createdAt, start), lt(farmOrders.createdAt, end)))
        .groupBy(farmOrders.status),
      db
        .select({ m: monthExpr, role: user.role, n: count() })
        .from(user)
        .where(and(gte(user.createdAt, fromYmd(`${firstMonth}-01`)), lt(user.createdAt, end)))
        .groupBy(monthExpr, user.role),
      db.select({ n: count() }).from(farmOrders).where(and(inArray(farmOrders.status, ["paid", "preparing"]), lt(farmOrders.shipByDate, today))),
      db.select({ n: count() }).from(farms).where(eq(farms.status, "pending")),
    ]);

  // ── daily series (current + previous windows)
  const dayMap = new Map(daily.map((r) => [r.d, r]));
  const userMap = new Map(userDaily.map((r) => [r.d, r.n]));
  const curDays = days(startYmd, period);
  const prevDays = days(prevStartYmd, period);
  const pick = (ds: YMD[]) =>
    ds.map((d) => {
      const r = dayMap.get(d);
      return { d, gmv: r?.gmv ?? 0, commission: r?.commission ?? 0, orders: r?.orders ?? 0, users: userMap.get(d) ?? 0 };
    });
  const cur = pick(curDays);
  const prev = pick(prevDays);
  const sum = (rows: typeof cur, k: "gmv" | "commission" | "orders" | "users") => rows.reduce((a, r) => a + r[k], 0);

  // Sparklines: bucket to ≤ 15 points so 90-day lines stay readable.
  const bucket = Math.max(1, Math.ceil(period / 15));
  const spark = (k: "gmv" | "commission" | "orders" | "users" | "aov") => {
    const out: number[] = [];
    for (let i = 0; i < cur.length; i += bucket) {
      const slice = cur.slice(i, i + bucket);
      if (k === "aov") {
        const o = slice.reduce((a, r) => a + r.orders, 0);
        out.push(o ? Math.round(slice.reduce((a, r) => a + r.gmv, 0) / o) : 0);
      } else out.push(slice.reduce((a, r) => a + r[k], 0));
    }
    return out;
  };

  const gmv = sum(cur, "gmv");
  const gmvPrev = sum(prev, "gmv");
  const ordersCur = sum(cur, "orders");
  const ordersPrev = sum(prev, "orders");
  const aov = ordersCur ? Math.round(gmv / ordersCur) : 0;
  const aovPrev = ordersPrev ? Math.round(gmvPrev / ordersPrev) : 0;

  const kpis = {
    gmv: { value: gmv, delta: deltaOf(gmv, gmvPrev), trend: spark("gmv") },
    commission: { value: sum(cur, "commission"), delta: deltaOf(sum(cur, "commission"), sum(prev, "commission")), trend: spark("commission") },
    orders: { value: ordersCur, delta: deltaOf(ordersCur, ordersPrev), trend: spark("orders") },
    aov: { value: aov, delta: deltaOf(aov, aovPrev), trend: spark("aov") },
    newUsers: { value: sum(cur, "users"), delta: deltaOf(sum(cur, "users"), sum(prev, "users")), trend: spark("users") },
    activeFarms: { value: farmsCur[0]?.n ?? 0, delta: deltaOf(farmsCur[0]?.n ?? 0, farmsPrev[0]?.n ?? 0) },
    overdueShipments: overdue.n,
    pendingFarms: pendingFarms.n,
  };

  // ── breakdowns
  const catMap = new Map(byCategory.map((r) => [r.category, r.amount]));
  const categoryBreakdown = categoryKeys.map((k: ProductCategory) => ({ key: k, amount: catMap.get(k) ?? 0 }));

  const zoneAgg = new Map<ShippingZoneKey, { orders: number; amount: number }>();
  for (const r of byPref) {
    const z = zoneOf(r.pref ?? "");
    const a = zoneAgg.get(z) ?? { orders: 0, amount: 0 };
    a.orders += r.orders;
    a.amount += r.amount;
    zoneAgg.set(z, a);
  }
  const zoneBreakdown = (Object.keys(shippingZones) as ShippingZoneKey[]).map((z) => ({ key: z, ...(zoneAgg.get(z) ?? { orders: 0, amount: 0 }) }));

  const statusBreakdown = byStatus.map((r) => ({ status: r.status, count: r.n }));

  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(firstMonth, i));
  const memberRows = months.map((m) => ({
    month: m,
    customer: members.filter((r) => r.m === m && r.role === "customer").reduce((a, r) => a + r.n, 0),
    farmer: members.filter((r) => r.m === m && r.role === "farmer").reduce((a, r) => a + r.n, 0),
  }));

  return {
    period,
    range: { start: startYmd, end: today },
    kpis,
    trend: cur.map((r) => ({ date: md(r.d), gmv: r.gmv, commission: r.commission })),
    ranking: ranking.map((r) => ({ farmId: r.farmId, name: r.name, gmv: r.gmv, orders: r.orders })),
    categoryBreakdown,
    zoneBreakdown,
    statusBreakdown,
    members: memberRows,
  };
}
export type AdminAnalytics = Awaited<ReturnType<typeof getAdminAnalytics>>;

/** Monthly sales of one farm (12 months) — farm detail chart. */
export async function getFarmSalesSeries(farmId: string, nowIso: string) {
  "use cache";
  cacheLife("dashboard");
  cacheTag(tags.analytics, tags.farmAnalytics(farmId));
  const now = new Date(nowIso);
  const firstMonth = shiftMonth(monthKey(now), -11);
  const m = TZ_MONTH(orders.paidAt);
  const rows = await db
    .select({
      m,
      gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number),
      commission: sql<number>`coalesce(sum(${farmOrders.commissionAmount}), 0)`.mapWith(Number),
      orders: count(),
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, SOLD), gte(orders.paidAt, fromYmd(`${firstMonth}-01`))))
    .groupBy(m);
  const map = new Map(rows.map((r) => [r.m, r]));
  return Array.from({ length: 12 }, (_, i) => {
    const key = shiftMonth(firstMonth, i);
    const r = map.get(key);
    return { month: `${Number(key.slice(5))}月`, gmv: r?.gmv ?? 0, commission: r?.commission ?? 0, orders: r?.orders ?? 0 };
  });
}

/* ───────────────────────── Overview: needs attention (request-time) ───────────────────────── */

export async function getAdminAttention(now: Date) {
  const today = toYmd(now);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const [pending, overdue, failedJobs, lowReviews] = await Promise.all([
    db
      .select({ id: farms.id, name: farms.name, representative: farms.representative, city: farms.city, createdAt: farms.createdAt, ownerEmail: user.email })
      .from(farms)
      .innerJoin(user, eq(user.id, farms.ownerId))
      .where(eq(farms.status, "pending"))
      .orderBy(farms.createdAt)
      .limit(10),
    db
      .select({ id: farmOrders.id, code: farmOrders.code, orderId: farmOrders.orderId, status: farmOrders.status, shipByDate: farmOrders.shipByDate, farmName: farms.name })
      .from(farmOrders)
      .innerJoin(farms, eq(farms.id, farmOrders.farmId))
      .where(and(inArray(farmOrders.status, ["paid", "preparing"]), lt(farmOrders.shipByDate, today)))
      .orderBy(farmOrders.shipByDate)
      .limit(10),
    db.select().from(jobRuns).where(and(eq(jobRuns.status, "error"), gte(jobRuns.startedAt, weekAgo))).orderBy(desc(jobRuns.startedAt)).limit(5),
    db
      .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, isPublished: reviews.isPublished, createdAt: reviews.createdAt, productName: products.name, farmName: farms.name })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .innerJoin(farms, eq(farms.id, reviews.farmId))
      .where(and(lte(reviews.rating, 2), gte(reviews.createdAt, twoWeeksAgo)))
      .orderBy(desc(reviews.createdAt))
      .limit(5),
  ]);
  return {
    pending,
    overdue: overdue.map((o) => ({ ...o, daysLate: o.shipByDate ? Math.round((fromYmd(today).getTime() - fromYmd(o.shipByDate).getTime()) / DAY_MS) : 0 })),
    failedJobs: failedJobs.map((r) => ({ ...r, label: jobLabel(r.job) })),
    lowReviews,
  };
}
export type AdminAttention = Awaited<ReturnType<typeof getAdminAttention>>;

/* ───────────────────────── Farms ───────────────────────── */

export async function getAdminFarms(now: Date) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [rows, productCounts, sales] = await Promise.all([
    db
      .select({ farm: farms, ownerName: user.name, ownerEmail: user.email, ownerRole: user.role })
      .from(farms)
      .innerJoin(user, eq(user.id, farms.ownerId))
      .orderBy(desc(farms.createdAt)),
    db.select({ farmId: products.farmId, n: count() }).from(products).where(ne(products.status, "archived")).groupBy(products.farmId),
    db
      .select({ farmId: farmOrders.farmId, gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number) })
      .from(farmOrders)
      .innerJoin(orders, eq(orders.id, farmOrders.orderId))
      .where(and(inArray(farmOrders.status, SOLD), gte(orders.paidAt, since)))
      .groupBy(farmOrders.farmId),
  ]);
  const pc = new Map(productCounts.map((r) => [r.farmId, r.n]));
  const sm = new Map(sales.map((r) => [r.farmId, r.gmv]));
  return rows.map(({ farm: f, ownerName, ownerEmail, ownerRole }) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    representative: f.representative,
    ownerName,
    ownerEmail,
    ownerRole,
    city: f.city,
    status: f.status,
    commissionRateBps: f.commissionRateBps,
    isFeatured: f.isFeatured,
    ratingSum: f.ratingSum,
    ratingCount: f.ratingCount,
    products: pc.get(f.id) ?? 0,
    sales30d: sm.get(f.id) ?? 0,
    createdAt: f.createdAt,
    approvedAt: f.approvedAt,
    stripeOnboarded: f.stripeOnboarded,
  }));
}
export type AdminFarmRow = Awaited<ReturnType<typeof getAdminFarms>>[number];

export async function getAdminFarmDetail(id: string, now: Date) {
  const farm = await db.query.farms.findFirst({ where: eq(farms.id, id), with: { owner: true } });
  if (!farm) return null;
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [productRows, recentOrders, payoutRows, [lifetime], [last30], [open], [onTime]] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        category: products.category,
        status: products.status,
        soldCount: products.soldCount,
        ratingSum: products.ratingSum,
        ratingCount: products.ratingCount,
        minPrice: sql<number>`min(${productVariants.price})`.mapWith(Number),
        maxPrice: sql<number>`max(${productVariants.price})`.mapWith(Number),
        stock: sql<number>`coalesce(sum(${productVariants.stock}), 0)`.mapWith(Number),
      })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .where(eq(products.farmId, id))
      .groupBy(products.id)
      .orderBy(desc(products.soldCount)),
    db
      .select({
        id: farmOrders.id,
        code: farmOrders.code,
        orderId: farmOrders.orderId,
        status: farmOrders.status,
        subtotal: farmOrders.subtotal,
        shippingFee: farmOrders.shippingFee,
        commissionAmount: farmOrders.commissionAmount,
        shipByDate: farmOrders.shipByDate,
        createdAt: farmOrders.createdAt,
        customer: sql<string>`${orders.shippingAddress}->>'recipientName'`,
      })
      .from(farmOrders)
      .innerJoin(orders, eq(orders.id, farmOrders.orderId))
      .where(eq(farmOrders.farmId, id))
      .orderBy(desc(farmOrders.createdAt))
      .limit(12),
    db.select().from(payouts).where(eq(payouts.farmId, id)).orderBy(desc(payouts.periodEnd)).limit(12),
    db
      .select({
        gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number),
        commission: sql<number>`coalesce(sum(${farmOrders.commissionAmount}), 0)`.mapWith(Number),
        n: count(),
      })
      .from(farmOrders)
      .where(and(eq(farmOrders.farmId, id), inArray(farmOrders.status, SOLD))),
    db
      .select({ gmv: sql<number>`coalesce(sum(${farmOrders.subtotal} + ${farmOrders.shippingFee}), 0)`.mapWith(Number), n: count() })
      .from(farmOrders)
      .innerJoin(orders, eq(orders.id, farmOrders.orderId))
      .where(and(eq(farmOrders.farmId, id), inArray(farmOrders.status, SOLD), gte(orders.paidAt, since))),
    db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, id), inArray(farmOrders.status, ["paid", "preparing"]))),
    db
      .select({
        shipped: count(),
        onTime: sql<number>`count(*) filter (where ${farmOrders.shipByDate} is null or to_char(${farmOrders.shippedAt} at time zone 'Asia/Tokyo', 'YYYY-MM-DD') <= ${farmOrders.shipByDate}::text)`.mapWith(Number),
      })
      .from(farmOrders)
      .where(and(eq(farmOrders.farmId, id), isNotNull(farmOrders.shippedAt))),
  ]);
  const { owner, ...rest } = farm;
  return {
    farm: rest,
    owner: { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, role: owner.role, createdAt: owner.createdAt },
    products: productRows,
    recentOrders,
    payouts: payoutRows,
    kpis: {
      lifetimeGmv: num(lifetime?.gmv),
      lifetimeCommission: num(lifetime?.commission),
      lifetimeOrders: num(lifetime?.n),
      gmv30d: num(last30?.gmv),
      orders30d: num(last30?.n),
      openOrders: num(open?.n),
      onTimeRate: onTime && onTime.shipped ? onTime.onTime / onTime.shipped : null,
    },
  };
}
export type AdminFarmDetail = NonNullable<Awaited<ReturnType<typeof getAdminFarmDetail>>>;

/* ───────────────────────── Products & reviews ───────────────────────── */

export async function getAdminProducts() {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      category: products.category,
      status: products.status,
      isFeatured: products.isFeatured,
      soldCount: products.soldCount,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      updatedAt: products.updatedAt,
      farmId: farms.id,
      farmName: farms.name,
      farmStatus: farms.status,
      image: sql<string | null>`(select pi.url from product_images pi where pi.product_id = ${products.id} order by pi.sort_order limit 1)`,
      minPrice: sql<number | null>`min(${productVariants.price})`,
      maxPrice: sql<number | null>`max(${productVariants.price})`,
      stock: sql<number>`coalesce(sum(${productVariants.stock}), 0)`.mapWith(Number),
    })
    .from(products)
    .innerJoin(farms, eq(farms.id, products.farmId))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .groupBy(products.id, farms.id)
    .orderBy(desc(products.updatedAt));
  return rows.map((r) => ({ ...r, minPrice: r.minPrice == null ? null : Number(r.minPrice), maxPrice: r.maxPrice == null ? null : Number(r.maxPrice) }));
}
export type AdminProductRow = Awaited<ReturnType<typeof getAdminProducts>>[number];

export async function getAdminReviews(limit = 200) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      images: reviews.images,
      reply: reviews.reply,
      isPublished: reviews.isPublished,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
      farmName: farms.name,
      userName: user.name,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(farms, eq(farms.id, reviews.farmId))
    .innerJoin(user, eq(user.id, reviews.userId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}
export type AdminReviewRow = Awaited<ReturnType<typeof getAdminReviews>>[number];

/* ───────────────────────── Orders ───────────────────────── */

/** 検索語を ILIKE の部分一致に（% と _ はそのままの文字として扱う） */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * 運営の注文一覧。`q` は注文番号・メール・会員名・お届け先の名前をサーバー側で探す（#21。以前は最新500件の中だけを画面で絞っていた）。
 */
export async function getAdminOrders(status?: OrderStatus, limit = 500, q?: string) {
  const like = q ? likeOf(q) : null;
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: orders.id,
        code: orders.code,
        createdAt: orders.createdAt,
        status: orders.status,
        total: orders.total,
        paymentProvider: orders.paymentProvider,
        email: orders.email,
        customerName: user.name,
        prefecture: sql<string>`${orders.shippingAddress}->>'prefecture'`,
        farmCount: sql<number>`(select count(*) from farm_orders f where f.order_id = ${orders.id})`.mapWith(Number),
        openCount: sql<number>`(select count(*) from farm_orders f where f.order_id = ${orders.id} and f.status in ('paid','preparing','shipped'))`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(user, eq(user.id, orders.userId))
      .where(
        and(
          status ? eq(orders.status, status) : undefined,
          like
            ? or(ilike(orders.code, like), ilike(orders.email, like), ilike(user.name, like), sql`${orders.shippingAddress}->>'recipientName' ilike ${like}`)
            : undefined,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(limit),
    db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status),
  ]);
  return { rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<OrderStatus, number>> };
}
export type AdminOrderRow = Awaited<ReturnType<typeof getAdminOrders>>["rows"][number];

export async function getAdminOrder(id: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      user: { columns: { id: true, name: true, email: true, phone: true, createdAt: true } },
      farmOrders: {
        with: {
          farm: { columns: { id: true, name: true, slug: true, city: true, stripeOnboarded: true } },
          items: true,
          events: { orderBy: (e, { asc }) => asc(e.occurredAt) },
        },
        orderBy: (f, { asc }) => asc(f.code),
      },
    },
  });
  return order ?? null;
}
export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;

/* ───────────────────────── Users ───────────────────────── */

/** 運営のユーザー一覧。`q` は名前・メール・農園名をサーバー側で探す（#21） */
export async function getAdminUsers(q?: string, limit = 500) {
  const like = q ? likeOf(q) : null;
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      deletedAt: user.deletedAt,
      farmId: farms.id,
      farmName: farms.name,
      orders: sql<number>`(select count(*) from orders o where o.user_id = ${user.id} and o.paid_at is not null)`.mapWith(Number),
      spend: sql<number>`(select coalesce(sum(o.total), 0) from orders o where o.user_id = ${user.id} and o.status = 'paid')`.mapWith(Number),
    })
    .from(user)
    .leftJoin(farms, eq(farms.ownerId, user.id))
    .where(like ? or(ilike(user.name, like), ilike(user.email, like), ilike(farms.name, like)) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit);
  const counts = rows.reduce<Partial<Record<UserRole, number>>>((a, r) => ({ ...a, [r.role]: (a[r.role] ?? 0) + 1 }), {});
  return { rows, counts };
}
export type AdminUserRow = Awaited<ReturnType<typeof getAdminUsers>>["rows"][number];

/* ───────────────────────── Payouts ───────────────────────── */

export async function getAdminPayouts(now: Date) {
  const rows = await db
    .select({
      p: payouts,
      farmName: farms.name,
      farmId: farms.id,
      stripeOnboarded: farms.stripeOnboarded,
      stripeAccountId: farms.stripeAccountId,
      // 振込先口座（#20）: 下4桁まで。全桁は revealFarmBankAccount（操作記録つき）
      bank: { bankName: farmBankAccounts.bankName, bankCode: farmBankAccounts.bankCode, branchName: farmBankAccounts.branchName, branchCode: farmBankAccounts.branchCode, accountType: farmBankAccounts.accountType, accountNumberLast4: farmBankAccounts.accountNumberLast4, holderKana: farmBankAccounts.holderKana },
    })
    .from(payouts)
    .innerJoin(farms, eq(farms.id, payouts.farmId))
    .leftJoin(farmBankAccounts, eq(farmBankAccounts.farmId, farms.id))
    .orderBy(desc(payouts.periodEnd), farms.name);
  const ids = rows.map((r) => r.p.id);
  const items = ids.length
    ? await db
        .select({
          id: farmOrders.id,
          payoutId: farmOrders.payoutId,
          code: farmOrders.code,
          orderId: farmOrders.orderId,
          deliveredAt: farmOrders.deliveredAt,
          subtotal: farmOrders.subtotal,
          shippingFee: farmOrders.shippingFee,
          commissionAmount: farmOrders.commissionAmount,
          commissionRateBps: farmOrders.commissionRateBps,
          payoutAmount: farmOrders.payoutAmount,
        })
        .from(farmOrders)
        .where(inArray(farmOrders.payoutId, ids))
        .orderBy(farmOrders.deliveredAt)
    : [];
  const byPayout = new Map<string, typeof items>();
  for (const it of items) if (it.payoutId) (byPayout.get(it.payoutId) ?? byPayout.set(it.payoutId, []).get(it.payoutId)!).push(it);

  const month = monthKey(now);
  const list = rows.map(({ p, farmName, farmId, stripeOnboarded, stripeAccountId, bank }) => ({
    ...p,
    farmName,
    farmId,
    stripeOnboarded,
    /** Stripe sends this farm's payouts by itself; a manual bank transfer is only for a recorded failure (#13). */
    autoTransfer: features.stripe && stripeOnboarded && Boolean(stripeAccountId),
    /** Stripe may already hold a transfer for this farm, so the manual mark checks Stripe first. */
    hasStripeAccount: features.stripe && Boolean(stripeAccountId),
    bankAccount: bank?.accountNumberLast4 ? bank : null,
    items: byPayout.get(p.id) ?? [],
  }));
  const summary = {
    scheduledTotal: list.filter((p) => p.status !== "paid").reduce((a, p) => a + p.amount, 0),
    scheduledCount: list.filter((p) => p.status !== "paid").length,
    paidThisMonth: list.filter((p) => p.status === "paid" && p.paidAt && monthKey(p.paidAt) === month).reduce((a, p) => a + p.amount, 0),
    commissionTotal: list.reduce((a, p) => a + p.commission, 0),
    commissionThisYear: list.filter((p) => p.periodEnd.slice(0, 4) === month.slice(0, 4)).reduce((a, p) => a + p.commission, 0),
  };
  return { list, summary };
}
export type AdminPayoutRow = Awaited<ReturnType<typeof getAdminPayouts>>["list"][number];

/* ───────────────────────── Coupons / announcements ───────────────────────── */

export async function getAdminCoupons() {
  return db.select().from(coupons).orderBy(desc(coupons.createdAt));
}

export async function getAdminAnnouncements() {
  return db.select().from(announcements).orderBy(desc(announcements.publishedAt));
}

/* ───────────────────────── Automation ───────────────────────── */

const jobLabel = (name: string) => (isJobName(name) ? jobs[name].label : name);

/** Static job registry (label / description / schedule + vercel.json cron) — serializable for client components. */
export function getJobCatalog() {
  const crons = (vercelConfig.crons ?? []) as { path: string; schedule: string }[];
  return (Object.keys(jobs) as (keyof typeof jobs)[]).map((name) => {
    const path = `/api/cron/${name}`;
    return {
      name,
      label: jobs[name].label,
      description: jobs[name].description,
      schedule: jobs[name].schedule,
      path,
      cron: crons.find((c) => c.path === path)?.schedule ?? null,
    };
  });
}
export type JobCatalogEntry = ReturnType<typeof getJobCatalog>[number];

export async function getJobRuns(limit = 300) {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit);
}
export type JobRunRow = Awaited<ReturnType<typeof getJobRuns>>[number];

/** 運営の操作記録（#19）。新しい順。request-time（ページが requireRole の後に呼ぶ） */
export async function getAuditLogs(limit = 1000) {
  return db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit);
}

/**
 * 運営向け会計CSV（#21）の明細。1行 = 1出荷単位。注文日（JST）で月を切り、未決済は除く（キャンセル・返金は含める）。
 * ダウンロードのたびに最新を読むので "use cache" は付けない（生産者の売上明細 getSalesRows と同じ）。
 */
export async function getAccountingRows(month: string) {
  const from = `${month}-01` as YMD;
  const next = monthKey(new Date(fromYmd(from).getTime() + 32 * 86_400_000));
  return db
    .select({
      orderedAt: farmOrders.createdAt,
      orderCode: orders.code,
      farmOrderCode: farmOrders.code,
      farmName: farms.name,
      status: farmOrders.status,
      paymentMethod: orders.paymentMethod,
      subtotal: farmOrders.subtotal,
      shippingFee: farmOrders.shippingFee,
      discount: farmOrders.discount,
      commission: farmOrders.commissionAmount,
      payoutAmount: farmOrders.payoutAmount,
      refundAmount: farmOrders.refundAmount,
      refundedAt: farmOrders.refundedAt,
      payoutScheduledFor: payouts.scheduledFor,
      payoutPaidAt: payouts.paidAt,
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .innerJoin(farms, eq(farms.id, farmOrders.farmId))
    .leftJoin(payouts, eq(payouts.id, farmOrders.payoutId))
    .where(
      and(
        ne(farmOrders.status, "pending_payment"),
        gte(farmOrders.createdAt, fromYmd(from)),
        lt(farmOrders.createdAt, fromYmd(`${next}-01` as YMD)),
      ),
    )
    .orderBy(farmOrders.createdAt, farmOrders.code);
}
