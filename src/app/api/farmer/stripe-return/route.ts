import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/config/nav";
import { features } from "@/lib/env";
import { assertFarm } from "@/server/auth/guards";

/**
 * GET /api/farmer/stripe-return — Stripe Connect onboarding return_url.
 * Syncs `farms.stripeOnboarded` right away so the farmer sees the result without waiting for the
 * account webhooks (which stay the source of truth for later changes).
 */
export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  let farm: Awaited<ReturnType<typeof assertFarm>>["farm"];
  try {
    ({ farm } = await assertFarm("money"));
  } catch {
    return to(`${routes.login}?next=${encodeURIComponent(routes.farmer.payouts)}`);
  }
  if (features.stripe && farm.stripeAccountId) {
    try {
      const { syncFarmPayoutReady } = await import("@/server/services/payments/connect");
      await syncFarmPayoutReady(farm.stripeAccountId);
    } catch (e) {
      console.error("[stripe-return] account sync failed", e);
    }
  }
  return to(`${routes.farmer.payouts}?stripe=return`);
}
