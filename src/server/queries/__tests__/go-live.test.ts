import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

/** 決済手段のチェックは Stripe に問い合わせる。テストでは答えを固定する */
const fetchEnabledPaymentMethods = vi.fn(async () => [
  { id: "card", enabled: true },
  { id: "apple_pay", enabled: true },
  { id: "google_pay", enabled: true },
  { id: "paypay", enabled: true },
  { id: "konbini", enabled: true },
]);
vi.mock("@/server/services/payments/stripe", () => ({ fetchEnabledPaymentMethods }));

const load = async () => {
  vi.resetModules();
  return (await import("../go-live")).getGoLiveChecks();
};
const stateOf = (checks: Awaited<ReturnType<typeof load>>, key: string) => checks.find((c) => c.key === key)!;

const liveEnv = {
  STRIPE_SECRET_KEY: "sk_live_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_a",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b",
  STRIPE_ACCOUNTS_WEBHOOK_SECRET: "whsec_c",
  DEMO_MODE: "false",
  BETTER_AUTH_SECRET: "a-production-secret-value",
  CRON_SECRET: "cron-secret",
  RESEND_API_KEY: "re_dummy",
  EMAIL_FROM: "マルシェ <noreply@awaji-marche.jp>",
  BLOB_READ_WRITE_TOKEN: "blob_dummy",
};

describe("go-live checks", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    fetchEnabledPaymentMethods.mockClear();
  });

  it("blocks launch while the app runs on demo defaults", async () => {
    const checks = await load();
    expect(stateOf(checks, "stripe-key").state).toBe("blocker");
    expect(stateOf(checks, "demo-mode").state).toBe("blocker");
    expect(stateOf(checks, "auth-secret").state).toBe("blocker");
    expect(stateOf(checks, "cron").state).toBe("blocker");
    expect(stateOf(checks, "legal").state).toBe("blocker"); // src/config/site.ts still has placeholders
  });

  it("clears once live keys and secrets are configured", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    const checks = await load();
    for (const key of ["stripe-key", "stripe-webhooks", "demo-mode", "auth-secret", "cron", "email", "blob"]) {
      expect(stateOf(checks, key).state, key).toBe("ready");
    }
    // the seeded demo rows are still in the database — flagged, but not a blocker once they cannot sign in
    expect(stateOf(checks, "demo-accounts").state).toBe("warning");
    expect(stateOf(checks, "demo-accounts").detail).toContain("demo.awaji");
  });

  it("warns when the Accounts v2 destination or the sender domain is missing", async () => {
    for (const [k, v] of Object.entries({ ...liveEnv, STRIPE_ACCOUNTS_WEBHOOK_SECRET: "", EMAIL_FROM: "マルシェ <noreply@example.com>" })) vi.stubEnv(k, v);
    const checks = await load();
    expect(stateOf(checks, "stripe-webhooks").state).toBe("warning");
    expect(stateOf(checks, "email").state).toBe("warning");
  });

  it("treats a test-mode Stripe key as a blocker", async () => {
    for (const [k, v] of Object.entries({ ...liveEnv, STRIPE_SECRET_KEY: "sk_test_dummy" })) vi.stubEnv(k, v);
    const checks = await load();
    expect(stateOf(checks, "stripe-key").state).toBe("blocker");
    expect(stateOf(checks, "stripe-key").detail).toContain("テストキー");
  });

  it("案内している決済手段が Stripe 側で無効なら警告する", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    fetchEnabledPaymentMethods.mockResolvedValueOnce([
      { id: "card", enabled: true },
      { id: "paypay", enabled: false }, // ダッシュボードで未有効化
      { id: "konbini", enabled: false },
    ]);

    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("warning");
    expect(check.detail).toContain("PayPay");
    expect(check.detail).toContain("コンビニ払い");
  });

  it("すべて有効なら準備完了として扱う", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);

    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("ready");
    expect(check.detail).toContain("PayPay");
  });

  it("Stripe が未設定なら決済手段は確認できないとだけ伝える", async () => {
    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("warning");
    expect(fetchEnabledPaymentMethods).not.toHaveBeenCalled();
  });
});
