import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { farms, messages, user } from "@/db/schema";

/** Conversation list for a customer (grouped by farm) or a farm (grouped by customer). Request-time. */
export async function listThreads(scope: { customerId: string } | { farmId: string; viewerId: string }) {
  const isCustomer = "customerId" in scope;
  const viewerId = isCustomer ? scope.customerId : scope.viewerId;
  const rows = await db
    .select({
      farmId: messages.farmId,
      customerId: messages.customerId,
      lastAt: sql<Date>`max(${messages.createdAt})`.as("last_at"),
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null and ${messages.senderId} <> ${viewerId})`.mapWith(Number),
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

export async function getThread(farmId: string, customerId: string) {
  return db
    .select({ id: messages.id, body: messages.body, senderId: messages.senderId, createdAt: messages.createdAt, readAt: messages.readAt })
    .from(messages)
    .where(and(eq(messages.farmId, farmId), eq(messages.customerId, customerId)))
    .orderBy(asc(messages.createdAt));
}
export type ThreadMessage = Awaited<ReturnType<typeof getThread>>[number];

export async function markThreadRead(farmId: string, customerId: string, viewerId: string) {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.farmId, farmId), eq(messages.customerId, customerId), ne(messages.senderId, viewerId), isNull(messages.readAt)));
}
