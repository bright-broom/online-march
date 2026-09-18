/**
 * Central registry of cache tags. Queries call cacheTag(tags.x), actions call updateTag(tags.x).
 * Keep granular: list tags + entity tags.
 */
export const tags = {
  products: "products",
  product: (id: string) => `product:${id}`,
  farms: "farms",
  farm: (id: string) => `farm:${id}`,
  farmProducts: (farmId: string) => `farm-products:${farmId}`,
  reviews: "reviews",
  productReviews: (productId: string) => `reviews:product:${productId}`,
  settings: "settings",
  announcements: "announcements",
  coupons: "coupons",
  /** analytics are cached briefly; bump on order events */
  analytics: "analytics",
  farmAnalytics: (farmId: string) => `analytics:farm:${farmId}`,
} as const;
