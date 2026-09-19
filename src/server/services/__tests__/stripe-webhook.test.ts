import Stripe from "stripe";
import { beforeAll, describe, expect, it, vi } from "vitest";

const PLATFORM = "whsec_platform_test";
const CONNECT = "whsec_connect_test";
const ACCOUNTS = "whsec_accounts_test";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: {} } });
const sign = (secret: string, body = payload) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
const thinPayload = JSON.stringify({
  id: "evt_v2_1",
  object: "v2.core.event",
  type: "v2.core.account[configuration.recipient].capability_status_updated",
  created: "2026-09-19T00:00:00.000Z",
  livemode: false,
  related_object: { id: "acct_1", type: "v2.core.account", url: "/v2/core/accounts/acct_1" },
});

describe("constructWebhookEvent", () => {
  let mod: typeof import("../payments/stripe");
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", PLATFORM);
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT);
    vi.stubEnv("STRIPE_ACCOUNTS_WEBHOOK_SECRET", ACCOUNTS);
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

  it("parses Accounts v2 thin events signed by the accounts destination only", () => {
    const n = mod.parseAccountEventNotification(thinPayload, sign(ACCOUNTS, thinPayload));
    expect(n.type).toBe("v2.core.account[configuration.recipient].capability_status_updated");
    expect(n.accountId).toBe("acct_1");
    expect(() => mod.parseAccountEventNotification(thinPayload, sign(PLATFORM, thinPayload))).toThrow();
  });

  it("treats only an active recipient stripe_transfers capability as payout-ready", () => {
    const account = (status: string) =>
      ({ configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status, status_details: [] } } } } } }) as unknown as Stripe.V2.Core.Account;
    expect(mod.isPayoutReady(account("active"))).toBe(true);
    expect(mod.isPayoutReady(account("pending"))).toBe(false);
    expect(mod.isPayoutReady({} as Stripe.V2.Core.Account)).toBe(false);
  });
});
