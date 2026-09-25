import { describe, expect, it, vi } from "vitest";

/**
 * 精算の送金が Stripe にすでにあるか（#13）。二重払いを防ぐ最後の確認なので、Stripe の一覧から
 * この精算の送金だけを拾い、全額取り消された送金（お金が戻っている）は数えないことを確かめる。
 */
const list = vi.fn((_params: Record<string, unknown>) =>
  (async function* () {
    yield { id: "tr_other", amount: 3000, amount_reversed: 0, metadata: { payoutId: "po_other" } };
    yield { id: "tr_reversed", amount: 3000, amount_reversed: 3000, metadata: { payoutId: "po_reversed" } };
    yield { id: "tr_partial", amount: 3000, amount_reversed: 1000, metadata: { payoutId: "po_partial" } };
    yield { id: "tr_mine", amount: 3000, amount_reversed: 0, metadata: { payoutId: "po_mine" } };
  })(),
);
vi.mock("stripe", () => ({
  default: class {
    transfers = { list };
  },
}));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");

const { findPayoutTransfer } = await import("../payments/stripe");

describe("精算の送金が Stripe にあるか", () => {
  it("その農家あての送金から、この精算の送金を見つける", async () => {
    expect(await findPayoutTransfer({ accountId: "acct_1", payoutId: "po_mine" })).toEqual({ id: "tr_mine" });
    expect(list).toHaveBeenCalledWith({ destination: "acct_1", limit: 100 });
  });

  it("全額取り消された送金は送金済みとみなさず、一部だけの取り消しは送金済みとみなす", async () => {
    expect(await findPayoutTransfer({ accountId: "acct_1", payoutId: "po_reversed" })).toBeNull();
    expect(await findPayoutTransfer({ accountId: "acct_1", payoutId: "po_partial" })).toEqual({ id: "tr_partial" });
  });

  it("送金がなければ null", async () => {
    expect(await findPayoutTransfer({ accountId: "acct_1", payoutId: "po_none" })).toBeNull();
  });
});
