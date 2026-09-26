"use server";
import { and, count, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";

const roleLabel = { customer: "購入者", farmer: "生産者", admin: "運営" } as const;
import { session, user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { userModerationCopy } from "@/config/content";
import { userIdSchema, userRoleSchema, userSuspendSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { AccountCloseBlocked, closeCustomerAccount } from "@/server/services/account-closure";
import { recordAudit } from "@/server/services/audit";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * Change a user's role. Guards: you cannot remove your own admin role, and the last admin stays.
 * Takes effect on the next request (no session cookie cache). Demotions also revoke all of the
 * user's sessions so an open tab cannot keep using elevated pages.
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
    await recordAudit(me, {
      action: "user.role", target: { type: "user", id: target.id },
      summary: `${target.email} のロールを ${roleLabel[target.role]} → ${roleLabel[data.role]} に変更`,
      detail: { from: target.role, to: data.role },
    });
    const rank = { customer: 0, farmer: 1, admin: 2 } as const;
    if (rank[data.role] < rank[target.role]) await db.delete(session).where(eq(session.userId, target.id));
    expireTags(tags.analytics);
    refresh();
  }, "ロールを変更しました");
}

/** 利用停止・匿名化の対象にできるか。自分自身と運営ユーザーは不可（運営は先にロールを変える＝最後の1人の決まりが効く） */
async function moderationTarget(me: { id: string }, userId: string) {
  const E = userModerationCopy.errors;
  if (userId === me.id) throw new ActionError(E.self);
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) throw new ActionError(E.notFound);
  if (target.role === "admin") throw new ActionError(E.admin);
  if (target.deletedAt) throw new ActionError(E.alreadyClosed);
  return target;
}

/**
 * 利用停止・再開（#21）。停止するとログインできなくなり（auth.ts の databaseHooks）、ログイン中の端末も切れる。
 * 注文・レビュー・ショップはそのまま（進行中の注文は生産者が発送し、返金が要れば運営が refundOrder で行う）。
 * 生産者を停止してもショップは公開のまま。ショップも止めるなら生産者の画面で出店を停止する。
 */
export async function setUserSuspended(input: { userId: string; suspended: boolean; reason?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(userSuspendSchema, input);
    const target = await moderationTarget(me, data.userId);
    if (Boolean(target.suspendedAt) === data.suspended) return;
    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set(data.suspended ? { suspendedAt: new Date(), suspendedReason: data.reason } : { suspendedAt: null, suspendedReason: "" })
        .where(eq(user.id, target.id));
      if (data.suspended) await tx.delete(session).where(eq(session.userId, target.id));
    });
    await recordAudit(me, {
      action: "user.suspend", target: { type: "user", id: target.id },
      summary: `${target.email} の利用を${data.suspended ? "停止" : "再開"}`,
      detail: data.suspended ? { suspended: true, reason: data.reason } : { suspended: false, previousReason: target.suspendedReason },
    });
    refresh();
  }, input.suspended ? "利用を停止しました" : "利用を再開しました");
}

/**
 * 匿名化（#21）。お客さまからの削除依頼などで、運営が退会と同じ処理（services/account-closure.ts）を行う。
 * 進行中の注文がある間はできない（配送・返金の連絡先が消えるため）。取引の記録とレビュー本文は残る。取り消せない。
 */
export async function anonymizeUser(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { userId } = parseInput(userIdSchema, input);
    const target = await moderationTarget(me, userId);
    const E = userModerationCopy.errors;
    try {
      await closeCustomerAccount(target.id);
    } catch (e) {
      if (!(e instanceof AccountCloseBlocked)) throw e;
      throw new ActionError(e.reason === "live_orders" ? E.liveOrders : e.reason === "already_closed" ? E.alreadyClosed : E.notCustomer);
    }
    // 記録には元のアドレスを残さない（匿名化の意味がなくなる）。誰だったかは user id で追える
    await recordAudit(me, { action: "user.anonymize", target: { type: "user", id: target.id }, summary: `ユーザー ${target.id} を匿名化`, detail: { role: target.role } });
    expireTags(tags.analytics);
    refresh();
  }, "ユーザーを匿名化しました");
}
