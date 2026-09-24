import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isDemoEmail } from "@/config/demo";
import { roleHome, routes } from "@/config/nav";
import { db } from "@/db";
import { farms, type Farm, type UserRole } from "@/db/schema";
import { ActionError } from "@/server/actions/_utils";
import { getSessionUser, type SessionUser } from "./session";

/**
 * 運営は二段階認証が必須。運営画面からは返金・手数料率の変更・全顧客の個人情報の閲覧ができるので、パスワードだけで
 * 入れる状態にしない。設定が済むまでは運営としての操作を一切通さない（ページも Action も、この下の2つの関数で止める）。
 * デモアカウントは共有のため対象外（デモモードを切れば、そもそもログインできない）。
 */
export const needsTwoFactorSetup = (u: Pick<SessionUser, "role" | "twoFactorEnabled" | "email">) =>
  u.role === "admin" && !u.twoFactorEnabled && !isDemoEmail(u.email);

/** Page guard: redirect to login when signed out, and admins to 2FA setup until it is on. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`${routes.login}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (needsTwoFactorSetup(user)) redirect(`${routes.twoFactorSetup}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** Page guard: require one of roles, otherwise send the user to their own home. */
export async function requireRole(roles: UserRole | UserRole[], next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) redirect(roleHome[user.role]);
  return user;
}

const farmOf = cache(async (userId: string) =>
  db.query.farms.findFirst({ where: eq(farms.ownerId, userId) }),
);

/** Page guard for /farmer/*: returns the signed-in farmer's farm. */
export async function requireFarm(): Promise<{ user: SessionUser; farm: Farm }> {
  const user = await requireRole("farmer", routes.farmer.root);
  const farm = await farmOf(user.id);
  if (!farm) redirect(routes.join);
  return { user, farm };
}

/* ── Action guards: throw ActionError instead of redirecting ── */

export async function assertUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ActionError("ログインが必要です");
  if (needsTwoFactorSetup(user)) throw new ActionError("運営の操作には二段階認証の設定が必要です");
  return user;
}

export async function assertRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await assertUser();
  if (!roles.includes(user.role)) throw new ActionError("この操作を行う権限がありません");
  return user;
}

export async function assertFarm(): Promise<{ user: SessionUser; farm: Farm }> {
  const user = await assertRole("farmer");
  const farm = await farmOf(user.id);
  if (!farm) throw new ActionError("農園が登録されていません");
  return { user, farm };
}
