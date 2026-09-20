import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { notifications, user } from "@/db/schema";
import { notify } from "./notify";

/**
 * Pushes an operational problem to every admin. The operator does not watch /admin/automation, so anything that
 * stops money or orders from moving has to reach them. Repeats within `quietHours` are dropped: a daily cron that
 * keeps failing should not fill the bell with the same line.
 */
export async function alertAdmins(p: { title: string; body: string; href: string; quietHours?: number }) {
  const since = new Date(Date.now() - (p.quietHours ?? 20) * 3_600_000);
  const [recent] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.title, p.title), eq(notifications.body, p.body), gt(notifications.createdAt, since)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (recent) return false;
  const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  for (const a of admins) await notify({ userId: a.id, type: "system", title: p.title, body: p.body, href: p.href });
  return admins.length > 0;
}
