import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isDemoEmail } from "@/config/demo";
import { canFarm, farmStaffCopy, type FarmAccess, type FarmCapability } from "@/config/farm-staff";
import { roleHome, routes } from "@/config/nav";
import { db } from "@/db";
import { farmMembers, farms, type Farm, type UserRole } from "@/db/schema";
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

export type FarmContext = { user: SessionUser; farm: Farm; access: FarmAccess };

/**
 * ログイン中の人が生産者画面で扱える農園と権限（#24）。
 * - 生産者（role=farmer）: 自分がオーナーの農園
 * - 購入者（role=customer）: 参加済み（acceptedAt あり）のスタッフとして所属する農園。ロールは変えない
 * - 運営・どちらでもない人: なし
 */
export const farmAccessOf = cache(async (userId: string, role: UserRole): Promise<{ farm: Farm; access: FarmAccess } | null> => {
  if (role === "farmer") {
    const farm = await db.query.farms.findFirst({ where: eq(farms.ownerId, userId) });
    return farm ? { farm, access: "owner" } : null;
  }
  if (role !== "customer") return null;
  const [row] = await db
    .select({ farm: farms, access: farmMembers.access })
    .from(farmMembers)
    .innerJoin(farms, eq(farms.id, farmMembers.farmId))
    .where(and(eq(farmMembers.userId, userId), isNotNull(farmMembers.acceptedAt)))
    .limit(1);
  return row ?? null;
});

/** 権限が足りないときに送る先。スタッフは概要（売上）を見られないので受注管理へ */
const farmHome = (access: FarmAccess) => (access === "owner" ? routes.farmer.root : routes.farmer.orders);

/**
 * Page guard for /farmer/*. `capability` は必須（config/farm-staff.ts）。書き忘れると型で落ちるので、新しいページを足すときに
 * 「スタッフに見せてよいか」を必ず決めることになる。"member" はオーナーとスタッフ全員（レイアウト・自分のアカウント画面）。
 */
export async function requireFarm(capability: FarmCapability | "member"): Promise<FarmContext> {
  const user = await requireUser(routes.farmer.root);
  const ctx = await farmAccessOf(user.id, user.role);
  if (!ctx) redirect(user.role === "farmer" ? routes.join : roleHome[user.role]);
  if (capability !== "member" && !canFarm(ctx.access, capability)) redirect(farmHome(ctx.access));
  return { user, ...ctx };
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

/** Action / Route Handler guard for the farmer dashboard. `capability` は requireFarm と同じ */
export async function assertFarm(capability: FarmCapability | "member"): Promise<FarmContext> {
  const user = await assertUser();
  const ctx = await farmAccessOf(user.id, user.role);
  if (!ctx) throw new ActionError(user.role === "farmer" ? "農園が登録されていません" : "この操作を行う権限がありません");
  if (capability !== "member" && !canFarm(ctx.access, capability)) throw new ActionError(farmStaffCopy.errors.noPermission);
  return { user, ...ctx };
}
