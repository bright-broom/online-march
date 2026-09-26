// Better Auth core tables. Field names must match Better Auth expectations.
// Extra user fields (role, phone) are declared in src/server/auth/auth.ts `additionalFields`.
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["customer", "farmer", "admin"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("customer"),
  phone: text("phone"),
  /** 二段階認証（TOTP）を有効にしているか。Better Auth の twoFactor プラグインが管理する。運営は必須（server/auth/guards.ts） */
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  /** 退会日時。行は残すが個人情報は消してある（注文は帳簿として残すため user 行を消せない。docs/DATA_MODEL.md §退会） */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** 運営による利用停止（#21）。停止中はログインできず、ログイン中の端末も切れる。注文・レビューなどはそのまま */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  /** 利用停止の理由（運営のメモ。本人には見せない） */
  suspendedReason: text("suspended_reason").notNull().default(""),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * Better Auth rate-limit counters. Serverless functions do not share memory, so the limiter needs a store
 * every instance can see; field names are fixed by Better Auth ("key", "count", "lastRequest").
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [index("rate_limit_key_idx").on(t.key)],
);

/**
 * 二段階認証の秘密鍵とバックアップコード（Better Auth twoFactor プラグイン。フィールド名は固定）。
 * secret / backupCodes はプラグインが認証シークレットで暗号化して保存する。
 */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export type User = typeof user.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
