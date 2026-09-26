import { z } from "zod";
import { catalogLimits } from "@/config/catalog";

/**
 * レビューの写真（#21）に付けてよい URL: このサイトのアップロード（services/storage.ts#storeImage）が reviews フォルダに
 * 置いたものだけ。任意の URL を許すと、よその画像（追跡用・不適切なもの）を商品ページに出せてしまう。
 */
const uploadedName = "[a-z0-9]+-[a-z0-9]+\\.(?:jpg|png|webp|avif)";
export const reviewImageUrlPattern = new RegExp(`^(?:/uploads/reviews/|https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/reviews/)${uploadedName}$`);
const reviewImages = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    if (!v.trim()) return [];
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  },
  z
    .array(z.string().regex(reviewImageUrlPattern, "写真はこの画面からアップロードしてください"))
    .max(catalogLimits.maxReviewImages, `写真は${catalogLimits.maxReviewImages}枚までです`)
    .default([]),
);

export const messageSchema = z.object({
  farmId: z.uuid(),
  customerId: z.string().min(1).optional(),
  farmOrderId: z.uuid().optional(),
  body: z.string().trim().min(1, "メッセージを入力してください").max(2000, "2000文字以内で入力してください"),
});

export const reviewSchema = z.object({
  productId: z.uuid(),
  farmOrderId: z.uuid(),
  rating: z.coerce.number().int().min(1, "評価を選択してください").max(5),
  title: z.string().trim().max(60, "60文字以内").default(""),
  body: z.string().trim().min(10, "10文字以上でご記入ください").max(2000),
  images: reviewImages,
});

/** 投稿済みレビューの編集。商品と注文は動かせないので id だけ受け取る */
export const reviewEditSchema = z.object({
  reviewId: z.uuid(),
  rating: z.coerce.number().int().min(1, "評価を選択してください").max(5),
  title: z.string().trim().max(60, "60文字以内").default(""),
  body: z.string().trim().min(10, "10文字以上でご記入ください").max(2000),
  images: reviewImages,
});

export const reviewReplySchema = z.object({
  reviewId: z.uuid(),
  reply: z.string().trim().min(1, "返信を入力してください").max(1000),
});
