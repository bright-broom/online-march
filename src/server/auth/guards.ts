import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { roleHome, routes } from "@/config/nav";
import { db } from "@/db";
import { farms, type Farm, type UserRole } from "@/db/schema";
import { ActionError } from "@/server/actions/_utils";
import { getSessionUser, type SessionUser } from "./session";

/** Page guard: redirect to login when signed out. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`${routes.login}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
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
