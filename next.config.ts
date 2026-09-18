import type { NextConfig } from "next";

const embeddedDb = !process.env.DATABASE_URL;

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
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
