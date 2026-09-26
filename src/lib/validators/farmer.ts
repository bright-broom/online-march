/** Farmer dashboard input schemas (client + server). Messages are user-facing Japanese. */
import { z } from "zod";
import { normalizeTrackingNumber, trackingNumberPattern } from "@/lib/shipping";
import { catalogLimits, categoryKeys, cultivationMethods } from "@/config/catalog";
import { carriers } from "@/config/shipping";
import type { Carrier, ProductCategory, ProductStatus } from "@/db/schema/marketplace";

/** Hidden-input JSON fields (images / variants / highlights) → parsed value. Invalid JSON → schema error. */
const json = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    if (!v.trim()) return [];
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, schema);

const optionalInt = (min: number, max: number, msg: string) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().int(msg).min(min, msg).max(max, msg).nullable(),
  );

const bool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());

export const carrierKeys = Object.keys(carriers) as [Carrier, ...Carrier[]];
export const cultivationKeys = Object.keys(cultivationMethods) as [keyof typeof cultivationMethods, ...(keyof typeof cultivationMethods)[]];

/* ─────────────── products ─────────────── */

export const variantInputSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    label: z.string().trim().min(1, "規格名を入力してください").max(40, "40文字以内"),
    weightGrams: z.coerce.number().int().min(1, "重量を入力してください").max(30_000, "30kgまでです"),
    price: z.coerce.number().int("整数で入力してください").min(1, "価格を入力してください").max(1_000_000, "価格が大きすぎます"),
    compareAtPrice: optionalInt(1, 1_000_000, "通常価格が正しくありません"),
    stock: z.coerce.number().int("整数で入力してください").min(0, "0以上で入力してください").max(99_999, "在庫数が大きすぎます"),
    /** 編集画面を開いた時点の在庫。あれば保存時に差分だけを反映する（farmer-products.ts#saveProduct） */
    stockBase: z.coerce.number().int().min(0).max(99_999).optional(),
    sku: z.string().trim().max(40, "40文字以内").optional().default(""),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    message: "通常価格は販売価格より高く設定してください",
    path: ["compareAtPrice"],
  });
export type VariantInput = z.infer<typeof variantInputSchema>;

export const imageInputSchema = z.object({
  url: z.string().trim().min(1).max(1000),
  alt: z.string().trim().max(120).optional().default(""),
});

export const productEditableStatuses = ["draft", "active", "soldout", "archived"] as const satisfies readonly ProductStatus[];

export const productFormSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    name: z.string().trim().min(2, "商品名を入力してください").max(80, "80文字以内で入力してください"),
    category: z.enum(categoryKeys as [ProductCategory, ...ProductCategory[]], "カテゴリを選択してください"),
    variety: z.string().trim().max(40, "40文字以内").default(""),
    summary: z.string().trim().max(120, "120文字以内で入力してください").default(""),
    description: z.string().trim().max(4000, "4000文字以内で入力してください").default(""),
    highlights: json(z.array(z.string().trim().min(1).max(30, "タグは30文字以内")).max(8, "タグは8個までです")),
    cultivation: z.enum(cultivationKeys, "栽培方法を選択してください"),
    storageTips: z.string().trim().max(1000, "1000文字以内").default(""),
    harvestFrom: optionalInt(1, 12, "月を選択してください"),
    harvestTo: optionalInt(1, 12, "月を選択してください"),
    images: json(
      z
        .array(imageInputSchema)
        .min(1, "写真を1枚以上登録してください")
        .max(catalogLimits.maxImagesPerProduct, `写真は${catalogLimits.maxImagesPerProduct}枚までです`),
    ),
    variants: json(
      z
        .array(variantInputSchema)
        .min(1, "規格を1つ以上登録してください")
        .max(catalogLimits.maxVariantsPerProduct, `規格は${catalogLimits.maxVariantsPerProduct}個までです`),
    ),
    status: z.enum(productEditableStatuses).default("draft"),
  })
  .refine((v) => (v.harvestFrom == null) === (v.harvestTo == null), {
    message: "収穫時期は開始と終了の両方を選択してください",
    path: ["harvestTo"],
  });
export type ProductFormInput = z.infer<typeof productFormSchema>;

export const productStatusChangeSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "active", "archived"]),
});

/* ─────────────── orders / shipping ─────────────── */

export const idsSchema = z.array(z.uuid()).min(1, "注文を選択してください").max(200, "一度に操作できるのは200件までです");

/** 追跡番号（決まりは lib/shipping.ts の1か所。CSV取込・運営の入力も同じ） */
export const trackingNumberSchema = z
  .string()
  .trim()
  .transform(normalizeTrackingNumber)
  .pipe(z.string().regex(trackingNumberPattern, "追跡番号は8〜20桁の英数字で入力してください"));

export const shipOrderSchema = z.object({
  id: z.uuid(),
  carrier: z.enum(carrierKeys, "配送業者を選択してください"),
  trackingNumber: trackingNumberSchema,
});

export const bulkShipSchema = z.object({
  rows: z.array(shipOrderSchema).min(1, "発送する注文がありません").max(200),
});

export const cancelOrderSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(2, "キャンセル理由を入力してください").max(300, "300文字以内で入力してください"),
});

export const trackingImportSchema = z.object({
  text: z.string().min(1, "CSVを貼り付けるか、ファイルを選択してください").max(2_000_000, "ファイルが大きすぎます"),
});

/** 売上CSVの期間。注文日ベース（会計期間に合わせる） */
export const salesCsvQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日が正しくありません"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "終了日が正しくありません"),
    encoding: z.enum(["sjis", "utf8"]).default("sjis"),
  })
  .refine((v) => v.from <= v.to, { message: "期間の開始日と終了日が逆です", path: ["to"] });

export const labelQuerySchema = z.object({
  ids: z
    .string()
    .transform((v) => v.split(",").filter(Boolean))
    .pipe(idsSchema),
  carrier: z.enum(carrierKeys),
  encoding: z.enum(["sjis", "utf8"]).default("sjis"),
});

/* ─────────────── shop / settings ─────────────── */

const optionalUrl = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(1000).nullable());

export const shopFormSchema = z.object({
  name: z.string().trim().min(2, "農園名を入力してください").max(40, "40文字以内"),
  tagline: z.string().trim().max(60, "60文字以内で入力してください").default(""),
  story: z.string().trim().max(2000, "2000文字以内で入力してください").default(""),
  representative: z.string().trim().min(1, "代表者名を入力してください").max(40, "40文字以内"),
  establishedYear: optionalInt(1868, 2100, "創業年は西暦4桁で入力してください"),
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d]/g, ""))
    .pipe(z.string().regex(/^(\d{7})?$/, "郵便番号は7桁で入力してください")),
  prefecture: z.string().trim().min(1, "都道府県を入力してください").max(10),
  city: z.string().trim().min(1, "市区町村を入力してください").max(40),
  addressLine: z.string().trim().max(120, "120文字以内").default(""),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[\d-]*$/, "電話番号は数字とハイフンで入力してください")
    .default(""),
  heroImage: optionalUrl,
  avatarImage: optionalUrl,
  gallery: json(z.array(z.string().trim().min(1).max(1000)).max(12, "ギャラリーは12枚までです")),
  cultivationMethods: json(z.array(z.enum(cultivationKeys)).max(5)),
});
export type ShopFormInput = z.infer<typeof shopFormSchema>;

/** 受付停止（お休み）。再開日を必ず決める＝戻し忘れで売り逃さない */
export const farmPauseSchema = z.object({
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "再開日を選んでください")
    .nullable(),
});

export const shippingSettingsSchema = z
  .object({
    defaultCarrier: z.enum(carrierKeys, "配送業者を選択してください"),
    leadTimeDays: z.coerce.number().int().min(1, "1〜7日で設定してください").max(7, "1〜7日で設定してください"),
    shipWeekdays: json(z.array(z.coerce.number().int().min(0).max(6)).min(1, "出荷曜日を1つ以上選択してください").max(7)),
    freeShippingEnabled: bool,
    freeShippingThreshold: optionalInt(1000, 1_000_000, "1,000円以上の金額を入力してください"),
  })
  .refine((v) => !v.freeShippingEnabled || v.freeShippingThreshold != null, {
    message: "送料無料になる金額を入力してください",
    path: ["freeShippingThreshold"],
  });
export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;
