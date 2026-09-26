import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { farms, messages, user } from "@/db/schema";

/**
 * Conversation list for a customer (grouped by farm) or a farm (grouped by customer). Request-time.
 * 未読: お客さま側は「自分以外が送ったもの」、農園側は「お客さまが送ったもの」（オーナーとスタッフは同じ農園側, #24）
 */
export async function listThreads(scope: { customerId: string } | { farmId: string }) {
  const isCustomer = "customerId" in scope;
  const fromOtherSide = isCustomer ? sql`${messages.senderId} <> ${scope.customerId}` : sql`${messages.senderId} = ${messages.customerId}`;
  const rows = await db
    .select({
      farmId: messages.farmId,
      customerId: messages.customerId,
      lastAt: sql<Date>`max(${messages.createdAt})`.as("last_at"),
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${fromOtherSide})`.mapWith(Number),
      lastBody: sql<string>`(array_agg(${messages.body} order by ${messages.createdAt} desc))[1]`,
    })
    .from(messages)
    .where(isCustomer ? eq(messages.customerId, scope.customerId) : eq(messages.farmId, scope.farmId))
    .groupBy(messages.farmId, messages.customerId)
    .orderBy(desc(sql`last_at`));
  const farmIds = [...new Set(rows.map((r) => r.farmId))];
  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const farmRows = farmIds.length
    ? await db.select({ id: farms.id, name: farms.name, avatarImage: farms.avatarImage, slug: farms.slug }).from(farms).where(inArray(farms.id, farmIds))
    : [];
  const customerRows = customerIds.length && !isCustomer ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, customerIds)) : [];
  return rows.map((r) => ({
    ...r,
    lastAt: new Date(r.lastAt),
    farm: farmRows.find((f) => f.id === r.farmId) ?? null,
    customerName: customerRows.find((c) => c.id === r.customerId)?.name ?? null,
  }));
}
export type Thread = Awaited<ReturnType<typeof listThreads>>[number];

/** senderName は農園側の画面でだけ使う（誰が送ったか, #24）。お客さまの画面には農園名だけを出す */
export async function getThread(farmId: string, customerId: string) {
  return db
    .select({ id: messages.id, body: messages.body, senderId: messages.senderId, senderName: user.name, createdAt: messages.createdAt, readAt: messages.readAt })
    .from(messages)
    .leftJoin(user, eq(user.id, messages.senderId))
    .where(and(eq(messages.farmId, farmId), eq(messages.customerId, customerId)))
    .orderBy(asc(messages.createdAt));
}
export type ThreadMessage = Awaited<ReturnType<typeof getThread>>[number];

/** 相手側から届いた分を既読にする。side = 読んでいるのがお客さまか農園（オーナー・スタッフ）か */
export async function markThreadRead(farmId: string, customerId: string, side: "customer" | "farm") {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.farmId, farmId),
        eq(messages.customerId, customerId),
        side === "farm" ? eq(messages.senderId, customerId) : ne(messages.senderId, customerId),
        isNull(messages.readAt),
      ),
    );
}
