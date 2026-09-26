import { z } from "zod";
import { orderCancelPolicy } from "@/config/order-cancel";
import { prefectures } from "@/config/shipping";

/** Normalizes full-width digits / hyphens so "６５６－０１２３" becomes "6560123". */
const toHalfWidthDigits = (s: string) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[‐－―ー−-]/g, "");

export const postalCodeSchema = z
  .string()
  .trim()
  .transform(toHalfWidthDigits)
  .pipe(z.string().regex(/^\d{7}$/, "郵便番号は7桁の数字で入力してください"));

export const phoneSchema = z
  .string()
  .trim()
  .transform(toHalfWidthDigits)
  .pipe(z.string().regex(/^0\d{9,10}$/, "電話番号は0から始まる10〜11桁で入力してください"));

export const prefectureSchema = z.enum(prefectures, { error: "都道府県を選択してください" });

/** Shipping address (shared by checkout "new address" and /mypage/addresses). */
export const addressSchema = z.object({
  label: z.string().trim().max(20, "20文字以内で入力してください").default("自宅"),
  recipientName: z.string().trim().min(1, "お名前を入力してください").max(40, "40文字以内で入力してください"),
  recipientKana: z
    .string()
    .trim()
    .max(60, "60文字以内で入力してください")
    .regex(/^[぀-ゟ゠-ヿ　\s・ー]*$/, "フリガナはカタカナまたはひらがなで入力してください")
    .default(""),
  postalCode: postalCodeSchema,
  prefecture: prefectureSchema,
  city: z.string().trim().min(1, "市区町村を入力してください").max(60, "60文字以内で入力してください"),
  line1: z.string().trim().min(1, "番地を入力してください").max(100, "100文字以内で入力してください"),
  line2: z.string().trim().max(100, "100文字以内で入力してください").default(""),
  phone: phoneSchema,
});
export type AddressInput = z.infer<typeof addressSchema>;

export const addressFormSchema = addressSchema.extend({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  isDefault: z
    .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "お名前を入力してください").max(40, "40文字以内で入力してください"),
  phone: z
    .string()
    .trim()
    .transform(toHalfWidthDigits)
    .pipe(z.union([z.literal(""), z.string().regex(/^0\d{9,10}$/, "電話番号は0から始まる10〜11桁で入力してください")])),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
    newPassword: z.string().min(8, "8文字以上で入力してください").max(128, "128文字以内で入力してください"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "確認用パスワードが一致しません" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "現在と異なるパスワードを設定してください" });

/* ── auth forms (client-side validation for Better Auth calls) ── */

export const loginSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "8文字以上で入力してください").max(128, "128文字以内で入力してください"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "確認用パスワードが一致しません" });

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "お名前を入力してください").max(40, "40文字以内で入力してください"),
    email: z.email("メールアドレスの形式が正しくありません"),
    password: z.string().min(8, "8文字以上で入力してください").max(128, "128文字以内で入力してください"),
    confirmPassword: z.string(),
    agree: z.literal(true, { error: "利用規約とプライバシーポリシーへの同意が必要です" }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "確認用パスワードが一致しません" });

/** First error message per field from a zod error (for client forms). */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/** お客さまのキャンセルの依頼（#18） */
export const cancelRequestSchema = z.object({
  farmOrderId: z.uuid(),
  reason: z.string().trim().min(2, "理由を入力してください").max(orderCancelPolicy.reasonMaxLength, `${orderCancelPolicy.reasonMaxLength}文字以内で入力してください`),
});
