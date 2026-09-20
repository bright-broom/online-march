// Marketplace domain tables. See docs/DATA_MODEL.md for the ER overview and state machines.
// Money = integer JPY. Rates = basis points (1000 = 10%). Weights = grams.
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/* ─────────────── enums ─────────────── */

export const farmStatus = pgEnum("farm_status", ["pending", "active", "suspended"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "soldout", "archived"]);
export const productCategory = pgEnum("product_category", [
  "onion",
  "new_onion",
  "red_onion",
  "processed",
  "set",
]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "cancelled",
  "refunded",
]);
export const farmOrderStatus = pgEnum("farm_order_status", [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export const carrier = pgEnum("carrier", ["yamato", "japanpost", "sagawa"]);
export const shipmentEventType = pgEnum("shipment_event_type", [
  "order_received",
  "label_created",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "note",
  "refund",
]);
export const payoutStatus = pgEnum("payout_status", ["pending", "processing", "paid"]);
export const couponType = pgEnum("coupon_type", ["percent", "fixed"]);
export const notificationType = pgEnum("notification_type", [
  "order",
  "shipping",
  "review",
  "payout",
  "message",
  "system",
]);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
const userRef = (name = "user_id") =>
  text(name)
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/* ─────────────── farms (出品者ショップ) ─────────────── */

export const farms = pgTable(
  "farms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: userRef("owner_id").unique(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    story: text("story").notNull().default(""),
    representative: text("representative").notNull(),
    postalCode: text("postal_code").notNull().default(""),
    prefecture: text("prefecture").notNull().default("兵庫県"),
    city: text("city").notNull().default("南あわじ市"),
    addressLine: text("address_line").notNull().default(""),
    phone: text("phone").notNull().default(""),
    heroImage: text("hero_image"),
    avatarImage: text("avatar_image"),
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    cultivationMethods: jsonb("cultivation_methods").$type<string[]>().notNull().default([]),
    establishedYear: integer("established_year"),
    status: farmStatus("status").notNull().default("pending"),
    /** null = platform default (platform_settings.commissionRateBps) */
    commissionRateBps: integer("commission_rate_bps"),
    stripeAccountId: text("stripe_account_id"),
    stripeOnboarded: boolean("stripe_onboarded").notNull().default(false),
    defaultCarrier: carrier("default_carrier").notNull().default("yamato"),
    leadTimeDays: integer("lead_time_days").notNull().default(2),
    /** 0=Sun … 6=Sat */
    shipWeekdays: jsonb("ship_weekdays").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
    freeShippingThreshold: integer("free_shipping_threshold"),
    isFeatured: boolean("is_featured").notNull().default(false),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index("farms_status_idx").on(t.status)],
);

/* ─────────────── products ─────────────── */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: productCategory("category").notNull().default("onion"),
    variety: text("variety").notNull().default(""),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
    cultivation: text("cultivation").notNull().default("conventional"),
    storageTips: text("storage_tips").notNull().default(""),
    harvestFrom: integer("harvest_from"),
    harvestTo: integer("harvest_to"),
    status: productStatus("status").notNull().default("draft"),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    soldCount: integer("sold_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("products_farm_idx").on(t.farmId),
    index("products_status_category_idx").on(t.status, t.category),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    stock: integer("stock").notNull().default(0),
    sku: text("sku"),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (t) => [index("images_product_idx").on(t.productId)],
);

/* ─────────────── customers ─────────────── */

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    label: text("label").notNull().default("自宅"),
    recipientName: text("recipient_name").notNull(),
    recipientKana: text("recipient_kana").notNull().default(""),
    postalCode: text("postal_code").notNull(),
    prefecture: text("prefecture").notNull(),
    city: text("city").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2").notNull().default(""),
    phone: text("phone").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

export type AddressSnapshot = {
  recipientName: string;
  recipientKana?: string;
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  line2?: string;
  phone: string;
};

export type GiftOption = { wrapping: boolean; noshi?: string; message?: string };

/* ─────────────── orders ─────────────── */

/** Customer checkout (1 payment). Split into farm_orders per farm. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    userId: userRef(),
    status: orderStatus("status").notNull().default("pending_payment"),
    email: text("email").notNull(),
    subtotal: integer("subtotal").notNull(),
    shippingTotal: integer("shipping_total").notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    total: integer("total").notNull(),
    couponCode: text("coupon_code"),
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>().notNull(),
    gift: jsonb("gift").$type<GiftOption | null>(),
    note: text("note").notNull().default(""),
    desiredDeliveryDate: date("desired_delivery_date"),
    deliveryTimeSlot: text("delivery_time_slot"),
    paymentProvider: text("payment_provider").notNull().default("demo"),
    /** 実際に使われた決済手段（Stripe の payment method type: card / paypay / konbini …）。決済が確定するまで null */
    paymentMethod: text("payment_method"),
    /** コンビニ払い等の支払い番号ページ（Stripe ホスト）。入金待ちの間だけ意味を持つ */
    paymentVoucherUrl: text("payment_voucher_url"),
    /** 支払い番号の有効期限。過ぎると入金できない */
    paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index("orders_user_idx").on(t.userId), index("orders_status_idx").on(t.status)],
);

/** Per-farm fulfilment unit. Farmers manage these. Shipment fields are inlined (1 shipment per farm order). */
export const farmOrders = pgTable(
  "farm_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "restrict" }),
    code: text("code").notNull().unique(),
    status: farmOrderStatus("status").notNull().default("pending_payment"),
    subtotal: integer("subtotal").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    discount: integer("discount").notNull().default(0),
    commissionRateBps: integer("commission_rate_bps").notNull(),
    commissionAmount: integer("commission_amount").notNull(),
    payoutAmount: integer("payout_amount").notNull(),
    carrier: carrier("carrier").notNull().default("yamato"),
    boxSize: integer("box_size").notNull(),
    boxCount: integer("box_count").notNull().default(1),
    totalWeightGrams: integer("total_weight_grams").notNull(),
    trackingNumber: text("tracking_number"),
    shipByDate: date("ship_by_date"),
    estimatedDeliveryDate: date("estimated_delivery_date"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** set when money was returned to the customer for this farm order */
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmount: integer("refund_amount"),
    labelPrintedAt: timestamp("label_printed_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
    farmerNote: text("farmer_note").notNull().default(""),
    payoutId: uuid("payout_id"),
    /** payout that deducted this farm order's refund (set only when refunded after being settled) */
    clawbackPayoutId: uuid("clawback_payout_id"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("farm_orders_farm_status_idx").on(t.farmId, t.status),
    index("farm_orders_order_idx").on(t.orderId),
    index("farm_orders_ship_by_idx").on(t.shipByDate),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmOrderId: uuid("farm_order_id")
      .notNull()
      .references(() => farmOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    imageUrl: text("image_url"),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    lineTotal: integer("line_total").notNull(),
  },
  (t) => [index("order_items_farm_order_idx").on(t.farmOrderId)],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmOrderId: uuid("farm_order_id")
      .notNull()
      .references(() => farmOrders.id, { onDelete: "cascade" }),
    type: shipmentEventType("type").notNull(),
    message: text("message").notNull().default(""),
    location: text("location"),
    source: text("source").notNull().default("system"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shipment_events_fo_idx").on(t.farmOrderId)],
);

/* ─────────────── engagement ─────────────── */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    userId: userRef(),
    farmOrderId: uuid("farm_order_id").references(() => farmOrders.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    reply: text("reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt,
  },
  (t) => [
    index("reviews_product_idx").on(t.productId),
    index("reviews_farm_idx").on(t.farmId),
    uniqueIndex("reviews_user_product_order_uq").on(t.userId, t.productId, t.farmOrderId),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: userRef(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const farmFollows = pgTable(
  "farm_follows",
  {
    userId: userRef(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.farmId] })],
);

/** Customer ⇄ farm messages. Thread key = (farmId, customerId). */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    customerId: userRef("customer_id"),
    senderId: userRef("sender_id"),
    farmOrderId: uuid("farm_order_id").references(() => farmOrders.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("messages_thread_idx").on(t.farmId, t.customerId)],
);

/* ─────────────── money ─────────────── */

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    grossSales: integer("gross_sales").notNull(),
    shippingFees: integer("shipping_fees").notNull(),
    commission: integer("commission").notNull(),
    /** refunds of already-settled farm orders, deducted from this payout (>= 0) */
    refundAdjustment: integer("refund_adjustment").notNull().default(0),
    amount: integer("amount").notNull(),
    orderCount: integer("order_count").notNull(),
    status: payoutStatus("status").notNull().default("pending"),
    stripeTransferId: text("stripe_transfer_id"),
    /** why the last automatic transfer did not go through (insufficient platform balance, Stripe error) */
    transferError: text("transfer_error"),
    transferAttemptedAt: timestamp("transfer_attempted_at", { withTimezone: true }),
    scheduledFor: date("scheduled_for"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("payouts_farm_idx").on(t.farmId)],
);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  type: couponType("type").notNull(),
  value: integer("value").notNull(),
  minSubtotal: integer("min_subtotal").notNull().default(0),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt,
});

/* ─────────────── platform ─────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  audience: text("audience").$type<"all" | "customer" | "farmer">().notNull().default("all"),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt,
});

/** Admin-editable overrides of src/config defaults. Read via server/queries/settings.ts. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt,
});

/** Automation audit log (cron jobs, webhooks). */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    status: text("status").$type<"success" | "error">().notNull(),
    trigger: text("trigger").$type<"cron" | "manual" | "webhook">().notNull().default("cron"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)],
);

/* ─────────────── relations (for db.query.*) ─────────────── */

export const farmsRelations = relations(farms, ({ one, many }) => ({
  owner: one(user, { fields: [farms.ownerId], references: [user.id] }),
  products: many(products),
  farmOrders: many(farmOrders),
  reviews: many(reviews),
  payouts: many(payouts),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  farm: one(farms, { fields: [products.farmId], references: [farms.id] }),
  variants: many(productVariants),
  images: many(productImages),
  reviews: many(reviews),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  farmOrders: many(farmOrders),
}));

export const farmOrdersRelations = relations(farmOrders, ({ one, many }) => ({
  order: one(orders, { fields: [farmOrders.orderId], references: [orders.id] }),
  farm: one(farms, { fields: [farmOrders.farmId], references: [farms.id] }),
  items: many(orderItems),
  events: many(shipmentEvents),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  farmOrder: one(farmOrders, { fields: [orderItems.farmOrderId], references: [farmOrders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const shipmentEventsRelations = relations(shipmentEvents, ({ one }) => ({
  farmOrder: one(farmOrders, { fields: [shipmentEvents.farmOrderId], references: [farmOrders.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  farm: one(farms, { fields: [reviews.farmId], references: [farms.id] }),
  user: one(user, { fields: [reviews.userId], references: [user.id] }),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  farm: one(farms, { fields: [payouts.farmId], references: [farms.id] }),
}));

/* ─────────────── inferred types ─────────────── */

export type Farm = typeof farms.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type FarmOrder = typeof farmOrders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type ShipmentEvent = typeof shipmentEvents.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type FarmStatus = (typeof farmStatus.enumValues)[number];
export type ProductStatus = (typeof productStatus.enumValues)[number];
export type ProductCategory = (typeof productCategory.enumValues)[number];
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type FarmOrderStatus = (typeof farmOrderStatus.enumValues)[number];
export type Carrier = (typeof carrier.enumValues)[number];
export type ShipmentEventType = (typeof shipmentEventType.enumValues)[number];
export type PayoutStatus = (typeof payoutStatus.enumValues)[number];
export type NotificationType = (typeof notificationType.enumValues)[number];
