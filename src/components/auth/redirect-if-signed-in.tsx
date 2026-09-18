import { redirect } from "next/navigation";
import { roleHome } from "@/config/nav";
import { getSessionUser } from "@/server/auth/session";
import { safeNext } from "./auth-utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Sends already signed-in users onward (?next= if safe, else their role home).
 * Reads the session → render inside <Suspense>.
 */
export async function RedirectIfSignedIn({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { next } = await searchParams;
  redirect(safeNext(typeof next === "string" ? next : null) ?? roleHome[user.role]);
}
