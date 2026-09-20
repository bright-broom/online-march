import { NextResponse } from "next/server";
import { features } from "@/lib/env";
import { expireUnpaidOrder, markOrderPaid, recordAwaitingPayment } from "@/server/services/orders";
import { syncFarmPayoutReady } from "@/server/services/payments/connect";
import { constructWebhookEvent, fetchPaymentDetails } from "@/server/services/payments/stripe";

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
      if (!orderId) break;
      const paymentIntentId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      // Which method was used (and, for コンビニ払い, where the payment slip is) only lives on the PaymentIntent.
      const details = paymentIntentId ? await fetchPaymentDetails(paymentIntentId) : null;
      if (s.payment_status === "paid") {
        await markOrderPaid(orderId, { paymentIntentId, sessionId: s.id, method: details?.method, now });
      } else {
        // コンビニ払い等: 支払い番号が出ただけ。入金は async_payment_succeeded で確定する
        await recordAwaitingPayment(orderId, {
          paymentIntentId, sessionId: s.id,
          method: details?.method ?? null, voucherUrl: details?.voucherUrl ?? null, dueAt: details?.dueAt ?? null, now,
        });
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
      // v1 snapshot event (still sent for v2 accounts): re-read readiness through Accounts v2
      await syncFarmPayoutReady(event.data.object.id);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
