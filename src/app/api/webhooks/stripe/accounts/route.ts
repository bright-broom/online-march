import { NextResponse } from "next/server";
import { env, features } from "@/lib/env";
import { syncFarmPayoutReady } from "@/server/services/payments/connect";
import { parseAccountEventNotification } from "@/server/services/payments/stripe";

/**
 * Accounts v2 thin events (event destination "Your account", payload style "thin"):
 * v2.core.account[configuration.recipient].capability_status_updated / [requirements].updated etc.
 * The payload only names the account, so readiness is re-read from Stripe.
 */
export async function POST(req: Request) {
  if (!features.stripe || !env.STRIPE_ACCOUNTS_WEBHOOK_SECRET) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  let accountId;
  try {
    ({ accountId } = parseAccountEventNotification(await req.text(), signature));
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (accountId) await syncFarmPayoutReady(accountId);
  return NextResponse.json({ received: true });
}
