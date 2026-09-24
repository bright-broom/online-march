import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { isDemoEmail } from "@/config/demo";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import { account, rateLimit, session, twoFactor as twoFactorTable, user, verification } from "@/db/schema";
import { env, features, siteUrl } from "@/lib/env";
import { sendEmail } from "@/server/services/email";
import { emailTemplates } from "@/server/services/email/templates";

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
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification, rateLimit, twoFactor: twoFactorTable } }),
  /**
   * Brute-force protection. The default memory store is useless on Vercel (every function instance keeps its own
   * map), so counters live in Postgres. Limits are per IP+path: generous for normal browsing, tight on the
   * endpoints that guess credentials.
   */
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/forget-password": { window: 3600, max: 5 },
      // Better Auth 1.7 の再設定リクエストはこのパス（旧名 /forget-password のルールだけでは効いていなかった）
      "/request-password-reset": { window: 3600, max: 5 },
      "/reset-password": { window: 3600, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    /**
     * パスワード再設定（/forgot-password → メール → /reset-password）。登録の無いアドレスでも同じ応答を返すので、
     * 会員かどうかは外から分からない。デモアカウントには送らない（共有のアカウントを誰かが乗っ取れないように）。
     */
    sendResetPassword: async ({ user, url }) => {
      if (isDemoEmail(user.email)) return;
      await sendEmail(emailTemplates.passwordReset({ to: user.email, name: user.name, url }));
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    // 乗っ取られて再設定した場合に、乗っ取った側のログインも切れるように
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer", input: false },
      phone: { type: "string", required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Authorization must reflect role changes / revocations immediately, so every request
    // validates the session against the DB (1 indexed lookup; functions are colocated with the DB).
    cookieCache: { enabled: false },
  },
  hooks: {
    /**
     * The seeded demo accounts share a password that ships in the repo, so hiding the buttons on /login is not
     * enough: once demo mode is off (go-live), they must not be able to sign in at all, even if the rows are
     * still in the database.
     */
    before: createAuthMiddleware(async (ctx) => {
      if (features.demo) return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (email && isDemoEmail(email)) {
        throw new APIError("UNAUTHORIZED", { message: "このアカウントは無効です" });
      }
    }),
  },
  plugins: [
    // 二段階認証（認証アプリの6桁コード + バックアップコード）。運営は必須（guards.ts#needsTwoFactorSetup）。
    // 秘密鍵とバックアップコードは BETTER_AUTH_SECRET で暗号化して two_factor に保存される
    twoFactor({ issuer: siteConfig.name }),
    nextCookies(), // must stay last: it forwards Set-Cookie from the plugins above
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
