import { and, eq, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 農園のスタッフ（#24）。オーナーの決定（Issue #24 のコメント）:
 * - オーナーがメールで招待・5人まで・1人1農園・ロールは変えない（購入者のまま）
 * - 権限は「出荷担当」（注文・発送・メッセージ）と「すべて」（それに加えて商品・レビュー・ショップ設定・キャンセル）
 * - 振込先口座と精算（売上）・スタッフの管理はオーナーだけ
 * - お客さまには農園名で届き、誰が送ったかは生産者側にだけ出る
 */
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
const sendEmail = vi.fn(async (_m: { to: string; subject: string }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

type Role = "customer" | "farmer" | "admin";
type U = { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled: boolean };
let currentUser: U | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const staff = await import("../farm-staff");
const { startPreparing, cancelOrder, fetchPayoutOrders } = await import("../farmer-orders");
const { setProductStatus } = await import("../farmer-products");
const { saveFarmBankAccount, setFarmPause } = await import("../farmer-shop");
const { sendMessage } = await import("../messages");
const { submitFarmApplication } = await import("../join");
const { requireFarm } = await import("@/server/auth/guards");
const { GET: salesCsv } = await import("@/app/api/farmer/sales/route");
const { GET: labelsCsv } = await import("@/app/api/farmer/labels/route");
const { createOrder, markOrderPaid } = await import("@/server/services/orders");
const { closeCustomerAccount } = await import("@/server/services/account-closure");
const { farmStaffCopy, farmStaffPolicy } = await import("@/config/farm-staff");
const { joinContent } = await import("@/config/content");
const { listThreads } = await import("@/server/queries/messages");

const E = farmStaffCopy.errors;
const address = { recipientName: "スタッフ テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
let seq = 0;

const as = (u: { id: string; name: string; email: string; role: Role }) => {
  currentUser = { ...u, image: null, twoFactorEnabled: true };
};
async function owner() {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, "farmer@demo.awaji") }))!;
  const farm = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, u.id) }))!;
  return { user: { ...u, role: "farmer" as const }, farm };
}
async function newCustomer(tag: string) {
  const id = `staff_${tag}_${++seq}`;
  const email = `${tag}${seq}@awaji-test.jp`;
  await db.insert(s.user).values({ id, name: `スタッフ ${tag}${seq}`, email, role: "customer" });
  return { id, name: `スタッフ ${tag}${seq}`, email, role: "customer" as const };
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const tokenOf = (url: string) => url.split("/").at(-1)!;

/** オーナーが招待し、本人が参加するまで */
async function hire(access: "all" | "shipping", tag: string = access) {
  const o = await owner();
  const person = await newCustomer(tag);
  as(o.user);
  const res = await staff.inviteStaff(null, form({ email: person.email, access }));
  if (!res.ok) throw new Error(res.error);
  as(person);
  const joined = await staff.acceptStaffInvite({ token: tokenOf(res.data.url) });
  if (!joined.ok) throw new Error(joined.error);
  return { ...o, staff: person };
}
async function paidFarmOrder(farmId: string) {
  const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  const product = (await db.query.products.findFirst({ where: and(eq(s.products.farmId, farmId), eq(s.products.status, "active")), with: { variants: true } }))!;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, product.variants[0].id));
  const now = new Date();
  const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  const [fo] = await db.select().from(s.farmOrders).where(and(eq(s.farmOrders.orderId, order.id), eq(s.farmOrders.farmId, farmId)));
  return { fo, buyer };
}

beforeEach(async () => {
  sendEmail.mockClear();
  redirect.mockClear();
  await db.delete(s.farmMembers);
  await db.delete(s.rateLimit);
});

describe("招待と参加", () => {
  it("招待メールが届き、招待されたアドレスのアカウントで参加できる。DB にはトークンそのものを持たない", async () => {
    const o = await owner();
    const person = await newCustomer("join");
    as(o.user);
    const res = await staff.inviteStaff(null, form({ email: person.email.toUpperCase(), access: "shipping" }));
    expect(res.ok).toBe(true);
    const url = res.ok ? res.data.url : "";
    expect(sendEmail.mock.calls.map(([m]) => m.to)).toEqual([person.email]);
    const row = (await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.farmId, o.farm.id) }))!;
    expect(JSON.stringify(row)).not.toContain(tokenOf(url));

    as(person);
    expect(await staff.acceptStaffInvite({ token: tokenOf(url) })).toMatchObject({ ok: true });
    const ctx = await requireFarm("ship");
    expect(ctx).toMatchObject({ farm: { id: o.farm.id }, access: "shipping" });
    // 同じリンクはもう使えない
    expect(await staff.acceptStaffInvite({ token: tokenOf(url) })).toMatchObject({ ok: false, error: E.invalidInvite });
    // 参加したらトークンは消す（判定は acceptedAt でもしているので、こちらは直接確かめる）
    expect((await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.id, row.id) }))!.tokenHash).toBeNull();
  });

  it("招待されただけ（まだ参加していない）では生産者画面に入れない", async () => {
    const o = await owner();
    const person = await newCustomer("pending");
    as(o.user);
    await staff.inviteStaff(null, form({ email: person.email, access: "all" }));
    await db.update(s.farmMembers).set({ userId: person.id }).where(eq(s.farmMembers.email, person.email)); // acceptedAt は空のまま
    as(person);
    await expect(requireFarm("member")).rejects.toThrow("REDIRECT:/mypage");
  });

  it("別のアカウント・生産者のアカウント・期限切れ・よその農園に所属中は参加できない", async () => {
    const o = await owner();
    const invitee = await newCustomer("target");
    as(o.user);
    const res = await staff.inviteStaff(null, form({ email: invitee.email, access: "all" }));
    const token = tokenOf(res.ok ? res.data.url : "");

    as(await newCustomer("stranger"));
    expect(await staff.acceptStaffInvite({ token })).toMatchObject({ ok: false, error: E.wrongAccount });

    await db.update(s.user).set({ role: "farmer" }).where(eq(s.user.id, invitee.id));
    as({ ...invitee, role: "farmer" });
    expect(await staff.acceptStaffInvite({ token })).toMatchObject({ ok: false, error: E.notCustomerAccount });
    await db.update(s.user).set({ role: "customer" }).where(eq(s.user.id, invitee.id));

    await db.update(s.farmMembers).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.farmMembers.email, invitee.email));
    as(invitee);
    expect(await staff.acceptStaffInvite({ token })).toMatchObject({ ok: false, error: E.expired });
  });

  it("1人1農園: よその農園のスタッフは参加できない", async () => {
    const { staff: person } = await hire("shipping", "twofarms");
    const other = (await db.query.farms.findFirst({ where: (f, { ne }) => ne(f.slug, "awa-farm"), with: { owner: true } }))!;
    as({ ...other.owner, role: "farmer" });
    const res = await staff.inviteStaff(null, form({ email: person.email, access: "all" }));
    as(person);
    expect(await staff.acceptStaffInvite({ token: tokenOf(res.ok ? res.data.url : "") })).toMatchObject({ ok: false, error: E.alreadyMember });
  });

  it(`${farmStaffPolicy.maxMembers}人まで（招待中を含む）。同じアドレス・自分自身は招待できない`, async () => {
    const o = await owner();
    as(o.user);
    for (let i = 0; i < farmStaffPolicy.maxMembers; i++) {
      expect((await staff.inviteStaff(null, form({ email: `limit${i}@awaji-test.jp`, access: "shipping" }))).ok).toBe(true);
    }
    expect(await staff.inviteStaff(null, form({ email: "over@awaji-test.jp", access: "shipping" }))).toMatchObject({ ok: false, error: E.limit });
    await db.delete(s.farmMembers).where(eq(s.farmMembers.email, "limit0@awaji-test.jp"));
    expect(await staff.inviteStaff(null, form({ email: "limit1@awaji-test.jp", access: "all" }))).toMatchObject({ ok: false, error: E.duplicate });
    expect(await staff.inviteStaff(null, form({ email: o.user.email, access: "all" }))).toMatchObject({ ok: false, error: E.self });
  });

  it("再送すると前のリンクは使えなくなる", async () => {
    const o = await owner();
    const person = await newCustomer("resend");
    as(o.user);
    const first = await staff.inviteStaff(null, form({ email: person.email, access: "shipping" }));
    const row = (await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.email, person.email) }))!;
    const second = await staff.resendStaffInvite({ memberId: row.id });
    as(person);
    expect(await staff.acceptStaffInvite({ token: tokenOf(first.ok ? first.data.url : "") })).toMatchObject({ ok: false, error: E.invalidInvite });
    expect(await staff.acceptStaffInvite({ token: tokenOf(second.ok ? second.data.url : "") })).toMatchObject({ ok: true });
  });

  it("スタッフは招待・権限の変更・外すができない（オーナーだけ）", async () => {
    const { staff: person } = await hire("all", "notowner");
    as(person);
    expect(await staff.inviteStaff(null, form({ email: "x@awaji-test.jp", access: "all" }))).toMatchObject({ ok: false, error: E.noPermission });
    const me = (await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.userId, person.id) }))!;
    expect(await staff.removeStaff({ memberId: me.id })).toMatchObject({ ok: false, error: E.noPermission });
  });
});

describe("権限ごとにできること", () => {
  it("出荷担当: 注文の準備・メッセージはできる。キャンセル・商品・ショップ設定・精算・口座はできない", async () => {
    const { farm, staff: person } = await hire("shipping");
    const { fo } = await paidFarmOrder(farm.id);
    const product = (await db.query.products.findFirst({ where: eq(s.products.farmId, farm.id) }))!;
    as(person);

    expect(await startPreparing([fo.id])).toMatchObject({ ok: true });
    expect(await cancelOrder({ id: fo.id, reason: "テストのキャンセル理由です" })).toMatchObject({ ok: false, error: E.noPermission });
    expect(await setProductStatus({ id: product.id, status: product.status === "archived" ? "archived" : "active" })).toMatchObject({ ok: false, error: E.noPermission });
    expect(await setFarmPause({ until: null })).toMatchObject({ ok: false, error: E.noPermission });
    expect(await fetchPayoutOrders(crypto.randomUUID())).toMatchObject({ ok: false, error: E.noPermission });
    expect((await saveFarmBankAccount(null, form({}))).ok).toBe(false);
  });

  it("すべて: 商品・ショップ設定・キャンセルもできる。精算・振込先口座・スタッフ管理はできない", async () => {
    const { farm, staff: person } = await hire("all");
    const { fo } = await paidFarmOrder(farm.id);
    const product = (await db.query.products.findFirst({ where: eq(s.products.farmId, farm.id) }))!;
    as(person);

    expect(await setProductStatus({ id: product.id, status: product.status === "draft" ? "draft" : product.status === "archived" ? "archived" : "active" })).toMatchObject({ ok: true });
    expect(await setFarmPause({ until: null })).toMatchObject({ ok: true });
    expect(await cancelOrder({ id: fo.id, reason: "テストのキャンセル理由です" })).toMatchObject({ ok: true });
    expect(await fetchPayoutOrders(crypto.randomUUID())).toMatchObject({ ok: false, error: E.noPermission });
    expect(await saveFarmBankAccount(null, form({}))).toMatchObject({ ok: false, error: E.noPermission });
  });

  it("ページ: スタッフが概要（売上）・精算・スタッフ画面を開くと受注管理へ。出荷担当は商品画面も", async () => {
    const { staff: person } = await hire("shipping", "pages");
    as(person);
    await expect(requireFarm("money")).rejects.toThrow("REDIRECT:/farmer/orders");
    await expect(requireFarm("staff")).rejects.toThrow("REDIRECT:/farmer/orders");
    await expect(requireFarm("catalog")).rejects.toThrow("REDIRECT:/farmer/orders");
    await expect(requireFarm("ship")).resolves.toMatchObject({ access: "shipping" });
    await expect(requireFarm("member")).resolves.toMatchObject({ access: "shipping" });
  });

  it("売上明細CSVはオーナーだけ。送り状CSVは出荷担当も取れる", async () => {
    const { farm, staff: person } = await hire("shipping", "csv");
    const { fo } = await paidFarmOrder(farm.id);
    as(person);
    expect((await salesCsv(new NextRequest("http://localhost/api/farmer/sales?from=2026-01-01&to=2026-12-31"))).status).toBe(403);
    expect((await labelsCsv(new NextRequest(`http://localhost/api/farmer/labels?ids=${fo.id}`))).status).toBe(200);
  });

  it("よその農園の注文には触れない", async () => {
    const { staff: person } = await hire("all", "isolation");
    const [other] = await db
      .select({ id: s.farms.id })
      .from(s.farms)
      .innerJoin(s.products, eq(s.products.farmId, s.farms.id))
      .where(and(eq(s.products.status, "active"), ne(s.farms.slug, "awa-farm")))
      .limit(1);
    const { fo } = await paidFarmOrder(other.id);
    as(person);
    const res = await startPreparing([fo.id]);
    expect(res.ok).toBe(false);
    expect((await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))!.status).toBe("paid");
  });

  it("発送の記録に、操作したスタッフが残る", async () => {
    const { farm, staff: person } = await hire("shipping", "actor");
    const { fo } = await paidFarmOrder(farm.id);
    as(person);
    await startPreparing([fo.id]);
    const events = await db.select().from(s.shipmentEvents).where(eq(s.shipmentEvents.farmOrderId, fo.id));
    expect(events.at(-1)!.actorId).toBe(person.id);
    expect(events.filter((e) => e.actorId === person.id)).toHaveLength(1); // 注文受付（自動）には入らない
  });
});

describe("外す・抜ける", () => {
  it("外されたら、次の操作から生産者画面に入れない", async () => {
    const { user, staff: person } = await hire("all", "removed");
    const row = (await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.userId, person.id) }))!;
    as(user);
    expect(await staff.removeStaff({ memberId: row.id })).toMatchObject({ ok: true });
    as(person);
    await expect(requireFarm("member")).rejects.toThrow("REDIRECT:/mypage");
    expect((await setFarmPause({ until: null })).ok).toBe(false);
  });

  it("スタッフは自分から抜けられる。オーナーは抜けられない", async () => {
    const { user, staff: person } = await hire("shipping", "leave");
    as(user);
    expect(await staff.leaveStaff()).toMatchObject({ ok: false, error: E.ownerCannotLeave });
    as(person);
    expect(await staff.leaveStaff()).toMatchObject({ ok: true });
    expect(await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.userId, person.id) })).toBeUndefined();
  });

  it("退会すると所属も消える。スタッフのままでは出店申請できない", async () => {
    const { staff: person } = await hire("shipping", "closure");
    as(person);
    expect(await submitFarmApplication(null, form({}))).toMatchObject({ ok: false, error: joinContent.staffMember });
    await closeCustomerAccount(person.id);
    expect(await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.userId, person.id) })).toBeUndefined();
  });
});

describe("お客さまとのメッセージ", () => {
  it("スタッフの返信は農園として届き、農園側の未読は誰が見ても同じ", async () => {
    const { farm, user, staff: person } = await hire("shipping", "msg");
    const { buyer } = await paidFarmOrder(farm.id);
    as({ ...buyer, role: "customer" });
    await sendMessage({ farmId: farm.id, body: "いつ届きますか？" });
    // 農園側（オーナーにもスタッフにも）未読1
    const unread = async () => (await listThreads({ farmId: farm.id })).find((t) => t.customerId === buyer.id)!.unread;
    expect(await unread()).toBeGreaterThanOrEqual(1);

    as(person);
    const res = await sendMessage({ farmId: farm.id, customerId: buyer.id, body: "明日発送いたします。" });
    expect(res.ok).toBe(true);
    const sent = (await db.query.messages.findFirst({ where: eq(s.messages.id, res.ok ? res.data.id : "") }))!;
    expect(sent).toMatchObject({ customerId: buyer.id, senderId: person.id });
    // お客さま側のお知らせは農園名
    const note = (await db.query.notifications.findFirst({ where: and(eq(s.notifications.userId, buyer.id), eq(s.notifications.type, "message")), orderBy: (n, { desc }) => desc(n.createdAt) }))!;
    expect(note.title).toContain(farm.name);
    expect(note.title).not.toContain(person.name);
    // スタッフが送った分は、オーナーから見ても「お客さまからの未読」には数えない
    as(user);
    const fromCustomer = (await db.select().from(s.messages).where(and(eq(s.messages.farmId, farm.id), eq(s.messages.customerId, buyer.id)))).filter(
      (m) => m.senderId === buyer.id && !m.readAt,
    ).length;
    expect(await unread()).toBe(fromCustomer);
  });

  it("よその農園へは、スタッフでも農園としては送れない（お客さまとして送られる）", async () => {
    const { staff: person } = await hire("shipping", "msgother");
    const [other] = await db
      .select({ id: s.farms.id })
      .from(s.farms)
      .innerJoin(s.products, eq(s.products.farmId, s.farms.id))
      .where(and(eq(s.products.status, "active"), ne(s.farms.slug, "awa-farm")))
      .limit(1);
    const { buyer } = await paidFarmOrder(other.id); // よその農園に注文のあるお客さま（農園としてなら送れてしまう相手）
    as(person);
    const res = await sendMessage({ farmId: other.id, customerId: buyer.id, body: "よその農園として送ってみる" });
    expect(res.ok).toBe(true);
    const sent = (await db.query.messages.findFirst({ where: eq(s.messages.id, res.ok ? res.data.id : "") }))!;
    expect(sent.customerId).toBe(person.id); // 自分がお客さまのスレッドになる
    expect(sent.customerId).not.toBe(buyer.id);
  });
});

describe("メニュー", () => {
  it("出荷担当には、概要・精算・商品・ショップ設定・スタッフを出さない。オーナーには全部", async () => {
    const { visibleNav } = await import("@/components/layout/app-sidebar");
    const titles = (access: "owner" | "all" | "shipping") => visibleNav("farmer", access).flatMap((g) => g.items.map((i) => i.title));
    expect(titles("shipping")).toEqual(["受注管理", "出荷センター", "メッセージ", "アカウント"]);
    expect(titles("all")).not.toContain("売上・精算");
    expect(titles("all")).not.toContain("スタッフ");
    expect(titles("owner")).toEqual(expect.arrayContaining(["概要", "売上・精算", "スタッフ"]));
  });
});
