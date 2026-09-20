import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }), headers: async () => new Headers() }));

const { auth } = await import("../auth");
const { db } = await import("@/db/client");
const s = await import("@/db/schema");

/** Counters are per IP, so each test uses its own address. */
const attempt = (ip: string, email = "customer@demo.awaji", password = "wrong-password-123") =>
  auth.handler(
    new Request("https://awaji-marche.vercel.app/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }),
  );

describe("sign-in rate limiting", () => {
  it("locks out an IP after repeated failed sign-ins and stores the counter in Postgres", async () => {
    const ip = "203.0.113.10";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt(ip)).status);

    expect(statuses.slice(0, 10).every((s) => s === 401), statuses.join(",")).toBe(true); // wrong password
    expect(statuses.at(-1)).toBe(429); // limiter kicked in within the 10-per-5-minutes rule
    const rows = await db.select().from(s.rateLimit);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.key.includes(ip))).toBe(true);
  });

  it("does not affect a different IP", async () => {
    const res = await attempt("203.0.113.99");
    expect(res.status).toBe(401);
  });
});
