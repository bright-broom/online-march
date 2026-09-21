import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { REMOVED_VARIANT_SORT, catalogLimits, priceRanges, type ProductSort } from "@/config/catalog";
import { db } from "@/db";
import {
  announcements,
  farms,
  productImages,
  products,
  productVariants,
  reviews,
  user,
  type Carrier,
  type ProductCategory,
} from "@/db/schema";
import { tags } from "@/lib/cache-tags";

/**
 * Public storefront reads. Every export is `"use cache"` + `cacheLife("catalog")` + tags,
 * except `getFarmApplication` (user-specific, request-time).
 * Returned values are plain DTOs (ISO date strings, no secrets) safe to pass to Client Components.
 */

/* ─────────────── DTOs ─────────────── */

export type ProductCardDTO = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  variety: string;
  summary: string;
  cultivation: string;
  farm: { id: string; slug: string; name: string };
  images: { url: string; alt: string }[];
  minPrice: number;
  compareAt: number | null;
  stock: number;
  variantCount: number;
  ratingSum: number;
  ratingCount: number;
  soldOut: boolean;
  lowStock: boolean;
  isNew: boolean;
};

export type CatalogFilters = {
  q?: string;
  category?: ProductCategory | null;
  farm?: string | null;
  cultivation?: string | null;
  price?: string | null;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
};

export type ProductListResult = {
  items: ProductCardDTO[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export type FarmCardDTO = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  city: string;
  heroImage: string | null;
  avatarImage: string | null;
  cultivationMethods: string[];
  establishedYear: number | null;
  ratingSum: number;
  ratingCount: number;
  productCount: number;
  isFeatured: boolean;
};

export type FarmShippingDTO = {
  leadTimeDays: number;
  shipWeekdays: number[];
  carrier: Carrier;
  freeShippingThreshold: number | null;
  /** 受付停止中ならその最終日（YYYY-MM-DD）。過ぎていれば受付中 */
  pausedUntil: string | null;
};

export type FarmDetailDTO = FarmCardDTO &
  FarmShippingDTO & {
    story: string;
    representative: string;
    prefecture: string;
    gallery: string[];
    updatedAt: string;
  };

export type ProductVariantDTO = {
  id: string;
  label: string;
  weightGrams: number;
  price: number;
  compareAt: number | null;
  stock: number;
  isDefault: boolean;
};

export type ProductDetailDTO = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  variety: string;
  summary: string;
  description: string;
  highlights: string[];
  cultivation: string;
  storageTips: string;
  harvestFrom: number | null;
  harvestTo: number | null;
  status: "active" | "soldout";
  ratingSum: number;
  ratingCount: number;
  soldCount: number;
  updatedAt: string;
  images: { url: string; alt: string }[];
  variants: ProductVariantDTO[];
  farm: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    city: string;
    avatarImage: string | null;
    heroImage: string | null;
    ratingSum: number;
    ratingCount: number;
  } & FarmShippingDTO;
};

export type ReviewDTO = {
  id: string;
  rating: number;
  title: string;
  body: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  author: string;
  product: { slug: string; name: string };
  farm: { slug: string; name: string };
};

export type ReviewSummaryDTO = {
  count: number;
  average: number;
  /** index 0 = ★1 … index 4 = ★5 */
  distribution: [number, number, number, number, number];
};

export type AnnouncementDTO = { id: string; title: string; body: string; publishedAt: string };

/* ─────────────── helpers ─────────────── */

const publicProduct = () =>
  and(inArray(products.status, ["active", "soldout"]), eq(farms.status, "active"));

/** Per-product variant aggregate: from-price, its compare-at, total stock. */
const variantAgg = () =>
  db
    .select({
      productId: productVariants.productId,
      minPrice: sql<number>`min(${productVariants.price})::int`.as("min_price"),
      compareAt: sql<number | null>`(array_agg(${productVariants.compareAtPrice} order by ${productVariants.price} asc))[1]`.as(
        "compare_at",
      ),
      stock: sql<number>`coalesce(sum(${productVariants.stock}), 0)::int`.as("stock"),
      variantCount: sql<number>`count(*)::int`.as("variant_count"),
    })
    .from(productVariants)
    .where(lt(productVariants.sortOrder, REMOVED_VARIANT_SORT))
    .groupBy(productVariants.productId)
    .as("va");

/** Mask reviewer names: "山田 花子" → "山田さん". */
const maskName = (name: string | null) => `${(name ?? "").trim().split(/\s+/)[0] || "お客"}さん`;

const iso = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).toISOString());

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

async function queryProductCards(opts: {
  where?: SQL;
  orderBy?: SQL[];
  limit: number;
  offset?: number;
}): Promise<ProductCardDTO[]> {
  const va = variantAgg();
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      category: products.category,
      variety: products.variety,
      summary: products.summary,
      cultivation: products.cultivation,
      status: products.status,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      isNew: sql<boolean>`coalesce(${products.publishedAt}, ${products.createdAt}) > now() - interval '30 days'`,
      farmId: farms.id,
      farmSlug: farms.slug,
      farmName: farms.name,
      minPrice: va.minPrice,
      compareAt: va.compareAt,
      stock: va.stock,
      variantCount: va.variantCount,
    })
    .from(products)
    .innerJoin(farms, eq(products.farmId, farms.id))
    .innerJoin(va, eq(va.productId, products.id))
    .where(and(publicProduct(), opts.where))
    .orderBy(...(opts.orderBy ?? [desc(products.isFeatured), asc(products.sortOrder)]), asc(products.id))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  if (!rows.length) return [];
  const imgs = await db
    .select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(asc(productImages.productId), asc(productImages.sortOrder));
  const byProduct = new Map<string, { url: string; alt: string }[]>();
  for (const i of imgs) {
    const list = byProduct.get(i.productId) ?? [];
    if (list.length < 2) list.push({ url: i.url, alt: i.alt });
    byProduct.set(i.productId, list);
  }

  return rows.map((r) => {
    const stock = Number(r.stock);
    const soldOut = r.status === "soldout" || stock <= 0;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      category: r.category,
      variety: r.variety,
      summary: r.summary,
      cultivation: r.cultivation,
      farm: { id: r.farmId, slug: r.farmSlug, name: r.farmName },
      images: byProduct.get(r.id) ?? [],
      minPrice: Number(r.minPrice),
      compareAt: r.compareAt != null && Number(r.compareAt) > Number(r.minPrice) ? Number(r.compareAt) : null,
      stock,
      variantCount: Number(r.variantCount),
      ratingSum: r.ratingSum,
      ratingCount: r.ratingCount,
      soldOut,
      lowStock: !soldOut && stock <= catalogLimits.lowStockThreshold,
      isNew: Boolean(r.isNew),
    };
  });
}

/* ─────────────── products ─────────────── */

/** Filtered, sorted, paginated product list for /products. */
export async function listProducts(filters: CatalogFilters): Promise<ProductListResult> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products, tags.farms);

  const va = variantAgg();
  const conds: (SQL | undefined)[] = [];
  const q = filters.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(
      or(
        ilike(products.name, like),
        ilike(products.variety, like),
        ilike(products.summary, like),
        ilike(farms.name, like),
      ),
    );
  }
  if (filters.category) conds.push(eq(products.category, filters.category));
  if (filters.farm) conds.push(eq(farms.slug, filters.farm));
  if (filters.cultivation) conds.push(eq(products.cultivation, filters.cultivation));
  const range = priceRanges.find((r) => r.key === filters.price);
  if (range) conds.push(and(gte(va.minPrice, range.min), lt(va.minPrice, range.max)));
  if (filters.inStock) conds.push(and(eq(products.status, "active"), sql`${va.stock} > 0`));
  const where = and(publicProduct(), ...conds);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(farms, eq(products.farmId, farms.id))
    .innerJoin(va, eq(va.productId, products.id))
    .where(where);
  const total = Number(n);
  const pageSize = catalogLimits.pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const inStockFirst = sql`case when ${products.status} = 'active' and ${va.stock} > 0 then 0 else 1 end`;
  const avg = sql`case when ${products.ratingCount} > 0 then ${products.ratingSum}::float / ${products.ratingCount} else 0 end`;
  const orderBy: Record<ProductSort, SQL[]> = {
    recommended: [inStockFirst, desc(products.isFeatured), asc(products.sortOrder), desc(products.soldCount)],
    newest: [sql`coalesce(${products.publishedAt}, ${products.createdAt}) desc`],
    popular: [inStockFirst, desc(products.soldCount)],
    rating: [sql`${avg} desc`, desc(products.ratingCount)],
    price_asc: [asc(va.minPrice)],
    price_desc: [desc(va.minPrice)],
  };

  const items = await queryProductCards({
    where: and(...conds),
    orderBy: orderBy[filters.sort ?? "recommended"],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { items, total, page, pageCount, pageSize };
}

export async function getFeaturedProducts(limit = 8): Promise<ProductCardDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products, tags.farms);
  return queryProductCards({
    where: eq(products.status, "active"),
    orderBy: [desc(products.isFeatured), desc(products.soldCount), asc(products.sortOrder)],
    limit,
  });
}

export async function getRelatedProducts(
  product: { id: string; farmId: string; category: ProductCategory },
  limit = 4,
): Promise<ProductCardDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products, tags.farmProducts(product.farmId));
  return queryProductCards({
    where: and(ne(products.id, product.id), or(eq(products.farmId, product.farmId), eq(products.category, product.category))),
    orderBy: [
      sql`case when ${products.farmId} = ${product.farmId} then 0 else 1 end`,
      sql`case when ${products.status} = 'active' then 0 else 1 end`,
      desc(products.soldCount),
    ],
    limit,
  });
}

export async function getFarmProducts(farmId: string): Promise<ProductCardDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products, tags.farmProducts(farmId), tags.farm(farmId));
  return queryProductCards({
    where: eq(products.farmId, farmId),
    orderBy: [
      sql`case when ${products.status} = 'active' then 0 else 1 end`,
      desc(products.isFeatured),
      asc(products.sortOrder),
    ],
    limit: 48,
  });
}

export async function getProductBySlug(slug: string): Promise<ProductDetailDTO | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products);

  const p = await db.query.products.findFirst({
    where: and(eq(products.slug, slug), inArray(products.status, ["active", "soldout"])),
    with: {
      variants: { where: lt(productVariants.sortOrder, REMOVED_VARIANT_SORT), orderBy: [asc(productVariants.sortOrder), asc(productVariants.price)] },
      images: { orderBy: [asc(productImages.sortOrder)] },
      farm: true,
    },
  });
  if (!p || p.farm.status !== "active") return null;
  cacheTag(tags.product(p.id), tags.farm(p.farmId));

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    variety: p.variety,
    summary: p.summary,
    description: p.description,
    highlights: p.highlights,
    cultivation: p.cultivation,
    storageTips: p.storageTips,
    harvestFrom: p.harvestFrom,
    harvestTo: p.harvestTo,
    status: p.status === "soldout" ? "soldout" : "active",
    ratingSum: p.ratingSum,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
    updatedAt: p.updatedAt.toISOString(),
    images: p.images.map((i) => ({ url: i.url, alt: i.alt || p.name })),
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      weightGrams: v.weightGrams,
      price: v.price,
      compareAt: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null,
      stock: p.status === "soldout" ? 0 : v.stock,
      isDefault: v.isDefault,
    })),
    farm: {
      id: p.farm.id,
      slug: p.farm.slug,
      name: p.farm.name,
      tagline: p.farm.tagline,
      city: p.farm.city,
      avatarImage: p.farm.avatarImage,
      heroImage: p.farm.heroImage,
      ratingSum: p.farm.ratingSum,
      ratingCount: p.farm.ratingCount,
      leadTimeDays: p.farm.leadTimeDays,
      shipWeekdays: p.farm.shipWeekdays,
      carrier: p.farm.defaultCarrier,
      freeShippingThreshold: p.farm.freeShippingThreshold,
      pausedUntil: p.farm.pausedUntil,
    },
  };
}

/** Slugs for generateStaticParams & sitemap. */
export async function getPublicProductSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products, tags.farms);
  const rows = await db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .innerJoin(farms, eq(products.farmId, farms.id))
    .where(publicProduct())
    .orderBy(desc(products.soldCount));
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
}

/* ─────────────── farms ─────────────── */

const farmCardColumns = {
  id: farms.id,
  slug: farms.slug,
  name: farms.name,
  tagline: farms.tagline,
  city: farms.city,
  heroImage: farms.heroImage,
  avatarImage: farms.avatarImage,
  cultivationMethods: farms.cultivationMethods,
  establishedYear: farms.establishedYear,
  ratingSum: farms.ratingSum,
  ratingCount: farms.ratingCount,
  isFeatured: farms.isFeatured,
  productCount: sql<number>`(select count(*)::int from ${products} where ${products.farmId} = ${farms.id} and ${products.status} in ('active','soldout'))`,
};

const toFarmCard = (r: Omit<FarmCardDTO, "productCount"> & { productCount: number | string }): FarmCardDTO => ({
  ...r,
  productCount: Number(r.productCount),
});

export async function listFarms(): Promise<FarmCardDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.farms, tags.products);
  const rows = await db
    .select(farmCardColumns)
    .from(farms)
    .where(eq(farms.status, "active"))
    .orderBy(desc(farms.isFeatured), desc(farms.ratingCount), asc(farms.name));
  return rows.map(toFarmCard);
}

export async function getFeaturedFarms(limit = 3): Promise<FarmCardDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.farms, tags.products);
  const rows = await db
    .select(farmCardColumns)
    .from(farms)
    .where(eq(farms.status, "active"))
    .orderBy(desc(farms.isFeatured), desc(farms.ratingCount))
    .limit(limit);
  return rows.map(toFarmCard);
}

export async function getFarmBySlug(slug: string): Promise<FarmDetailDTO | null> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.farms);
  const [r] = await db
    .select({
      ...farmCardColumns,
      story: farms.story,
      representative: farms.representative,
      prefecture: farms.prefecture,
      gallery: farms.gallery,
      leadTimeDays: farms.leadTimeDays,
      shipWeekdays: farms.shipWeekdays,
      carrier: farms.defaultCarrier,
      freeShippingThreshold: farms.freeShippingThreshold,
      pausedUntil: farms.pausedUntil,
      updatedAt: farms.updatedAt,
    })
    .from(farms)
    .where(and(eq(farms.slug, slug), eq(farms.status, "active")))
    .limit(1);
  if (!r) return null;
  cacheTag(tags.farm(r.id), tags.farmProducts(r.id));
  return { ...r, productCount: Number(r.productCount), updatedAt: r.updatedAt.toISOString() };
}

export async function getPublicFarmSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.farms);
  const rows = await db
    .select({ slug: farms.slug, updatedAt: farms.updatedAt })
    .from(farms)
    .where(eq(farms.status, "active"));
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
}

/** Farm options for the catalog filter. */
export async function getCatalogFacets(): Promise<{ farms: { slug: string; name: string; count: number }[] }> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.farms, tags.products);
  const rows = await db
    .select({ slug: farms.slug, name: farms.name, count: sql<number>`count(${products.id})::int` })
    .from(farms)
    .innerJoin(products, and(eq(products.farmId, farms.id), inArray(products.status, ["active", "soldout"])))
    .where(eq(farms.status, "active"))
    .groupBy(farms.id, farms.slug, farms.name)
    .orderBy(asc(farms.name));
  return { farms: rows.map((r) => ({ ...r, count: Number(r.count) })) };
}

/* ─────────────── reviews ─────────────── */

const reviewColumns = {
  id: reviews.id,
  rating: reviews.rating,
  title: reviews.title,
  body: reviews.body,
  reply: reviews.reply,
  repliedAt: reviews.repliedAt,
  createdAt: reviews.createdAt,
  authorName: user.name,
  productSlug: products.slug,
  productName: products.name,
  farmSlug: farms.slug,
  farmName: farms.name,
};

type ReviewRow = {
  id: string;
  rating: number;
  title: string;
  body: string;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  authorName: string | null;
  productSlug: string;
  productName: string;
  farmSlug: string;
  farmName: string;
};

const toReview = (r: ReviewRow): ReviewDTO => ({
  id: r.id,
  rating: r.rating,
  title: r.title,
  body: r.body,
  reply: r.reply,
  repliedAt: iso(r.repliedAt),
  createdAt: iso(r.createdAt)!,
  author: maskName(r.authorName),
  product: { slug: r.productSlug, name: r.productName },
  farm: { slug: r.farmSlug, name: r.farmName },
});

const reviewsBase = () =>
  db
    .select(reviewColumns)
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(farms, eq(reviews.farmId, farms.id))
    .leftJoin(user, eq(reviews.userId, user.id));

async function summarize(where: SQL): Promise<ReviewSummaryDTO> {
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(where, eq(reviews.isPublished, true)))
    .groupBy(reviews.rating);
  const distribution: ReviewSummaryDTO["distribution"] = [0, 0, 0, 0, 0];
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    const idx = Math.min(5, Math.max(1, r.rating)) - 1;
    distribution[idx] += Number(r.n);
    count += Number(r.n);
    sum += r.rating * Number(r.n);
  }
  return { count, average: count ? sum / count : 0, distribution };
}

export async function getProductReviews(
  productId: string,
  limit = 20,
): Promise<{ summary: ReviewSummaryDTO; items: ReviewDTO[] }> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.reviews, tags.productReviews(productId));
  const [summary, rows] = await Promise.all([
    summarize(eq(reviews.productId, productId)),
    reviewsBase()
      .where(and(eq(reviews.productId, productId), eq(reviews.isPublished, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
  ]);
  return { summary, items: rows.map(toReview) };
}

export async function getFarmReviews(
  farmId: string,
  limit = 6,
): Promise<{ summary: ReviewSummaryDTO; items: ReviewDTO[] }> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.reviews, tags.farm(farmId));
  const [summary, rows] = await Promise.all([
    summarize(eq(reviews.farmId, farmId)),
    reviewsBase()
      .where(and(eq(reviews.farmId, farmId), eq(reviews.isPublished, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
  ]);
  return { summary, items: rows.map(toReview) };
}

/** Home "VOICES": 4–5★ reviews with substance, farmer replies first. */
export async function getReviewHighlights(limit = 6): Promise<ReviewDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.reviews);
  const rows = await reviewsBase()
    .where(
      and(
        eq(reviews.isPublished, true),
        gte(reviews.rating, 4),
        sql`char_length(${reviews.body}) >= 20`,
        eq(farms.status, "active"),
      ),
    )
    .orderBy(sql`case when ${reviews.reply} is not null then 0 else 1 end`, desc(reviews.rating), desc(reviews.createdAt))
    .limit(limit);
  return rows.map(toReview);
}

/* ─────────────── announcements ─────────────── */

/** Latest published announcements for shoppers (audience all | customer). */
export async function getShopAnnouncements(limit = 3): Promise<AnnouncementDTO[]> {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.announcements);
  const rows = await db
    .select({ id: announcements.id, title: announcements.title, body: announcements.body, publishedAt: announcements.publishedAt })
    .from(announcements)
    .where(
      and(
        eq(announcements.isPublished, true),
        inArray(announcements.audience, ["all", "customer"]),
        sql`${announcements.publishedAt} <= now()`,
      ),
    )
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() }));
}

/* ─────────────── request-time (not cached) ─────────────── */

/** The signed-in user's farm application, if any. User-specific → call inside <Suspense>. */
export async function getFarmApplication(userId: string) {
  const [row] = await db
    .select({ id: farms.id, name: farms.name, slug: farms.slug, status: farms.status, createdAt: farms.createdAt })
    .from(farms)
    .where(eq(farms.ownerId, userId))
    .limit(1);
  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
}
