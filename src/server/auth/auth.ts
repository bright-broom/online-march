import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env, siteUrl } from "@/lib/env";

const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((h) => `https://${h}`);

const isDev = env.NODE_ENV !== "production";
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const auth = betterAuth({
  appName: siteConfig.name,
  // In dev, infer the base URL from the request so any port (3000, 3100, …) works.
  baseURL: env.BETTER_AUTH_URL ?? (isDev ? undefined : siteUrl),
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    const devOrigin = isDev && origin && LOCAL_ORIGIN.test(origin) ? [origin] : [];
    return [siteUrl, ...vercelOrigins, ...devOrigin];
  },
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer", input: false },
      phone: { type: "string", required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
