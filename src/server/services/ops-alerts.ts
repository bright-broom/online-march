import "server-only";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { notifications, user } from "@/db/schema";
import { emailTemplates } from "./email/templates";
import { notify } from "./notify";

/**
 * Pushes an operational problem to every admin. The operator does not watch /admin/automation, so anything that
 * stops money or orders from moving has to reach them. Repeats within `quietHours` are dropped: a daily cron that
 * keeps failing should not fill the bell with the same line.
 * `email` also mails each admin (server errors, #12). `maxPerHour` caps alerts with this title regardless of body,
 * so a burst of different errors (an outage) sends a handful, not hundreds.
 */
export async function alertAdmins(p: { title: string; body: string; href: string; quietHours?: number; email?: boolean; maxPerHour?: number }) {
  const since = new Date(Date.now() - (p.quietHours ?? 20) * 3_600_000);
  const [recent] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.title, p.title), eq(notifications.body, p.body), gt(notifications.createdAt, since)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (recent) return false;
  const admins = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.role, "admin"));
  if (p.maxPerHour !== undefined && admins.length) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.title, p.title), eq(notifications.userId, admins[0].id), gt(notifications.createdAt, new Date(Date.now() - 3_600_000))));
    if (n >= p.maxPerHour) return false;
  }
  for (const a of admins) {
    await notify({
      userId: a.id, type: "system", title: p.title, body: p.body, href: p.href,
      email: p.email ? emailTemplates.opsAlert({ to: a.email, title: p.title, body: p.body, href: p.href }) : undefined,
    });
  }
  return admins.length > 0;
}
