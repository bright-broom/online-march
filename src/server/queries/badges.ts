import "server-only";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import type { NavItem } from "@/config/nav";
import { db } from "@/db";
import { farmOrders, farms, messages, notifications } from "@/db/schema";
import type { SessionUser } from "@/server/auth/session";

export type BadgeCounts = Partial<Record<NonNullable<NavItem["badge"]>, number>>;

/** Live sidebar badge counts (request-time; render inside Suspense). */
export async function getBadgeCounts(user: SessionUser, farmId?: string): Promise<BadgeCounts> {
  const [notif] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  const out: BadgeCounts = { unreadNotifications: notif.n };
  if (user.role === "customer") {
    const [m] = await db.select({ n: count() }).from(messages).where(and(eq(messages.customerId, user.id), ne(messages.senderId, user.id), isNull(messages.readAt)));
    out.unreadMessages = m.n;
  }
  // 生産者画面（オーナーとスタッフ, #24）。farmId は layout がガードを通してから渡す
  if (farmId) {
    const [newOrders] = await db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, farmId), eq(farmOrders.status, "paid")));
    const [toShip] = await db.select({ n: count() }).from(farmOrders).where(and(eq(farmOrders.farmId, farmId), inArray(farmOrders.status, ["paid", "preparing"])));
    const [m] = await db.select({ n: count() }).from(messages).where(and(eq(messages.farmId, farmId), eq(messages.senderId, messages.customerId), isNull(messages.readAt)));
    Object.assign(out, { newOrders: newOrders.n, toShip: toShip.n, unreadMessages: m.n });
  }
  if (user.role === "admin") {
    const [p] = await db.select({ n: count() }).from(farms).where(eq(farms.status, "pending"));
    out.pendingFarms = p.n;
  }
  return out;
}

export async function getRecentNotifications(userId: string, limit = 8) {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: (t, { desc }) => desc(t.createdAt),
    limit,
    columns: { id: true, title: true, body: true, href: true, type: true, createdAt: true, readAt: true },
  });
}
export type RecentNotification = Awaited<ReturnType<typeof getRecentNotifications>>[number];
