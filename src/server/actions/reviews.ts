"use server";
import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmOrders, farms, orderItems, orders, reviews } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { reviewEditSchema, reviewReplySchema, reviewSchema } from "@/lib/validators/engagement";
import { assertFarm, assertRole, assertUser } from "@/server/auth/guards";
import { notify } from "@/server/services/notify";
import { recordAudit } from "@/server/services/audit";
import { recomputeRatings } from "@/server/services/orders";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/** Customer posts a review for a delivered item they purchased. */
export async function createReview(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(reviewSchema, formToObject(formData));
    const [owned] = await db
      .select({ farmId: farmOrders.farmId, status: farmOrders.status })
      .from(orderItems)
      .innerJoin(farmOrders, eq(farmOrders.id, orderItems.farmOrderId))
      .innerJoin(orders, eq(orders.id, farmOrders.orderId))
      .where(and(eq(orderItems.productId, data.productId), eq(farmOrders.id, data.farmOrderId), eq(orders.userId, me.id)));
    if (!owned) throw new ActionError("ご購入履歴が見つかりません");
    if (owned.status !== "delivered") throw new ActionError("商品のお届け後にレビューできます");
    const exists = await db.query.reviews.findFirst({ where: and(eq(reviews.userId, me.id), eq(reviews.productId, data.productId), eq(reviews.farmOrderId, data.farmOrderId)) });
    if (exists) throw new ActionError("この商品のレビューは投稿済みです");
    const [row] = await db.insert(reviews).values({ ...data, userId: me.id, farmId: owned.farmId }).returning({ id: reviews.id });
    await recomputeRatings(data.productId, owned.farmId);
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, owned.farmId) });
    if (farm) await notify({ userId: farm.ownerId, type: "review", title: "新しいレビューが投稿されました", body: `★${data.rating} ${data.title}`, href: routes.farmer.reviews });
    updateTag(tags.productReviews(data.productId));
    return { id: row.id };
  }, "レビューを投稿しました。ありがとうございます！");
}

/**
 * Customer edits their own review. The farm's reply is left as it was — it belongs to the farmer,
 * and the timestamps on screen make the order of the conversation clear.
 */
export async function updateReview(_prev: unknown, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(reviewEditSchema, formToObject(formData));
    const mine = await db.query.reviews.findFirst({ where: and(eq(reviews.id, data.reviewId), eq(reviews.userId, me.id)) });
    if (!mine) throw new ActionError("レビューが見つかりません");
    await db.update(reviews).set({ rating: data.rating, title: data.title, body: data.body }).where(eq(reviews.id, mine.id));
    await recomputeRatings(mine.productId, mine.farmId); // 星が変われば商品・生産者の平均も変わる
    updateTag(tags.productReviews(mine.productId));
  }, "レビューを更新しました");
}

/** Customer withdraws their own review. */
export async function deleteReview(reviewId: string): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const id = parseInput(reviewEditSchema.shape.reviewId, reviewId);
    const mine = await db.query.reviews.findFirst({ where: and(eq(reviews.id, id), eq(reviews.userId, me.id)) });
    if (!mine) throw new ActionError("レビューが見つかりません");
    await db.delete(reviews).where(eq(reviews.id, mine.id));
    await recomputeRatings(mine.productId, mine.farmId);
    updateTag(tags.productReviews(mine.productId));
  }, "レビューを削除しました");
}

/** Farmer replies to a review on their product. */
export async function replyToReview(input: { reviewId: string; reply: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm();
    const data = parseInput(reviewReplySchema, input);
    const review = await db.query.reviews.findFirst({ where: and(eq(reviews.id, data.reviewId), eq(reviews.farmId, farm.id)) });
    if (!review) throw new ActionError("レビューが見つかりません");
    await db.update(reviews).set({ reply: data.reply, repliedAt: new Date() }).where(eq(reviews.id, review.id));
    updateTag(tags.productReviews(review.productId));
  }, "返信を公開しました");
}

/** Admin moderation: publish / unpublish a review. Recorded in the audit log (#19). */
export async function setReviewPublished(input: { reviewId: string; published: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(z.object({ reviewId: z.uuid(), published: z.boolean() }), input);
    const [r] = await db.update(reviews).set({ isPublished: data.published }).where(eq(reviews.id, data.reviewId)).returning();
    if (!r) throw new ActionError("レビューが見つかりません");
    await recordAudit(me, {
      action: "review.published", target: { type: "review", id: r.id },
      summary: `レビュー（★${r.rating}）を${data.published ? "公開" : "非公開に"}`, detail: { published: data.published, productId: r.productId },
    });
    await recomputeRatings(r.productId, r.farmId);
  }, input.published ? "レビューを公開しました" : "レビューを非公開にしました");
}
