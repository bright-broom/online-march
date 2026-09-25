import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 精算の「振込済みにする」（#13）。Stripe が自動で送金する農家に運営が銀行振込もすると二重払いになる。
 * Stripe の送金が通ったのに DB の記録だけ失敗した精算にもエラーが残るので、エラーの有無だけでは判断せず Stripe に確かめる。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { executeDuePayouts, markPayoutPaidManually } = await import("../payouts");
const { toYmd } = await import("@/lib/dates");

const now = new Date();
const payout = async (id: string) => (await db.query.payouts.findFirst({ where: eq(s.payouts.id, id) }))!;

async function setup(farm: { stripeAccountId: string | null; stripeOnboarded: boolean }, transferError: string | null = null) {
  const [f] = await db.select().from(s.farms).where(eq(s.farms.status, "active")).limit(1);
  await db.update(s.farms).set(farm).where(eq(s.farms.id, f.id));
  await db.update(s.payouts).set({ status: "paid" }).where(eq(s.payouts.status, "pending")); // isolate from seed and other cases
  const [p] = await db
    .insert(s.payouts)
    .values({ farmId: f.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 3000, shippingFees: 0, commission: 0, amount: 3000, orderCount: 1, scheduledFor: toYmd(now), transferError })
    .returning();
  return { farm: f, p };
}

const findTransfer = vi.fn(async (_: { accountId: string; payoutId: string }): Promise<{ id: string } | null> => null);
beforeEach(() => {
  findTransfer.mockReset();
  findTransfer.mockResolvedValue(null);
});

describe("精算の振込済みにする", () => {
  it("Stripe が自動送金する農家で送金失敗の記録がなければ手動では記録できない", async () => {
    const { p } = await setup({ stripeAccountId: "acct_auto", stripeOnboarded: true });

    expect(await markPayoutPaidManually(p.id, now, findTransfer)).toEqual({ kind: "automatic" });
    expect((await payout(p.id)).status).toBe("pending");
  });

  it("送金失敗が記録されていても Stripe に送金があれば、その送金を記録して手動振込にしない", async () => {
    // transfer went through, then the DB write failed — the catch left an error on the payout
    const { farm, p } = await setup({ stripeAccountId: "acct_dbfail", stripeOnboarded: true }, "connection terminated");
    findTransfer.mockResolvedValue({ id: "tr_already" });

    expect(await markPayoutPaidManually(p.id, now, findTransfer)).toEqual({ kind: "already_transferred", transferId: "tr_already" });
    expect(findTransfer).toHaveBeenCalledWith({ accountId: "acct_dbfail", payoutId: p.id });
    expect(await payout(p.id)).toMatchObject({ status: "paid", stripeTransferId: "tr_already", transferError: null });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, farm.ownerId));
    expect(notes.filter((n) => n.title === "売上のお振込が完了しました" && n.body.includes("3,000")).length).toBe(1);
  });

  it("送金失敗が記録され Stripe にも送金がなければ手動で記録でき、自動送金の対象から外れる", async () => {
    const { p } = await setup({ stripeAccountId: "acct_failed", stripeOnboarded: true }, "balance_insufficient");

    expect(await markPayoutPaidManually(p.id, now, findTransfer)).toEqual({ kind: "marked" });
    expect(await payout(p.id)).toMatchObject({ status: "paid", stripeTransferId: null });
    const transfer = vi.fn(async () => ({ id: "tr_second" }));
    await executeDuePayouts(now, { isReady: async () => true, availableBalance: async () => 10_000, transfer, findTransfer });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("振込先が使えなくなった農家でも、以前の送金が Stripe にあれば手動振込にしない", async () => {
    const { p } = await setup({ stripeAccountId: "acct_revoked", stripeOnboarded: false });
    findTransfer.mockResolvedValue({ id: "tr_before_revoke" });

    expect((await markPayoutPaidManually(p.id, now, findTransfer)).kind).toBe("already_transferred");
  });

  it("Stripe を使わない農家とデモ環境では確認なしで記録できる", async () => {
    const manual = await setup({ stripeAccountId: null, stripeOnboarded: false });
    expect(await markPayoutPaidManually(manual.p.id, now, findTransfer)).toEqual({ kind: "marked" });
    expect(findTransfer).not.toHaveBeenCalled();

    const demo = await setup({ stripeAccountId: "acct_demo", stripeOnboarded: true });
    expect(await markPayoutPaidManually(demo.p.id, now, null)).toEqual({ kind: "marked" });
  });

  it("Stripe に確かめられないときは記録しない", async () => {
    const { p } = await setup({ stripeAccountId: "acct_down", stripeOnboarded: true }, "timeout");
    findTransfer.mockRejectedValue(new Error("stripe down"));

    await expect(markPayoutPaidManually(p.id, now, findTransfer)).rejects.toThrow("stripe down");
    expect((await payout(p.id)).status).toBe("pending");
  });

  it("振込済みの精算は二度記録しない", async () => {
    const { p } = await setup({ stripeAccountId: null, stripeOnboarded: false });
    await markPayoutPaidManually(p.id, now, null);
    expect(await markPayoutPaidManually(p.id, now, null)).toEqual({ kind: "not_found" });
  });
});

describe("自動送金の再試行", () => {
  it("Stripe に送金がすでにあれば送り直さず、その送金を記録する（冪等キーは24時間で切れる）", async () => {
    const { p } = await setup({ stripeAccountId: "acct_retry", stripeOnboarded: true }, "connection terminated");
    findTransfer.mockResolvedValue({ id: "tr_yesterday" });
    const transfer = vi.fn(async () => ({ id: "tr_second" }));

    const r = await executeDuePayouts(now, { isReady: async () => true, availableBalance: async () => 10_000, transfer, findTransfer });

    expect(transfer).not.toHaveBeenCalled();
    expect(r.transferred).toBe(1);
    expect(await payout(p.id)).toMatchObject({ status: "paid", stripeTransferId: "tr_yesterday", transferError: null });
  });
});
