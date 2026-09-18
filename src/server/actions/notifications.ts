"use server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { assertUser } from "@/server/auth/guards";
import { runAction } from "./_utils";

export async function markAllNotificationsRead() {
  return runAction(async () => {
    const user = await assertUser();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  });
}

export async function markNotificationRead(id: string) {
  return runAction(async () => {
    const user = await assertUser();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  });
}
