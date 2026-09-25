import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * 最終確認画面の表示義務（特定商取引法 第12条の6, #1）: 申込みを確定する画面に「解除に関する事項」を出す。
 * 当サイトの確定ボタンの前と、実際に支払いが確定する Stripe の決済画面の両方で確かめる。
 */
const create = vi.fn(async (_params: Record<string, unknown>) => ({ id: "cs_test", url: "https://checkout.stripe.test" }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
    coupons = { create: vi.fn(async () => ({ id: "co_test" })) };
  },
}));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");

const { cancellationPolicy } = await import("@/config/content");

describe("注文の最終確認画面", () => {
  it("確定ボタンの前に、キャンセル・返品の事項と特商法表記へのリンクがある", async () => {
    const { OrderSummary } = await import("../order-summary");
    for (const paymentMode of ["stripe", "demo"] as const) {
      const html = renderToStaticMarkup(
        createElement(OrderSummary, {
          quote: null, fallbackSubtotal: 2980, itemCount: 1, loading: false, placing: false, canPlace: true,
          paymentMode, onPlace: () => {}, coupon: null,
        }),
      );
      const notice = html.indexOf(cancellationPolicy);
      expect(notice, paymentMode).toBeGreaterThan(-1);
      expect(html).toContain('href="/legal/tokushoho"');
      // 確定（お支払いへ進む）ボタンより前に出ている
      const button = html.indexOf(`${paymentMode === "stripe" ? "お支払いへ進む" : "注文を確定する"}</button>`);
      expect(button, paymentMode).toBeGreaterThan(-1);
      expect(notice, paymentMode).toBeLessThan(button);
    }
  });

  it("Stripe の決済画面でも、支払いボタンの直前に同じ事項を出す", async () => {
    const { createCheckoutSession } = await import("@/server/services/payments/stripe");
    await createCheckoutSession({
      orderId: "00000000-0000-4000-8000-000000000001", orderCode: "AM-TEST", email: "c@x.jp",
      lines: [{ name: "玉ねぎ", quantity: 1, unitAmount: 2980 }], shippingTotal: 0, discountTotal: 0,
    });
    const params = create.mock.calls[0][0] as { custom_text?: { submit?: { message?: string } } };
    const message = params.custom_text?.submit?.message ?? "";
    expect(message).toContain(cancellationPolicy);
    expect(message).toContain("/legal/tokushoho");
    expect(message.length).toBeLessThanOrEqual(1200); // Stripe の上限
  });
});
