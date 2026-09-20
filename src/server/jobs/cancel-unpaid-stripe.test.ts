import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/env", async (orig) => {
  const m = await orig<typeof import("@/lib/env")>();
  return { ...m, features: { ...m.features, stripe: true } };
});
const resolveStaleCheckout = vi.fn();
const cancelPaymentIntent = vi.fn(async () => {});
const fetchPaymentDetails = vi.fn(async () => ({ method: "konbini", voucherUrl: null, dueAt: null }));
vi.mock("@/server/services/payments/stripe", () => ({ resolveStaleCheckout, cancelPaymentIntent, fetchPaymentDetails }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder } = await import("@/server/services/orders");
const { runJob } = await import("./index");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };

describe("cancel-unpaid with Stripe sessions", () => {
  let userId = "";
  let variantId = "";
  beforeAll(async () => {
    userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
    const p = await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } });
    variantId = p!.variants[0].id;
  });

  async function staleOrder(ageMs: number) {
    const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "stripe", now: new Date() });
    await db.update(s.orders).set({ createdAt: new Date(Date.now() - ageMs), stripeSessionId: `cs_test_${order.id}` }).where(eq(s.orders.id, order.id));
    return order.id;
  }
  beforeEach(() => {
    cancelPaymentIntent.mockClear();
  });

  const statusOf = async (id: string) => (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!.status;

  it("recovers a paid session whose webhook was missed", async () => {
    const id = await staleOrder(2 * 3600_000);
    resolveStaleCheckout.mockResolvedValueOnce({ kind: "paid", paymentIntentId: "pi_test_1" });
    fetchPaymentDetails.mockResolvedValueOnce({ method: "paypay", voucherUrl: null, dueAt: null });
    await runJob("cancel-unpaid", "manual");
    const order = (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!;
    expect(order.status).toBe("paid");
    expect(order.paymentMethod).toBe("paypay"); // which method paid it, for support and receipts
  });

  it("keeps a konbini order awaiting payment within the grace period", async () => {
    const id = await staleOrder(2 * 3600_000);
    resolveStaleCheckout.mockResolvedValueOnce({ kind: "awaiting_async", paymentIntentId: "pi_wait" });
    await runJob("cancel-unpaid", "manual");
    expect(await statusOf(id)).toBe("pending_payment");
    expect(cancelPaymentIntent).not.toHaveBeenCalled(); // the slip must stay payable
  });

  it("cancels a konbini order after the grace period, and expired sessions", async () => {
    const old = await staleOrder(8 * 86_400_000);
    const expired = await staleOrder(2 * 3600_000);
    resolveStaleCheckout.mockImplementation(async (sid: string) => (sid.endsWith(old) ? { kind: "awaiting_async", paymentIntentId: "pi_giveup" } : { kind: "expired" }));
    await runJob("cancel-unpaid", "manual");
    expect(await statusOf(old)).toBe("cancelled");
    expect(await statusOf(expired)).toBe("cancelled");
    // the payment slip dies with the order — otherwise the customer could still pay at the register
    expect(cancelPaymentIntent).toHaveBeenCalledWith("pi_giveup");
  });
});
