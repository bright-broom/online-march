import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { features } from "@/lib/env";
import { assertFarm } from "@/server/auth/guards";

/**
 * GET /api/farmer/stripe-return — Stripe Connect onboarding return_url.
 * Syncs `farms.stripeOnboarded` right away so the farmer sees the result without waiting for the
 * account.updated webhook (which stays the source of truth for later changes).
 */
export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  let farm: Awaited<ReturnType<typeof assertFarm>>["farm"];
  try {
    ({ farm } = await assertFarm());
  } catch {
    return to(`${routes.login}?next=${encodeURIComponent(routes.farmer.payouts)}`);
  }
  if (features.stripe && farm.stripeAccountId) {
    try {
      const { fetchPayoutReady } = await import("@/server/services/payments/stripe");
      const ready = await fetchPayoutReady(farm.stripeAccountId);
      if (ready !== farm.stripeOnboarded) await db.update(farms).set({ stripeOnboarded: ready }).where(eq(farms.id, farm.id));
    } catch (e) {
      console.error("[stripe-return] account sync failed", e);
    }
  }
  return to(`${routes.farmer.payouts}?stripe=return`);
}
