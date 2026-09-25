import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

/**
 * The money path, end to end, in one test: cart → order → Stripe webhook → farmer ships → delivery →
 * monthly close → transfer to the farm. Each piece has its own tests; this one fails if the *chain* breaks.
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const WEBHOOK_SECRET = "whsec_golden_route";
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy"); // features.stripe is read when the modules below load
vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);

// Signature verification stays real — only the calls that would reach api.stripe.com are replaced.
vi.mock("@/server/services/payments/stripe", async (importActual) => ({
  ...(await importActual<typeof import("../payments/stripe")>()),
  fetchPayoutReady: vi.fn(async () => true),
  fetchAvailableBalance: vi.fn(async () => 10_000_000),
  transferToFarm: vi.fn(async (p: { payoutId: string }) => ({ id: `tr_job_${p.payoutId.slice(0, 8)}` })),
}));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, transitionFarmOrder } = await import("../orders");
const { constructWebhookEvent } = await import("../payments/stripe");
const { executeDuePayouts } = await import("../payouts");
const { runJob } = await import("@/server/jobs");
const { startOfMonthYmd } = await import("@/lib/dates");
const { feeConfig } = await import("@/config/fees");

const address = { recipientName: "山田 花子", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1-1", phone: "0600000000" };

/** The webhook Stripe sends after a successful Checkout, signed the way Stripe signs it. */
const checkoutCompleted = (orderId: string, sessionId: string, paymentIntentId: string) => {
  const payload = JSON.stringify({
    id: "evt_golden",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", payment_status: "paid", payment_intent: paymentIntentId, metadata: { orderId } } },
  });
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) };
};

describe("golden route: a customer pays and the farmer gets the money", () => {
  it("carries one order from checkout to a Stripe transfer", async () => {
    // the 1st: close-payouts settles last month, and the 15th is when the money actually moves
    const now = new Date(`${startOfMonthYmd(new Date())}T03:00:00+09:00`);
    const payoutDay = new Date(`${startOfMonthYmd(now).slice(0, 8)}${feeConfig.payout.payoutDay}T03:00:00+09:00`);
    const customer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true, farm: true } }))!;
    const variant = product.variants[0];
    await db.update(s.productVariants).set({ stock: 10 }).where(eq(s.productVariants.id, variant.id));
    const stockBefore = 10;

    // 1. checkout — the order is created unpaid and the stock is already reserved
    const { order } = await createOrder({ userId: customer.id, email: customer.email, lines: [{ variantId: variant.id, quantity: 2 }], address, paymentProvider: "stripe", now });
    expect(order.status).toBe("pending_payment");
    expect((await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variant.id) }))!.stock).toBe(stockBefore - 2);

    // 2. Stripe confirms the payment through the webhook route's own verification
    const { payload, signature } = checkoutCompleted(order.id, "cs_test_golden", "pi_test_golden");
    const event = constructWebhookEvent(payload, signature);
    expect(event.type).toBe("checkout.session.completed");
    const session = event.data.object as { metadata?: { orderId?: string }; payment_status?: string; id: string; payment_intent?: string };
    const { markOrderPaid } = await import("../orders");
    await markOrderPaid(session.metadata!.orderId!, { paymentIntentId: session.payment_intent, sessionId: session.id, now });

    const paid = (await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!;
    expect(paid.status).toBe("paid");
    expect(paid.stripePaymentIntentId).toBe("pi_test_golden");
    const [farmOrder] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    expect(farmOrder.status).toBe("paid");
    expect(farmOrder.payoutAmount).toBe(farmOrder.subtotal + farmOrder.shippingFee - farmOrder.commissionAmount);
    const farmerNotices = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, product.farm.ownerId), eq(s.notifications.type, "order")));
    expect(farmerNotices.some((n) => n.body.includes(farmOrder.code))).toBe(true); // the farm heard about it

    // 3. the farmer ships and the delivery lands last month, so the next close picks it up
    await transitionFarmOrder(farmOrder.id, "shipped", { source: "farmer", now, trackingNumber: "412300001111" });
    await transitionFarmOrder(farmOrder.id, "delivered", { source: "cron", now });
    const lastMonth = new Date(new Date(`${startOfMonthYmd(now)}T00:00:00+09:00`).getTime() - 86_400_000);
    await db.update(s.farmOrders).set({ deliveredAt: lastMonth }).where(eq(s.farmOrders.id, farmOrder.id));

    // 4. monthly close turns delivered orders into a payout
    expect((await runJob("close-payouts", "manual", now)).ok).toBe(true);
    const settled = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, farmOrder.id) }))!;
    expect(settled.payoutId).not.toBeNull();
    const payout = (await db.query.payouts.findFirst({ where: eq(s.payouts.id, settled.payoutId!) }))!;
    expect(payout.status).toBe("pending");
    expect(payout.amount).toBeGreaterThanOrEqual(settled.payoutAmount);

    // 5. on the payout day the platform transfers to the farm's connected account
    await db.update(s.farms).set({ stripeAccountId: "acct_golden", stripeOnboarded: true }).where(eq(s.farms.id, farmOrder.farmId));
    expect(payout.scheduledFor!.endsWith(String(feeConfig.payout.payoutDay))).toBe(true); // 翌月15日払い
    const transfer = vi.fn(async () => ({ id: "tr_golden" }));
    const result = await executeDuePayouts(payoutDay, { isReady: async () => true, availableBalance: async () => 10_000_000, findTransfer: async () => null, transfer });

    expect(result.failures).toHaveLength(0);
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acct_golden", amount: payout.amount, payoutId: payout.id }));
    const paidOut = (await db.query.payouts.findFirst({ where: eq(s.payouts.id, payout.id) }))!;
    expect(paidOut.status).toBe("paid");
    expect(paidOut.stripeTransferId).toBe("tr_golden");
    const payoutNotices = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, product.farm.ownerId), eq(s.notifications.type, "payout")));
    expect(payoutNotices.some((n) => n.title === "売上のお振込が完了しました")).toBe(true);

    // the platform kept exactly its commission
    expect(payout.commission).toBeGreaterThan(0);
    expect(settled.payoutAmount).toBe(settled.subtotal + settled.shippingFee - settled.commissionAmount);
  });
});
