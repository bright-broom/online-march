import { beforeAll, describe, expect, it, vi } from "vitest";

/** The headers are the only thing standing between an injected string and the visitor's browser. */
let config: typeof import("../../../next.config").default;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production"); // CSP is production-only (dev React needs eval)
  vi.resetModules();
  config = (await import("../../../next.config")).default;
});

const headersFor = async (path: string) => {
  const groups = await config.headers!();
  const match = groups.filter((g) => new RegExp(`^${g.source.replace("(.*)", ".*")}$`).test(path));
  return Object.fromEntries(match.flatMap((g) => g.headers.map((h) => [h.key.toLowerCase(), h.value])));
};

describe("security headers", () => {
  it("sends a CSP that cannot be widened by an injected tag", async () => {
    const csp = (await headersFor("/products"))["content-security-policy"];
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name) ?? "";

    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("script-src")).not.toContain("https://"); // no third-party script origin may creep in
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows exactly the image and upload origins the app uses", async () => {
    const csp = (await headersFor("/"))["content-security-policy"];

    expect(csp).toContain("https://images.unsplash.com");
    expect(csp).toContain("https://*.public.blob.vercel-storage.com");
    expect(csp).toContain("connect-src 'self'");
  });

  it("leaves development without a CSP so React debugging keeps working", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const dev = (await import("../../../next.config")).default;
    const groups = await dev.headers!();
    const keys = groups.flatMap((g) => g.headers.map((h) => h.key));

    expect(keys).not.toContain("Content-Security-Policy");
    expect(keys).toContain("X-Content-Type-Options");
    vi.stubEnv("NODE_ENV", "production");
  });

  it("keeps the other hardening headers in place", async () => {
    const h = await headersFor("/admin");

    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
  });
});
