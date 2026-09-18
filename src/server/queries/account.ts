import "server-only";
import { and, count, desc, eq, inArray, isNull, ne, sql, sum } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import {
  addresses,
  announcements,
  farmFollows,
  farmOrders,
  farms,
  favorites,
  messages,
  orderItems,
  orders,
  productImages,
  products,
  productVariants,
  reviews,
  user,
  type FarmOrderStatus,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";

/**
 * Customer マイページ / checkout read models.
 * All functions are request-time (NOT cached) and MUST be called with the session user's id —
 * every query is scoped by `userId` for authorization.
 */

const ACTIVE_FO: FarmOrderStatus[] = ["paid", "preparing", "shipped"];

/* ───────────── dashboard ───────────── */

export async function getMypageStats(userId: string) {
  const [[o], [fav], [unread]] = await Promise.all([
    db
      .select({ n: count(), total: sum(orders.total).mapWith(Number) })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, "paid"))),
    db.select({ n: count() }).from(favorites).where(eq(favorites.userId, userId)),
    db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.customerId, userId), ne(messages.senderId, userId), isNull(messages.readAt))),
  ]);
  return { orderCount: o.n, totalSpent: o.total ?? 0, favoriteCount: fav.n, unreadMessages: unread.n };
}

/** Farm orders currently on their way (paid → shipped). */
export async function listActiveShipments(userId: string) {
  const rows = await db
    .select({
      id: farmOrders.id,
      orderId: farmOrders.orderId,
      code: farmOrders.code,
      status: farmOrders.status,
      carrier: farmOrders.carrier,
      trackingNumber: farmOrders.trackingNumber,
      estimatedDeliveryDate: farmOrders.estimatedDeliveryDate,
      shipByDate: farmOrders.shipByDate,
      farmName: farms.name,
      farmId: farms.id,
    })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .innerJoin(farms, eq(farms.id, farmOrders.farmId))
    .where(and(eq(orders.userId, userId), inArray(farmOrders.status, ACTIVE_FO)))
    .orderBy(farmOrders.estimatedDeliveryDate);
  const items = rows.length
    ? await db
        .select({ farmOrderId: orderItems.farmOrderId, name: orderItems.productName, imageUrl: orderItems.imageUrl, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.farmOrderId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.farmOrderId === r.id) }));
}
export type ActiveShipment = Awaited<ReturnType<typeof listActiveShipments>>[number];

/** New products from farms the customer follows. */
export async function listFollowedFarmProducts(userId: string, limit = 6) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      farmName: farms.name,
      publishedAt: products.publishedAt,
      price: sql<number>`(select min(${productVariants.price}) from ${productVariants} where ${productVariants.productId} = ${products.id})`.mapWith(Number),
      imageUrl: sql<string | null>`(select ${productImages.url} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder} limit 1)`,
    })
    .from(farmFollows)
    .innerJoin(farms, eq(farms.id, farmFollows.farmId))
    .innerJoin(products, eq(products.farmId, farms.id))
    .where(and(eq(farmFollows.userId, userId), eq(products.status, "active"), eq(farms.status, "active")))
    .orderBy(desc(products.publishedAt), desc(products.createdAt))
    .limit(limit);
  return rows;
}

/** Published announcements for customers (not user-specific → cached). */
export async function getCustomerAnnouncements(limit = 3) {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.announcements);
  return db
    .select({ id: announcements.id, title: announcements.title, body: announcements.body, publishedAt: announcements.publishedAt })
    .from(announcements)
    .where(and(eq(announcements.isPublished, true), inArray(announcements.audience, ["all", "customer"])))
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

/* ───────────── orders ───────────── */

export type OrderListFilter = "all" | "active" | "completed" | "cancelled";

export async function listOrders(userId: string, limit?: number) {
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: (t, { desc: d }) => d(t.createdAt),
    limit,
    columns: { id: true, code: true, status: true, total: true, createdAt: true, desiredDeliveryDate: true },
    with: {
      farmOrders: {
        columns: { id: true, status: true, estimatedDeliveryDate: true },
        with: {
          farm: { columns: { name: true } },
          items: { columns: { id: true, productName: true, imageUrl: true, quantity: true } },
        },
      },
    },
  });
  return rows.map((o) => {
    const statuses = o.farmOrders.map((f) => f.status);
    const live = statuses.filter((s) => s !== "cancelled" && s !== "refunded");
    const group: Exclude<OrderListFilter, "all"> =
      o.status === "cancelled" || o.status === "refunded" || live.length === 0
        ? "cancelled"
        : live.every((s) => s === "delivered")
          ? "completed"
          : "active";
    return {
      ...o,
      group,
      itemCount: o.farmOrders.reduce((a, f) => a + f.items.reduce((b, i) => b + i.quantity, 0), 0),
      thumbnails: o.farmOrders.flatMap((f) => f.items).map((i) => ({ id: i.id, name: i.productName, url: i.imageUrl })).slice(0, 4),
    };
  });
}
export type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number];

export async function getOrderDetail(userId: string, orderId: string) {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    columns: {
      stripeSessionId: false,
      stripePaymentIntentId: false,
      userId: false,
    },
    with: {
      farmOrders: {
        columns: {
          id: true, code: true, status: true, subtotal: true, shippingFee: true, discount: true, carrier: true,
          boxSize: true, boxCount: true, trackingNumber: true, shipByDate: true, estimatedDeliveryDate: true,
          shippedAt: true, deliveredAt: true, cancelledAt: true,
        },
        orderBy: (t, { asc }) => asc(t.code),
        with: {
          farm: { columns: { id: true, name: true, slug: true, avatarImage: true } },
          items: true,
          events: { orderBy: (t, { desc: d }) => d(t.occurredAt) },
        },
      },
    },
  });
  if (!order) return null;

  const items = order.farmOrders.flatMap((f) => f.items);
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => !!v);
  const current = variantIds.length
    ? await db
        .select({
          variantId: productVariants.id,
          price: productVariants.price,
          stock: productVariants.stock,
          weightGrams: productVariants.weightGrams,
          label: productVariants.label,
          productId: products.id,
          productSlug: products.slug,
          productName: products.name,
          productStatus: products.status,
          farmStatus: farms.status,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(farms, eq(farms.id, products.farmId))
        .where(inArray(productVariants.id, variantIds))
    : [];
  const reviewed = await db
    .select({ productId: reviews.productId, farmOrderId: reviews.farmOrderId })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), inArray(reviews.farmOrderId, order.farmOrders.map((f) => f.id))));

  const farmOrdersOut = order.farmOrders.map((fo) => ({
    ...fo,
    items: fo.items.map((it) => {
      const cur = current.find((c) => c.variantId === it.variantId);
      return {
        id: it.id,
        productId: it.productId,
        variantId: it.variantId,
        productName: it.productName,
        variantLabel: it.variantLabel,
        imageUrl: it.imageUrl,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
        productSlug: cur?.productSlug ?? null,
        reviewed: reviewed.some((r) => r.productId === it.productId && r.farmOrderId === fo.id),
        /** current catalog info for "もう一度購入" (null when no longer purchasable) */
        reorder:
          cur && cur.productStatus === "active" && cur.farmStatus === "active" && cur.stock > 0
            ? {
                variantId: cur.variantId,
                productId: cur.productId,
                productSlug: cur.productSlug,
                productName: cur.productName,
                variantLabel: cur.label,
                farmId: fo.farm.id,
                farmName: fo.farm.name,
                imageUrl: it.imageUrl,
                unitPrice: cur.price,
                weightGrams: cur.weightGrams,
                maxQuantity: Math.min(cur.stock, 99),
              }
            : null,
      };
    }),
  }));

  const cancellable =
    (order.status === "pending_payment" || order.status === "paid") &&
    order.farmOrders.some((f) => f.status !== "cancelled") &&
    order.farmOrders.every((f) => ["pending_payment", "paid", "preparing", "cancelled"].includes(f.status));

  return { ...order, farmOrders: farmOrdersOut, cancellable };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;
export type OrderDetailFarmOrder = OrderDetail["farmOrders"][number];
export type OrderDetailItem = OrderDetailFarmOrder["items"][number];
export type ReorderItem = NonNullable<OrderDetailItem["reorder"]>;

/** Minimal order view for /checkout/success and the receipt. */
export async function getOrderSummary(userId: string, orderId: string) {
  return db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    columns: {
      id: true, code: true, status: true, email: true, subtotal: true, shippingTotal: true, discountTotal: true, total: true,
      couponCode: true, paymentProvider: true, paidAt: true, createdAt: true, desiredDeliveryDate: true, deliveryTimeSlot: true,
      shippingAddress: true,
    },
    with: {
      farmOrders: {
        columns: { id: true, code: true, status: true, estimatedDeliveryDate: true, shipByDate: true, carrier: true },
        orderBy: (t, { asc }) => asc(t.code),
        with: {
          farm: { columns: { name: true, slug: true } },
          items: { columns: { id: true, productName: true, variantLabel: true, quantity: true, imageUrl: true, lineTotal: true, unitPrice: true } },
        },
      },
    },
  });
}
export type OrderSummary = NonNullable<Awaited<ReturnType<typeof getOrderSummary>>>;

/* ───────────── favorites / follows ───────────── */

export async function listFavoriteProducts(userId: string) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      farmId: farms.id,
      farmName: farms.name,
      favoritedAt: favorites.createdAt,
    })
    .from(favorites)
    .innerJoin(products, eq(products.id, favorites.productId))
    .innerJoin(farms, eq(farms.id, products.farmId))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [variants, images] = await Promise.all([
    db.select().from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(productVariants.sortOrder),
    db.select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt }).from(productImages).where(inArray(productImages.productId, ids)).orderBy(productImages.sortOrder),
  ]);
  return rows.map((r) => {
    const vs = variants.filter((v) => v.productId === r.id);
    const v = vs.find((x) => x.isDefault) ?? vs[0] ?? null;
    const img = images.find((i) => i.productId === r.id) ?? null;
    return {
      ...r,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt || r.name,
      variant: v
        ? { id: v.id, label: v.label, price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, weightGrams: v.weightGrams }
        : null,
      purchasable: r.status === "active" && !!v && v.stock > 0,
    };
  });
}
export type FavoriteProduct = Awaited<ReturnType<typeof listFavoriteProducts>>[number];

export async function listFollowedFarms(userId: string) {
  return db
    .select({
      id: farms.id,
      slug: farms.slug,
      name: farms.name,
      tagline: farms.tagline,
      avatarImage: farms.avatarImage,
      heroImage: farms.heroImage,
      city: farms.city,
      ratingSum: farms.ratingSum,
      ratingCount: farms.ratingCount,
    })
    .from(farmFollows)
    .innerJoin(farms, eq(farms.id, farmFollows.farmId))
    .where(and(eq(farmFollows.userId, userId), eq(farms.status, "active")))
    .orderBy(desc(farmFollows.createdAt));
}
export type FollowedFarm = Awaited<ReturnType<typeof listFollowedFarms>>[number];

/* ───────────── addresses ───────────── */

export async function listAddresses(userId: string) {
  return db
    .select({
      id: addresses.id,
      label: addresses.label,
      recipientName: addresses.recipientName,
      recipientKana: addresses.recipientKana,
      postalCode: addresses.postalCode,
      prefecture: addresses.prefecture,
      city: addresses.city,
      line1: addresses.line1,
      line2: addresses.line2,
      phone: addresses.phone,
      isDefault: addresses.isDefault,
    })
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}
export type SavedAddress = Awaited<ReturnType<typeof listAddresses>>[number];

/* ───────────── reviews ───────────── */

/** Delivered items the customer has not reviewed yet. */
export async function listPendingReviews(userId: string) {
  const rows = await db
    .select({
      itemId: orderItems.id,
      productId: orderItems.productId,
      productName: orderItems.productName,
      variantLabel: orderItems.variantLabel,
      imageUrl: orderItems.imageUrl,
      farmOrderId: farmOrders.id,
      orderId: orders.id,
      deliveredAt: farmOrders.deliveredAt,
      farmName: farms.name,
      productSlug: products.slug,
    })
    .from(orderItems)
    .innerJoin(farmOrders, eq(farmOrders.id, orderItems.farmOrderId))
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .innerJoin(farms, eq(farms.id, farmOrders.farmId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .leftJoin(
      reviews,
      and(eq(reviews.userId, userId), eq(reviews.productId, orderItems.productId), eq(reviews.farmOrderId, farmOrders.id)),
    )
    .where(and(eq(orders.userId, userId), eq(farmOrders.status, "delivered"), isNull(reviews.id)))
    .orderBy(desc(farmOrders.deliveredAt));
  // one row per (farmOrder, product)
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.farmOrderId}:${r.productId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export type PendingReview = Awaited<ReturnType<typeof listPendingReviews>>[number];

export async function listMyReviews(userId: string) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      reply: reviews.reply,
      repliedAt: reviews.repliedAt,
      isPublished: reviews.isPublished,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
      farmName: farms.name,
      imageUrl: sql<string | null>`(select ${productImages.url} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder} limit 1)`,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(farms, eq(farms.id, reviews.farmId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.createdAt));
}
export type MyReview = Awaited<ReturnType<typeof listMyReviews>>[number];

/* ───────────── messages ───────────── */

/** Farm header for a thread (also used to open a brand-new thread via ?f=). */
export async function getThreadFarm(farmId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(farmId)) return null;
  const [farm] = await db
    .select({ id: farms.id, name: farms.name, slug: farms.slug, avatarImage: farms.avatarImage, tagline: farms.tagline, city: farms.city, representative: farms.representative })
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.status, "active")));
  return farm ?? null;
}
export type ThreadFarm = NonNullable<Awaited<ReturnType<typeof getThreadFarm>>>;

/* ───────────── profile ───────────── */

export async function getProfile(userId: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}
