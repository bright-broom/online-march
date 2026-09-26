import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * メールアドレスの確認と変更（#16）。打ち間違えたアドレスで登録しても、自分で気づいて直せること。
 * 変更は新しいアドレスに届いたリンクを開くまで起きない（打ち間違えた先に切り替わらない）。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }), headers: async () => new Headers() }));
const sendEmail = vi.fn(async (_msg: { to: string; subject: string; blocks: { type: string; href?: string }[] }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { auth } = await import("../auth");
const { demoPassword } = await import("@/config/demo");

const ip = () => `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const headers = (cookie?: string) => new Headers({ "x-forwarded-for": ip(), ...(cookie ? { cookie } : {}) });
const password = "email-change-123";

/** メールのボタンのリンクから Better Auth のトークンを取り出す（/api/auth/verify-email?token=…） */
function tokenFrom(msg: { blocks: { type: string; href?: string }[] }) {
  const href = msg.blocks.find((b) => b.type === "button")!.href!;
  const token = new URL(href, "http://localhost").searchParams.get("token");
  if (!token) throw new Error(`no token in ${href}`);
  return token;
}
const lastMailTo = (to: string) => sendEmail.mock.calls.map(([m]) => m).filter((m) => m.to === to).at(-1);
const userBy = (email: string) => db.query.user.findFirst({ where: eq(s.user.email, email) });

async function signUpAndIn(email: string) {
  await auth.api.signUpEmail({ body: { email, password, name: "変更 テスト" }, headers: headers() });
  const res = await auth.api.signInEmail({ body: { email, password }, headers: headers(), asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

beforeEach(() => sendEmail.mockClear());

describe("メールアドレスの確認", () => {
  it("登録すると確認メールが届き、リンクを開くと確認済みになる（確認前でもログインできる）", async () => {
    const email = `verify-${Date.now()}@awaji-test.jp`;
    const cookie = await signUpAndIn(email);
    expect(cookie).toContain("session_token"); // not locked out while unverified

    const mail = lastMailTo(email)!;
    expect(mail.subject).toBe("【メールアドレスのご確認】");
    expect((await userBy(email))!.emailVerified).toBe(false);

    await auth.api.verifyEmail({ query: { token: tokenFrom(mail) }, headers: headers() });
    expect((await userBy(email))!.emailVerified).toBe(true);
  });
});

describe("メールアドレスの変更", () => {
  it("新しいアドレスに確認メールが届き、リンクを開くまでは変わらない", async () => {
    const typo = `tpyo-${Date.now()}@awaji-test.jp`;
    const fixed = `fixed-${Date.now()}@awaji-test.jp`;
    const cookie = await signUpAndIn(typo);
    const id = (await userBy(typo))!.id;
    sendEmail.mockClear();

    await auth.api.changeEmail({ body: { newEmail: fixed, callbackURL: "/mypage/settings?email=done" }, headers: headers(cookie) });

    const mail = lastMailTo(fixed)!;
    expect(mail.subject).toBe("【メールアドレス変更のご確認】");
    expect(sendEmail.mock.calls.some(([m]) => m.to === typo)).toBe(false);
    expect((await db.query.user.findFirst({ where: eq(s.user.id, id) }))!.email).toBe(typo); // not yet

    await auth.api.verifyEmail({ query: { token: tokenFrom(mail) }, headers: headers(cookie) });
    const after = (await db.query.user.findFirst({ where: eq(s.user.id, id) }))!;
    expect(after).toMatchObject({ email: fixed, emailVerified: true });
    expect((await auth.api.signInEmail({ body: { email: fixed, password }, headers: headers(), asResponse: true })).status).toBe(200);
  });

  it("ほかの会員のアドレスには変えられず、そのことも外に漏らさない", async () => {
    const mine = `mine-${Date.now()}@awaji-test.jp`;
    const cookie = await signUpAndIn(mine);
    sendEmail.mockClear();

    const r = await auth.api.changeEmail({ body: { newEmail: "sato@example.jp" }, headers: headers(cookie) });

    expect(r).toMatchObject({ status: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await userBy(mine))!.email).toBe(mine);
  });

  it("共有のデモアカウントのアドレスは変えられない（乗っ取り防止）", async () => {
    const res = await auth.api.signInEmail({ body: { email: "customer@demo.awaji", password: demoPassword }, headers: headers(), asResponse: true });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    await expect(auth.api.changeEmail({ body: { newEmail: `attacker-${Date.now()}@awaji-test.jp` }, headers: headers(cookie) })).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await userBy("customer@demo.awaji")).toBeDefined();
  });
});
