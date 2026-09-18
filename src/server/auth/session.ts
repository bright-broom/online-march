import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import type { UserRole } from "@/db/schema";
import { auth } from "./auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
};

/**
 * Reads the session cookie (request-time API → callers must render inside <Suspense>).
 * Deduped per request via React cache().
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: UserRole };
  return { id: u.id, name: u.name, email: u.email, image: u.image ?? null, role: u.role ?? "customer" };
});
