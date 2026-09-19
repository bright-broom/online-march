import Stripe from "stripe";
import { beforeAll, describe, expect, it, vi } from "vitest";

const PLATFORM = "whsec_platform_test";
const CONNECT = "whsec_connect_test";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: {} } });
const sign = (secret: string) => Stripe.webhooks.generateTestHeaderString({ payload, secret });

describe("constructWebhookEvent", () => {
  let mod: typeof import("../payments/stripe");
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", PLATFORM);
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT);
    vi.resetModules();
    mod = await import("../payments/stripe");
  });

  it("accepts events signed by either destination secret", () => {
    expect(mod.constructWebhookEvent(payload, sign(PLATFORM)).id).toBe("evt_1");
    expect(mod.constructWebhookEvent(payload, sign(CONNECT)).id).toBe("evt_1");
  });

  it("rejects an unknown signature", () => {
    expect(() => mod.constructWebhookEvent(payload, sign("whsec_other"))).toThrow();
  });

  it("treats only an active transfers capability as payout-ready", () => {
    expect(mod.isPayoutReady({ capabilities: { transfers: "active" } } as Stripe.Account)).toBe(true);
    expect(mod.isPayoutReady({ capabilities: { transfers: "pending" }, charges_enabled: true } as Stripe.Account)).toBe(false);
  });
});
