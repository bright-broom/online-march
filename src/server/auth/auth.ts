import "server-only";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { userModerationCopy } from "@/config/content";
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
      // メールを送る窓口（#16）: 他人のアドレスへ確認メールを連打させない
      "/change-email": { window: 3600, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
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
  /**
   * メールアドレスの確認（#16）。登録時に確認メールを送るが、確認前でもログイン・購入はできる（打ち間違いに気づいて
   * 直せるようにするのが目的で、締め出すためではない）。未確認はアカウント設定に出て、そこから再送・変更できる。
   * アドレス変更の確認メールもここを通る（新しいアドレスへ送る。リンクを開くまで変更されない）。
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user: u, url }) => {
      if (isDemoEmail(u.email)) return;
      // 変更のときは Better Auth が user.email を新しいアドレスに差し替えて渡してくる
      const current = await db.query.user.findFirst({ where: eq(user.id, u.id), columns: { email: true } });
      const changing = Boolean(current && current.email !== u.email);
      await sendEmail(
        changing
          ? emailTemplates.changeEmail({ to: u.email, name: u.name, url })
          : emailTemplates.verifyEmail({ to: u.email, name: u.name, url }),
      );
    },
  },
  user: {
    // 新しいアドレスに届いたリンクを開いたときに切り替わる（確認前の即時変更 updateEmailWithoutVerification は使わない）
    changeEmail: { enabled: true },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer", input: false },
      phone: { type: "string", required: false },
      // 運営による利用停止（#21）。getSessionUser が見て、停止中ならログインしていない扱いにする
      suspendedAt: { type: "date", required: false, input: false },
    },
  },
  /**
   * 利用停止中（#21）の人にはセッションを作らない。パスワード・二段階認証・メール確認後の自動ログインなど、
   * ログインの入口がどれでもここを通る。停止した時点のセッションは運営の操作（setUserSuspended）で消す。
   */
  databaseHooks: {
    session: {
      create: {
        before: async (s) => {
          const u = await db.query.user.findFirst({ where: eq(user.id, s.userId), columns: { suspendedAt: true } });
          if (u?.suspendedAt) throw new APIError("FORBIDDEN", { message: userModerationCopy.suspendedLogin });
        },
      },
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
      // 共有のデモアカウントのアドレスを誰かが自分のものに変えて乗っ取れないように（#16）
      if (ctx.path === "/change-email") {
        const s = await getSessionFromCtx(ctx);
        if (s && isDemoEmail(s.user.email)) throw new APIError("FORBIDDEN", { message: "デモアカウントのメールアドレスは変更できません" });
      }
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
