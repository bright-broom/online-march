import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 本番のサーバーエラーに運営が気づけること（#12）。ページ・API・Webhook のエラーは instrumentation の onRequestError、
 * Server Action の想定外のエラーは runAction から、運営のお知らせとメールに届く。ただし同じエラーや障害時の大量のエラーで
 * 通知が溢れないようにする。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
const sendEmail = vi.fn(async (_m: { to: string; subject: string }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { onRequestError } = await import("@/instrumentation");
const { serverErrorAlert } = await import("../error-report");
const { ActionError, runAction } = await import("@/server/actions/_utils");

const request = (path: string) => ({ path, method: "POST", headers: {} });
const context = (routeType: "render" | "route" | "action" | "proxy") =>
  ({ routerKind: "App Router", routePath: "/x", routeType, renderSource: "server-rendering", revalidateReason: undefined, renderType: "dynamic" }) as Parameters<typeof onRequestError>[2];

let adminId = "";
let adminEmail = "";
const alerts = async () => (await db.select().from(s.notifications).where(eq(s.notifications.userId, adminId))).filter((n) => n.title === serverErrorAlert.title);

beforeEach(async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  sendEmail.mockClear();
  const admin = (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!;
  adminId = admin.id;
  adminEmail = admin.email;
  await db.delete(s.notifications).where(eq(s.notifications.title, serverErrorAlert.title));
});
afterEach(() => vi.unstubAllEnvs());

describe("サーバーエラーの通知", () => {
  it("Webhook などのエラーは運営のお知らせとメールに届く（場所・内容・エラーID、トークンは残さない）", async () => {
    const err = Object.assign(new Error("connection terminated"), { digest: "123456" });

    await onRequestError(err, request("/api/webhooks/stripe?token=secret-token"), context("route"));

    const [n] = await alerts();
    expect(n.body).toContain("API");
    expect(n.body).toContain("/api/webhooks/stripe");
    expect(n.body).toContain("connection terminated");
    expect(n.body).toContain("123456");
    expect(n.body).not.toContain("secret-token");
    const mail = sendEmail.mock.calls.map(([m]) => m).find((m) => m.to === adminEmail);
    expect(mail?.subject).toBe(`【運営】${serverErrorAlert.title}`);
  });

  it("同じエラーが続いても通知は1回", async () => {
    for (let i = 0; i < 3; i++) await onRequestError(new Error("same thing"), request("/checkout"), context("render"));

    expect(await alerts()).toHaveLength(1);
  });

  it("障害で違うエラーが大量に出ても、1時間の上限までしか知らせない", async () => {
    for (let i = 0; i < serverErrorAlert.maxPerHour + 3; i++) await onRequestError(new Error(`boom ${i}`), request("/"), context("render"));

    expect(await alerts()).toHaveLength(serverErrorAlert.maxPerHour);
  });

  it("Edge ランタイムでは何もしない（DB を使えない）", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await onRequestError(new Error("edge"), request("/"), context("proxy"));

    expect(await alerts()).toHaveLength(0);
  });

  it("Server Action の想定外のエラーは知らせ、利用者向けの想定内のエラーは知らせない", async () => {
    const unexpected = await runAction(async () => {
      throw new Error("relation does not exist");
    });
    const expected = await runAction(async () => {
      throw new ActionError("在庫が足りません");
    });

    expect(unexpected.ok).toBe(false);
    expect(expected).toMatchObject({ ok: false, error: "在庫が足りません" });
    const list = await alerts();
    expect(list).toHaveLength(1);
    expect(list[0].body).toContain("relation does not exist");
  });
});
