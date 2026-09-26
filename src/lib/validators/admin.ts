/** zod schemas for the 運営 (admin) console. Shared by client forms and server actions. */
import { z } from "zod";
import { trackingNumberSchema } from "./farmer";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選択してください");
const optionalYmd = z.preprocess((v) => (v === "" || v == null ? null : v), ymd.nullable());
const optionalInt = (min: number, msg: string) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int(msg).min(min, msg).nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Commission rate entered as percent ("8.5") → bps (850). Empty = platform default (null). */
export const percentToBps = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce
    .number("数値で入力してください")
    .min(0, "0%以上で入力してください")
    .max(50, "50%以下で入力してください")
    .transform((pct) => Math.round(pct * 100))
    .nullable(),
);

export const farmCommissionSchema = z.object({
  farmId: z.uuid(),
  ratePercent: percentToBps,
});

export const platformCommissionSchema = z.object({
  ratePercent: z.coerce
    .number("数値で入力してください")
    .min(0, "0%以上で入力してください")
    .max(50, "50%以下で入力してください")
    .transform((pct) => Math.round(pct * 100)),
});

export const userRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["customer", "farmer", "admin"]),
});

export const adminTransitionSchema = z.object({
  farmOrderId: z.uuid(),
  to: z.enum(["preparing", "shipped", "delivered", "cancelled"]),
  // 空なら既存の番号のまま（lib/shipping.ts の決まりで検証。生産者の入力・CSV取込と同じ）
  trackingNumber: z.union([z.literal("").transform(() => undefined), trackingNumberSchema]).optional(),
  carrier: z.enum(["yamato", "japanpost", "sagawa"]).optional(),
  note: z.string().trim().max(200, "200文字以内で入力してください").optional(),
});

export const refundSchema = z.object({
  orderId: z.uuid(),
  /** omit = refund the whole order */
  farmOrderId: z.uuid().optional(),
});

export const couponSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
    code: z
      .string()
      .trim()
      .min(3, "3文字以上で入力してください")
      .max(24, "24文字以内で入力してください")
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9_-]+$/, "英数字・ハイフン・アンダースコアのみ使えます")),
    description: z.string().trim().max(120, "120文字以内で入力してください").default(""),
    type: z.enum(["percent", "fixed"]),
    value: z.coerce.number().int("整数で入力してください").min(1, "1以上で入力してください"),
    minSubtotal: z.coerce.number().int().min(0, "0円以上で入力してください").default(0),
    maxUses: optionalInt(1, "1以上の整数で入力してください"),
    startsAt: optionalYmd,
    endsAt: optionalYmd,
    isActive: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.type === "percent" && v.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "割引率は100%以下で入力してください" });
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "終了日は開始日以降にしてください" });
  });
export type CouponInput = z.infer<typeof couponSchema>;

export const announcementSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  title: z.string().trim().min(1, "タイトルを入力してください").max(80, "80文字以内で入力してください"),
  body: z.string().trim().max(4000, "4000文字以内で入力してください").default(""),
  audience: z.enum(["all", "customer", "farmer"]),
  isPublished: checkbox,
  /** datetime-local value (JST), e.g. 2026-09-19T10:00 */
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "公開日時を入力してください"),
});

export const idSchema = z.object({ id: z.uuid() });

/** Marker for admin refund notes in shipment_events (farm_orders has no refund column). */

/** Admin period switch (overview analytics). */
export const periodDays = [7, 30, 90] as const;
export type PeriodDays = (typeof periodDays)[number];
export const parsePeriod = (v: unknown): PeriodDays => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return periodDays.find((d) => d === n) ?? 30;
};
