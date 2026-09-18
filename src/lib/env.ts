import "server-only";
import { z } from "zod";

/**
 * Server environment. Every external integration is optional:
 * when its key is missing the app runs in "demo mode" for that feature.
 * See docs/DEPLOY.md for the full table.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-in-production-please"),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("あわじ玉ねぎマルシェ <noreply@example.com>"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  DEMO_MODE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const env = schema.parse(process.env);

export const siteUrl =
  env.NEXT_PUBLIC_SITE_URL ??
  env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/** Feature switches derived from env. Adapters in src/server/services read these. */
export const features = {
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  email: Boolean(env.RESEND_API_KEY),
  blob: Boolean(env.BLOB_READ_WRITE_TOKEN),
  /** Shows demo accounts on login & allows one-click demo payment. */
  demo: env.DEMO_MODE || !env.STRIPE_SECRET_KEY,
} as const;
