import type { NextConfig } from "next";

const embeddedDb = !process.env.DATABASE_URL;
/** Trace-exclude glob for PGlite's wasm/data (picomatch, matched against traced paths). */
const PGLITE_BINARIES = "**/node_modules/@electric-sql/pglite/dist/*.{wasm,data}";

/**
 * Content Security Policy.
 *
 * No nonce: a per-request nonce would force every page out of the prerendered shell (cacheComponents),
 * trading the site's main performance win for a directive that Next's inline flight scripts need anyway.
 * `script-src 'self' 'unsafe-inline'` therefore still allows inline script, but blocks *loading* script from
 * anywhere else, and the surrounding directives remove the usual next steps of an injection: no object/embed,
 * no <base> rewrite, forms and fetches cannot leave this origin, and the page cannot be framed.
 */
const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'", // React sets style attributes (charts, layout)
  "img-src 'self' data: blob: https://images.unsplash.com https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.public.blob.vercel-storage.com",
  "frame-src 'none'", // Stripe Checkout is a redirect, not an iframe
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");
// Dev is exempt: React's development build uses eval() for debugging, and the analytics scripts load from
// va.vercel-scripts.com instead of the same-origin production path.
// HSTS: browsers remember to use HTTPS only (2 years). Production only: dev runs on plain http://localhost.
// No `preload` yet: submitting to the preload list is a commitment for the custom domain, decide it with the domain.
const hsts = "max-age=63072000; includeSubDomains";
const securityHeaders = [
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }, { key: "Strict-Transport-Security", value: hsts }] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" }, // matches frame-ancestors for older browsers
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /** Partial prerendering + "use cache" (docs/PERFORMANCE.md) */
  cacheComponents: true,
  cacheLife: {
    /** catalog pages: fresh within minutes, served stale up to a day */
    catalog: { stale: 60, revalidate: 300, expire: 86_400 },
    /** dashboards: short-lived aggregates */
    dashboard: { stale: 30, revalidate: 60, expire: 3_600 },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    localPatterns: [{ pathname: "/uploads/**" }, { pathname: "/**" }],
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  /**
   * PGlite (the local / CI database) points at its binaries with `new URL("./pglite.wasm", import.meta.url)`, so file
   * tracing copied ~17MB of wasm/data into every server function — which production (Neon) never loads, but pays for
   * on every cold start. Only the binaries go: the JS stays, because `db/client.ts` imports PGlite statically. If a
   * deployment ever lost DATABASE_URL at runtime it now fails loudly instead of serving an empty in-memory store.
   */
  ...(embeddedDb ? {} : { outputFileTracingExcludes: { "*": [PGLITE_BINARIES] } }),
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    /** Embedded PGlite is single-process: prerender with one worker when no DATABASE_URL. */
    ...(embeddedDb ? { cpus: 1, staticGenerationMaxConcurrency: 4 } : {}),
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
