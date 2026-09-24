import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }), headers: async () => new Headers() }));
const sendEmail = vi.fn(async (_msg: { to: string; subject: string; blocks: { type: string; href?: string }[] }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { auth } = await import("../auth");

const headers = () => new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` });
const email = `reset-${Date.now()}@awaji-test.jp`;
const oldPassword = "old-password-123";

/** メールのボタンから Better Auth が発行したトークンを取り出す（/api/auth/reset-password/<token>?callbackURL=…） */
function tokenFromLastEmail() {
  const msg = sendEmail.mock.calls.at(-1)![0];
  const href = msg.blocks.find((b) => b.type === "button")!.href!;
  const token = /\/reset-password\/([^/?#]+)/.exec(href)?.[1];
  if (!token) throw new Error(`no reset token in ${href}`);
  return token;
}
const request = (to: string) => auth.api.requestPasswordReset({ body: { email: to, redirectTo: "/reset-password" }, headers: headers() });
const signIn = (password: string) => auth.api.signInEmail({ body: { email, password }, headers: headers(), asResponse: true });

beforeEach(() => sendEmail.mockClear());

describe("パスワード再設定", () => {
  it("メールのリンクで新しいパスワードを設定でき、古いパスワードは使えなくなる", async () => {
    await auth.api.signUpEmail({ body: { email, password: oldPassword, name: "再設定 テスト" }, headers: headers() });
    sendEmail.mockClear();

    await request(email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: email, subject: "【パスワード再設定のご案内】" });

    await auth.api.resetPassword({ body: { token: tokenFromLastEmail(), newPassword: "new-password-456" }, headers: headers() });
    expect((await signIn("new-password-456")).status).toBe(200);
    expect((await signIn(oldPassword)).status).toBe(401);
  });

  it("リンクは1回しか使えない", async () => {
    await request(email);
    const token = tokenFromLastEmail();
    await auth.api.resetPassword({ body: { token, newPassword: "another-pass-789" }, headers: headers() });
    await expect(auth.api.resetPassword({ body: { token, newPassword: "hijack-pass-000" }, headers: headers() })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect((await signIn("another-pass-789")).status).toBe(200);
  });

  it("再設定すると、ほかの端末のログインも切れる", async () => {
    await signIn("another-pass-789");
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
    expect((await db.select().from(s.session).where(eq(s.session.userId, u.id))).length).toBeGreaterThan(0);

    await request(email);
    await auth.api.resetPassword({ body: { token: tokenFromLastEmail(), newPassword: "final-pass-321" }, headers: headers() });
    expect(await db.select().from(s.session).where(eq(s.session.userId, u.id))).toEqual([]);
  });

  it("登録の無いアドレスでも同じ応答を返し、メールは送らない（会員かどうかを外に漏らさない）", async () => {
    const r = await request("nobody-here@awaji-test.jp");
    expect(r).toMatchObject({ status: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("デモアカウントには再設定メールを送らない", async () => {
    const r = await request("customer@demo.awaji");
    expect(r).toMatchObject({ status: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("パスワード再設定の回数制限", () => {
  it("同じ IP からは1時間に5回まで（6回目は 429）", async () => {
    const call = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/request-password-reset", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.99.0.1", origin: "http://localhost:3000" },
          body: JSON.stringify({ email: "nobody-here@awaji-test.jp", redirectTo: "/reset-password" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call()).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

