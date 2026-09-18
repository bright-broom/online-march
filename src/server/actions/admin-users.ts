"use server";
import { and, count, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { userRoleSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * Change a user's role. Guards: you cannot remove your own admin role, and the last admin stays.
 * Note: Better Auth cookieCache (5 min) may delay the change in the user's session.
 */
export async function setUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(userRoleSchema, input);
    if (data.userId === me.id && data.role !== "admin") throw new ActionError("自分自身の運営権限は解除できません");
    const target = await db.query.user.findFirst({ where: eq(user.id, data.userId) });
    if (!target) throw new ActionError("ユーザーが見つかりません");
    if (target.role === data.role) return;
    if (target.role === "admin") {
      const [admins] = await db.select({ n: count() }).from(user).where(eq(user.role, "admin"));
      if (admins.n <= 1) throw new ActionError("運営ユーザーが1人以上必要です");
    }
    await db.update(user).set({ role: data.role }).where(and(eq(user.id, target.id), eq(user.role, target.role)));
    expireTags(tags.analytics);
    refresh();
  }, "ロールを変更しました");
}
