import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }), headers: async () => new Headers() }));

const { demoPassword } = await import("@/config/demo");
const signIn = async (email: string) => {
  vi.resetModules();
  const { auth } = await import("../auth");
  return auth.api.signInEmail({ body: { email, password: demoPassword }, headers: new Headers(), asResponse: true });
};

describe("demo accounts after go-live", () => {
  it("signs in while demo mode is on", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = await signIn("admin@demo.awaji");
    expect(res.status).toBe(200);
  });

  it("is rejected once demo mode is off, even though the row still exists", async () => {
    // go-live config: a Stripe key is set and DEMO_MODE is false → features.demo === false
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_dummy");
    await expect(signIn("admin@demo.awaji")).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    vi.unstubAllEnvs();
  });
});
