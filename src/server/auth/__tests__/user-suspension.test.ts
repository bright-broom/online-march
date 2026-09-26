import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 運営によるユーザーの利用停止・匿名化（#21）。
 * 停止: ログインできない（どの入口でも）・ログイン中の端末も切れる・注文はそのまま・再開できる。
 * 匿名化: 退会と同じ処理を運営が行う（進行中の注文があるとできない）。自分自身・運営ユーザーは対象外。
 */
let cookie = "";
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), getAll: () => [] }),
  headers: async () => new Headers(cookie ? { cookie } : {}),
}));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { auth } = await import("../auth");
const { getSessionUser } = await import("../session");
const { setUserSuspended, anonymizeUser } = await import("@/server/actions/admin-users");
const { createOrder, markOrderPaid } = await import("@/server/services/orders");
const { userModerationCopy } = await import("@/config/content");

const password = "suspension-password-1";
const ip = () => ({ "x-forwarded-for": `10.2.0.${Math.floor(Math.random() * 250)}` });
const address = { recipientName: "停止 テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const E = userModerationCopy.errors;

const signIn = (email: string) => auth.api.signInEmail({ body: { email, password }, headers: new Headers(ip()), asResponse: true });
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
async function signUp(tag: string, role: "customer" | "farmer" | "admin" = "customer") {
  const email = `${tag}-${Date.now()}@awaji-test.jp`;
  await auth.api.signUpEmail({ body: { email, password, name: `利用停止 ${tag}` }, headers: new Headers(ip()) });
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  if (role !== "customer") await db.update(s.user).set({ role }).where(eq(s.user.id, u.id));
  return { ...u, role };
}
/**
 * 運営としてログインした状態にする。二段階認証を有効にした後はパスワードだけではセッションが出ないので、
 * 最初に1回だけログインし、その cookie を使い回す（二段階認証は済んだことにする）
 */
const adminCookies = new Map<string, string>();
async function actAs(u: { id: string; email: string }) {
  if (!adminCookies.has(u.id)) {
    adminCookies.set(u.id, cookieOf(await signIn(u.email)));
    await db.update(s.user).set({ twoFactorEnabled: true }).where(eq(s.user.id, u.id));
  }
  cookie = adminCookies.get(u.id)!;
}
async function paidOrderOf(userId: string, email: string) {
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, product.variants[0].id));
  const now = new Date();
  const { order } = await createOrder({ userId, email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  return order.id;
}

let admin: Awaited<ReturnType<typeof signUp>>;

beforeAll(async () => {
  admin = await signUp("admin", "admin");
});

describe("利用停止", () => {
  it("ログインできなくなり、ログイン中の端末も切れる。進行中の注文はそのまま", async () => {
    const target = await signUp("target");
    const theirCookie = cookieOf(await signIn(target.email));
    const orderId = await paidOrderOf(target.id, target.email);

    await actAs(admin);
    expect(await setUserSuspended({ userId: target.id, suspended: true, reason: "迷惑行為の確認中" })).toMatchObject({ ok: true });

    const res = await signIn(target.email);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(userModerationCopy.suspendedLogin);
    expect(await db.select().from(s.session).where(eq(s.session.userId, target.id))).toHaveLength(0);
    cookie = theirCookie;
    expect(await getSessionUser()).toBeNull();

    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, orderId) }))!.status).toBe("paid");
    const log = await db.query.adminAuditLogs.findFirst({ where: and(eq(s.adminAuditLogs.action, "user.suspend"), eq(s.adminAuditLogs.targetId, target.id)) });
    expect(log?.detail).toMatchObject({ suspended: true, reason: "迷惑行為の確認中" });
  });

  it("セッションが残っていても、停止中はログインしていない扱い", async () => {
    const target = await signUp("leftover");
    await db.update(s.user).set({ suspendedAt: new Date() }).where(eq(s.user.id, target.id));
    await db.insert(s.session).values({ id: `ses_left_${target.id}`, token: `tok_left_${target.id}`, userId: target.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const signed = await auth.api.getSession({ headers: new Headers() }); // 何も付けなければ null（前提の確認）
    expect(signed).toBeNull();

    // Better Auth の署名付き cookie を作るため、停止を外してログイン → 停止に戻す（セッションは消さない）
    await db.update(s.user).set({ suspendedAt: null }).where(eq(s.user.id, target.id));
    cookie = cookieOf(await signIn(target.email));
    expect((await getSessionUser())?.id).toBe(target.id);
    await db.update(s.user).set({ suspendedAt: new Date() }).where(eq(s.user.id, target.id));
    expect(await getSessionUser()).toBeNull();
  });

  it("再開すればまたログインできる", async () => {
    const target = await signUp("resume");
    await actAs(admin);
    await setUserSuspended({ userId: target.id, suspended: true });
    expect((await signIn(target.email)).status).toBe(403);

    await actAs(admin);
    expect(await setUserSuspended({ userId: target.id, suspended: false })).toMatchObject({ ok: true });
    expect((await signIn(target.email)).status).toBe(200);
  });

  it("自分自身・運営ユーザーは停止できない。運営以外は操作できない", async () => {
    const otherAdmin = await signUp("admin2", "admin");
    const target = await signUp("guarded");
    await actAs(admin);
    expect(await setUserSuspended({ userId: admin.id, suspended: true })).toMatchObject({ ok: false, error: E.self });
    expect(await setUserSuspended({ userId: otherAdmin.id, suspended: true })).toMatchObject({ ok: false, error: E.admin });

    const customer = await signUp("attacker");
    cookie = cookieOf(await signIn(customer.email));
    expect((await setUserSuspended({ userId: target.id, suspended: true })).ok).toBe(false);
    expect((await db.query.user.findFirst({ where: eq(s.user.id, target.id) }))!.suspendedAt).toBeNull();
  });
});

describe("匿名化", () => {
  it("進行中の注文が無ければ、個人情報を消す（操作記録にも元のアドレスを残さない）", async () => {
    const target = await signUp("anon");
    await actAs(admin);
    expect(await anonymizeUser({ userId: target.id })).toMatchObject({ ok: true });

    const after = (await db.query.user.findFirst({ where: eq(s.user.id, target.id) }))!;
    expect(after.deletedAt).not.toBeNull();
    expect(after.email).not.toBe(target.email);
    expect((await signIn(target.email)).status).not.toBe(200);
    const log = await db.query.adminAuditLogs.findFirst({ where: and(eq(s.adminAuditLogs.action, "user.anonymize"), eq(s.adminAuditLogs.targetId, target.id)) });
    expect(JSON.stringify(log)).not.toContain(target.email);

    expect(await anonymizeUser({ userId: target.id })).toMatchObject({ ok: false, error: E.alreadyClosed });
  });

  it("進行中の注文があるとできない", async () => {
    const target = await signUp("live");
    await paidOrderOf(target.id, target.email);
    await actAs(admin);
    expect(await anonymizeUser({ userId: target.id })).toMatchObject({ ok: false, error: E.liveOrders });
    expect((await db.query.user.findFirst({ where: eq(s.user.id, target.id) }))!.deletedAt).toBeNull();
  });

  it("生産者・運営・自分自身はできない", async () => {
    const farmer = await signUp("farmer", "farmer");
    await actAs(admin);
    expect(await anonymizeUser({ userId: farmer.id })).toMatchObject({ ok: false, error: E.notCustomer });
    expect(await anonymizeUser({ userId: admin.id })).toMatchObject({ ok: false, error: E.self });
  });
});
