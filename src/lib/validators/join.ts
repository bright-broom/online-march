import { z } from "zod";
import { cultivationMethods, type CultivationKey } from "@/config/catalog";
import { prefectures } from "@/config/shipping";

const cultivationKeys = Object.keys(cultivationMethods) as [CultivationKey, ...CultivationKey[]];

/** 出店申請フォーム（/join）。client/server 共用。 */
export const farmApplicationSchema = z.object({
  farmName: z.string().trim().min(1, "農園名を入力してください").max(40, "40文字以内で入力してください"),
  representative: z.string().trim().min(1, "代表者名を入力してください").max(40, "40文字以内で入力してください"),
  phone: z
    .string()
    .trim()
    .transform((v) => v.normalize("NFKC").replace(/[‐―−ー]/g, "-"))
    .pipe(z.string().regex(/^0\d{1,4}-?\d{1,4}-?\d{3,4}$/, "電話番号の形式が正しくありません（例: 0799-00-0000）")),
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.normalize("NFKC").replace(/[^\d]/g, ""))
    .pipe(z.string().regex(/^\d{7}$/, "郵便番号は7桁で入力してください"))
    .transform((v) => `${v.slice(0, 3)}-${v.slice(3)}`),
  prefecture: z.enum(prefectures, { error: "都道府県を選択してください" }),
  city: z.string().trim().min(1, "市区町村を入力してください").max(40),
  addressLine: z.string().trim().min(1, "番地・建物名を入力してください").max(100),
  tagline: z.string().trim().min(1, "ひとことを入力してください").max(40, "40文字以内で入力してください"),
  story: z
    .string()
    .trim()
    .min(30, "30文字以上でご記入ください")
    .max(2000, "2000文字以内で入力してください"),
  cultivationMethods: z.array(z.enum(cultivationKeys)).max(cultivationKeys.length).default([]),
});

export type FarmApplicationInput = z.infer<typeof farmApplicationSchema>;
