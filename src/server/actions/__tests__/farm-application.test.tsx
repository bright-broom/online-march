import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 出店審査（#15）。見送られた申請は内容を直して出し直せること、審査中の人に何を準備すればよいか見えること、
 * 見送り・停止がお知らせだけでなくメールでも届くこと。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn(), useRouter: () => ({}), usePathname: () => "/join" }));
const sendEmail = vi.fn(async (_m: { to: string; subject: string }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { submitFarmApplication } = await import("../join");
const { setFarmStatus } = await import("../admin-farms");
const { JoinGate } = await import("@/components/shop/join/join-gate");
const { joinContent } = await import("@/config/content");
const { isRejectedApplication } = await import("@/lib/farms");

const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};

const form = (farmName: string) => {
  const fd = new FormData();
  const fields: Record<string, string> = {
    farmName,
    representative: "審査 太郎",
    phone: "0799-00-0000",
    postalCode: "656-0000",
    prefecture: "兵庫県",
    city: "南あわじ市",
    addressLine: "八木1-1",
    tagline: "吊り小屋熟成の玉ねぎ",
    story: "祖父の代から南あわじで玉ねぎを育てています。吊り小屋でじっくり熟成させた甘い玉ねぎをお届けします。",
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.append("cultivationMethods[]", "reduced");
  return fd;
};

const EMAIL = "applicant@awaji-test.jp";
let applicantId = "";
const farmOfApplicant = async () => (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, applicantId) }))!;

beforeEach(async () => {
  sendEmail.mockClear();
  const existing = await db.query.user.findFirst({ where: eq(s.user.email, EMAIL) });
  if (existing) {
    await db.delete(s.farms).where(eq(s.farms.ownerId, existing.id));
    await db.update(s.user).set({ role: "customer" }).where(eq(s.user.id, existing.id));
    applicantId = existing.id;
  } else {
    const [u] = await db.insert(s.user).values({ id: crypto.randomUUID(), name: "審査 太郎", email: EMAIL, emailVerified: true, role: "customer" }).returning();
    applicantId = u.id;
  }
});

async function applyAndReject(reason?: string) {
  await signIn(EMAIL, "customer");
  expect((await submitFarmApplication(null, form("見送り農園"))).ok).toBe(true);
  const farm = await farmOfApplicant();
  await signIn("admin@demo.awaji", "admin");
  expect((await setFarmStatus({ farmId: farm.id, status: "suspended", reason })).ok).toBe(true);
  return farm;
}

describe("出店審査", () => {
  it("見送られた申請は、内容を直して出し直すと審査に戻る", async () => {
    const rejected = await applyAndReject();
    await db.update(s.farms).set({ createdAt: new Date("2026-01-01T00:00:00Z") }).where(eq(s.farms.id, rejected.id));
    await signIn(EMAIL, "customer");

    const res = await submitFarmApplication(null, form("出し直し農園"));

    expect(res.ok, JSON.stringify(res)).toBe(true);
    const farm = await farmOfApplicant();
    expect(farm).toMatchObject({ id: rejected.id, status: "pending", name: "出し直し農園", approvedAt: null });
    expect(farm.createdAt.getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00Z").getTime()); // 申請日は出し直した日
    const admin = (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!;
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, admin.id));
    expect(notes.some((n) => n.title === "出店申請が再提出されました")).toBe(true);
  });

  it("審査中・承認後に停止した農園からは申請し直せない", async () => {
    await signIn(EMAIL, "customer");
    await submitFarmApplication(null, form("審査中農園"));
    expect((await submitFarmApplication(null, form("二重申請"))).ok).toBe(false);

    // approved once, then suspended: not a rejected application
    await db.update(s.farms).set({ status: "suspended", approvedAt: new Date() }).where(eq(s.farms.ownerId, applicantId));
    expect((await submitFarmApplication(null, form("停止後の申請"))).ok).toBe(false);
    expect((await farmOfApplicant()).name).toBe("審査中農園");
    expect(isRejectedApplication(await farmOfApplicant())).toBe(false);
    expect(isRejectedApplication({ status: "suspended", approvedAt: null })).toBe(true);
    expect(isRejectedApplication({ status: "pending", approvedAt: null })).toBe(false);
  });

  it("見送りはメールでも届き、運営のメッセージと出し直しの案内が入る", async () => {
    await applyAndReject("写真を追加してもう一度お申し込みください");

    const mail = sendEmail.mock.calls.map(([m]) => m).find((m) => m.to === EMAIL);
    expect(mail?.subject).toContain("出店申請");
    expect(JSON.stringify(mail)).toContain("写真を追加してもう一度お申し込みください");
    expect(JSON.stringify(mail)).toContain("/join#apply");
  });

  it("承認後の停止はメールでも届く", async () => {
    const farm = await applyAndReject();
    await setFarmStatus({ farmId: farm.id, status: "active" }); // approve
    const owner = (await db.query.user.findFirst({ where: eq(s.user.id, applicantId) }))!;
    sendEmail.mockClear();

    expect((await setFarmStatus({ farmId: farm.id, status: "suspended", reason: "確認のため" })).ok).toBe(true);

    const mail = sendEmail.mock.calls.map(([m]) => m).find((m) => m.to === owner.email);
    expect(mail?.subject).toContain("一時停止");
    expect(JSON.stringify(mail)).toContain("確認のため");
  });

  it("出店申請ページ: 審査中は準備しておくことを、見送りは前回の内容入りのフォームを出す", async () => {
    await signIn(EMAIL, "customer");
    await submitFarmApplication(null, form("表示確認農園"));
    const pendingHtml = renderToStaticMarkup(await JoinGate());
    expect(pendingHtml).toContain(joinContent.pending.prepareTitle);
    expect(pendingHtml).not.toContain("<form");

    await signIn("admin@demo.awaji", "admin");
    await setFarmStatus({ farmId: (await farmOfApplicant()).id, status: "suspended" });
    await signIn(EMAIL, "customer");
    const rejectedHtml = renderToStaticMarkup(await JoinGate());
    expect(rejectedHtml).toContain(joinContent.rejected.title);
    expect(rejectedHtml).toContain("<form");
    expect(rejectedHtml).toContain('value="表示確認農園"');
  });
});
