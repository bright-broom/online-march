import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }), headers: async () => new Headers() }));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { auth } = await import("../auth");
const { needsTwoFactorSetup } = await import("../guards");

const email = `admin-2fa-${Date.now()}@awaji-test.jp`;
const password = "admin-password-2fa";
const ip = () => ({ "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250)}` });

/** Set-Cookie をまとめて次のリクエストの Cookie ヘッダーにする */
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function signIn() {
  const res = await auth.api.signInEmail({ body: { email, password }, headers: new Headers(ip()), asResponse: true });
  return { res, body: (await res.clone().json()) as { twoFactorRedirect?: boolean; token?: string }, cookie: cookieOf(res) };
}

/** 認証アプリが表示するのと同じ6桁コード（DB の暗号化済み秘密鍵から作る） */
async function currentCode(userId: string) {
  const row = (await db.query.twoFactor.findFirst({ where: eq(s.twoFactor.userId, userId) }))!;
  const ctx = await auth.$context;
  return createOTP(await symmetricDecrypt({ key: ctx.secretConfig, data: row.secret }), { digits: 6, period: 30 }).totp();
}

let userId = "";
let backupCodes: string[] = [];

beforeAll(async () => {
  await auth.api.signUpEmail({ body: { email, password, name: "運営 二段階" }, headers: new Headers(ip()) });
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!.id;
  await db.update(s.user).set({ role: "admin" }).where(eq(s.user.id, userId));
});

describe("運営の二段階認証", () => {
  it("設定前の運営はガードで止まる（デモアカウントと購入者は対象外）", () => {
    expect(needsTwoFactorSetup({ role: "admin", twoFactorEnabled: false, email })).toBe(true);
    expect(needsTwoFactorSetup({ role: "admin", twoFactorEnabled: true, email })).toBe(false);
    expect(needsTwoFactorSetup({ role: "admin", twoFactorEnabled: false, email: "admin@demo.awaji" })).toBe(false);
    expect(needsTwoFactorSetup({ role: "customer", twoFactorEnabled: false, email })).toBe(false);
  });

  it("認証アプリのコードで有効化すると、次からはパスワードだけではログインできない", async () => {
    const first = await signIn();
    expect(first.body.twoFactorRedirect).toBeUndefined(); // まだ未設定なので普通にログインできる

    const enabled = await auth.api.enableTwoFactor({ body: { password, method: "totp" }, headers: new Headers({ ...ip(), cookie: first.cookie }) });
    if (enabled.method !== "totp") throw new Error("expected a TOTP setup");
    expect(enabled.totpURI).toMatch(/^otpauth:\/\/totp\//);
    backupCodes = enabled.backupCodes;
    expect(backupCodes.length).toBeGreaterThan(0);
    // コードを1回確認するまでは有効にならない（読み取りに失敗した QR で締め出されないように）
    expect((await db.query.user.findFirst({ where: eq(s.user.id, userId) }))!.twoFactorEnabled).toBe(false);

    await auth.api.verifyTOTP({ body: { code: await currentCode(userId) }, headers: new Headers({ ...ip(), cookie: first.cookie }) });
    expect((await db.query.user.findFirst({ where: eq(s.user.id, userId) }))!.twoFactorEnabled).toBe(true);

    const second = await signIn();
    expect(second.body.twoFactorRedirect).toBe(true);
    expect(second.body.token).toBeUndefined(); // セッションはまだ発行されない
  });

  it("パスワードの後に正しいコードを入れるとログインでき、間違ったコードでは入れない", async () => {
    const pending = await signIn();
    const headers = () => new Headers({ ...ip(), cookie: pending.cookie });
    await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers: headers() })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    const ok = await auth.api.verifyTOTP({ body: { code: await currentCode(userId) }, headers: headers(), asResponse: true });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token="))).toBe(true);
    // ガード（needsTwoFactorSetup）はセッションの twoFactorEnabled を見る。載っていないと設定済みの運営が設定画面から出られない
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(ok) }) });
    expect((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled).toBe(true);
  });

  it("端末をなくしてもバックアップコードで入れる（同じコードは2回使えない）", async () => {
    const pending = await signIn();
    const res = await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: new Headers({ ...ip(), cookie: pending.cookie }), asResponse: true });
    expect(res.status).toBe(200);
    const again = await signIn();
    await expect(
      auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: new Headers({ ...ip(), cookie: again.cookie }) }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });
});
