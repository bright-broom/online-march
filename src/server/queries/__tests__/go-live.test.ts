import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

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
  beforeEach(() => vi.unstubAllEnvs());

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
});
