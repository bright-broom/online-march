import type { NextConfig } from "next";

const embeddedDb = !process.env.DATABASE_URL;

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
const securityHeaders = [
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
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
