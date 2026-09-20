import "server-only";
import Stripe from "stripe";
import { feeConfig } from "@/config/fees";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { env, features, siteUrl } from "@/lib/env";

/**
 * Stripe adapter. Model: "separate charges and transfers" (Stripe Connect, Accounts v2 recipients with the Express Dashboard).
 *  - Customer pays the platform once per checkout (transfer_group = order code).
 *  - Monthly payout job transfers each farm's net amount to its connected account.
 * Without STRIPE_SECRET_KEY, callers use the demo payment path (features.stripe === false).
 */
let stripe: Stripe | null = null;
export function getStripe() {
  if (!features.stripe) throw new Error("Stripe is not configured");
  stripe ??= new Stripe(env.STRIPE_SECRET_KEY!, { appInfo: { name: siteConfig.nameEn } });
  return stripe;
}

export type CheckoutLine = { name: string; description?: string; unitAmount: number; quantity: number; image?: string | null };

export async function createCheckoutSession(p: {
  orderId: string;
  orderCode: string;
  email: string;
  lines: CheckoutLine[];
  shippingTotal: number;
  discountTotal: number;
}) {
  const s = getStripe();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = p.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency: "jpy",
      unit_amount: l.unitAmount,
      product_data: {
        name: l.name,
        description: l.description,
        images: l.image?.startsWith("https://") ? [l.image] : undefined,
      },
    },
  }));
  if (p.shippingTotal > 0) {
    lineItems.push({ quantity: 1, price_data: { currency: "jpy", unit_amount: p.shippingTotal, product_data: { name: "送料" } } });
  }
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
  if (p.discountTotal > 0) {
    const coupon = await s.coupons.create(
      { amount_off: p.discountTotal, currency: "jpy", duration: "once", max_redemptions: 1, name: "クーポン割引" },
      { idempotencyKey: `checkout-coupon:${p.orderId}` },
    );
    discounts = [{ coupon: coupon.id }];
  }
  return s.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: p.email,
      line_items: lineItems,
      discounts,
      locale: "ja",
      client_reference_id: p.orderId,
      metadata: { orderId: p.orderId, orderCode: p.orderCode },
      payment_intent_data: { transfer_group: p.orderCode, metadata: { orderId: p.orderId } },
      success_url: `${siteUrl}${routes.checkoutSuccess}?order=${p.orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}${routes.cart}?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    { idempotencyKey: `checkout-session:${p.orderId}` },
  );
}

export type StaleCheckoutOutcome =
  | { kind: "paid"; paymentIntentId: string | null }
  /** Voucher issued (コンビニ払い等) — money not received yet; the async_payment_* webhook settles it. */
  | { kind: "awaiting_async" }
  | { kind: "expired" };

/**
 * Decide the fate of an order whose checkout TTL passed. Open sessions are expired first so the
 * customer cannot pay after we cancel; a session that was paid but whose webhook we missed is recovered.
 */
export async function resolveStaleCheckout(sessionId: string): Promise<StaleCheckoutOutcome> {
  const s = getStripe();
  let session = await s.checkout.sessions.retrieve(sessionId);
  if (session.status === "open") {
    try {
      session = await s.checkout.sessions.expire(sessionId);
    } catch {
      session = await s.checkout.sessions.retrieve(sessionId); // completed in the meantime
    }
  }
  if (session.status !== "complete") return { kind: "expired" };
  if (session.payment_status === "unpaid") return { kind: "awaiting_async" };
  const pi = session.payment_intent;
  return { kind: "paid", paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? null) };
}

/**
 * Stripe signs each event destination with its own secret: platform events (checkout.session.*)
 * and Connect events (account.updated of connected accounts) arrive on the same URL, so try both.
 */
export function constructWebhookEvent(payload: string, signature: string) {
  const secrets = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s));
  if (!secrets.length) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(payload, signature, secret);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Accounts v2 thin events (v2.core.account[...]) come from a separate "Your account" event destination
 * with its own secret. They carry only the account id, so callers re-fetch the account.
 * Returns the connected account the event is about, or null for any other event.
 */
export function parseAccountEventNotification(payload: string, signature: string) {
  if (!env.STRIPE_ACCOUNTS_WEBHOOK_SECRET) throw new Error("STRIPE_ACCOUNTS_WEBHOOK_SECRET is not set");
  const n = getStripe().parseEventNotification(payload, signature, env.STRIPE_ACCOUNTS_WEBHOOK_SECRET);
  const related = "related_object" in n ? n.related_object : null;
  return { type: n.type, accountId: related?.type === "v2.core.account" ? related.id : null };
}

/** A farm can be paid once the recipient configuration's stripe_transfers capability is active. */
export function isPayoutReady(account: Stripe.V2.Core.Account) {
  return account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
}

/** Works for accounts created with Accounts v1 too (same acct_ id). */
export async function fetchPayoutReady(accountId: string) {
  return isPayoutReady(await getStripe().v2.core.accounts.retrieve(accountId, { include: ["configuration.recipient"] }));
}

/** `key` identifies the business operation (e.g. order / farm order) so a retried request never refunds twice. */
export async function refundPayment(paymentIntentId: string, amount: number | undefined, key: string) {
  return getStripe().refunds.create({ payment_intent: paymentIntentId, amount }, { idempotencyKey: `refund:${key}` });
}

/**
 * Connect onboarding for a farm (Accounts v2). The farm is a recipient: it only receives transfers from the
 * platform balance, has the Express Dashboard, and the platform pays Stripe fees and owns negative balances.
 * Once onboarded, the link opens the farm's Express Dashboard instead (bank account / identity changes, payouts).
 */
export async function createConnectOnboardingLink(p: { farmId: string; accountId?: string | null; onboarded: boolean; email: string; farmName: string }) {
  const s = getStripe();
  const accountId =
    p.accountId ??
    (
      await s.v2.core.accounts.create(
        {
          contact_email: p.email,
          display_name: p.farmName,
          dashboard: "express",
          identity: { country: "jp" },
          defaults: {
            currency: "jpy",
            locales: ["ja"],
            profile: { product_description: feeConfig.connect.productDescription },
            responsibilities: { fees_collector: "application", losses_collector: "application" },
          },
          configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        },
        { idempotencyKey: `connect-account:${p.farmId}` }, // a double-click must not create two accounts
      )
    ).id;
  // Express accounts cannot use account_update links: once onboarded, bank / identity changes happen in the Express Dashboard.
  if (p.accountId && p.onboarded) return { accountId, url: (await s.accounts.createLoginLink(accountId)).url };
  const link = await s.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: `${siteUrl}${routes.farmer.payouts}?stripe=refresh`,
        return_url: `${siteUrl}${routes.farmer.stripeReturn}`,
      },
    },
  });
  return { accountId, url: link.url };
}

/** Platform balance that can be transferred right now (JPY). Pending charge funds are not included. */
export async function fetchAvailableBalance(currency = "jpy") {
  const balance = await getStripe().balance.retrieve();
  return balance.available.find((b) => b.currency === currency)?.amount ?? 0;
}

export async function transferToFarm(p: { accountId: string; amount: number; payoutId: string; description: string }) {
  return getStripe().transfers.create({
    amount: p.amount,
    currency: "jpy",
    destination: p.accountId,
    description: p.description,
    metadata: { payoutId: p.payoutId },
  }, { idempotencyKey: `payout-transfer:${p.payoutId}` }); // a retry after a failed DB write must not pay twice
}
