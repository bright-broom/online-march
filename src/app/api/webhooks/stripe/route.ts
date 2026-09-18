import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { features } from "@/lib/env";
import { expireUnpaidOrder, markOrderPaid } from "@/server/services/orders";
import { constructWebhookEvent } from "@/server/services/payments/stripe";

/** Stripe webhook: checkout completion/expiry and Connect onboarding status. */
export async function POST(req: Request) {
  if (!features.stripe) return NextResponse.json({ error: "stripe disabled" }, { status: 404 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  let event;
  try {
    event = constructWebhookEvent(await req.text(), signature);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const now = new Date();
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const orderId = s.metadata?.orderId;
      if (orderId && s.payment_status === "paid") {
        await markOrderPaid(orderId, { paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id, sessionId: s.id, now });
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) await expireUnpaidOrder(orderId, now);
      break;
    }
    case "account.updated": {
      const a = event.data.object;
      await db.update(farms).set({ stripeOnboarded: Boolean(a.charges_enabled || a.payouts_enabled) }).where(eq(farms.stripeAccountId, a.id));
      break;
    }
  }
  return NextResponse.json({ received: true });
}
