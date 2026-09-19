import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { fetchPayoutReady } from "./stripe";

/**
 * Re-reads the connected account from Stripe (Accounts v2) and stores whether the farm can receive transfers.
 * Used by the onboarding return URL and by both webhook routes, so every path applies the same readiness rule.
 */
export async function syncFarmPayoutReady(accountId: string) {
  const ready = await fetchPayoutReady(accountId);
  await db.update(farms).set({ stripeOnboarded: ready }).where(eq(farms.stripeAccountId, accountId));
  return ready;
}
