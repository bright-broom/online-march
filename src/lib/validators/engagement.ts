import { z } from "zod";

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
});

/** 投稿済みレビューの編集。商品と注文は動かせないので id だけ受け取る */
export const reviewEditSchema = z.object({
  reviewId: z.uuid(),
  rating: z.coerce.number().int().min(1, "評価を選択してください").max(5),
  title: z.string().trim().max(60, "60文字以内").default(""),
  body: z.string().trim().min(10, "10文字以上でご記入ください").max(2000),
});

export const reviewReplySchema = z.object({
  reviewId: z.uuid(),
  reply: z.string().trim().min(1, "返信を入力してください").max(1000),
});
