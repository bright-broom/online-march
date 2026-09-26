import { and, eq, ne } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * お客さまのキャンセル（#18）。オーナーの決定（Issue #18 のコメント）:
 * 出荷準備中になった後は「依頼 → 生産者が承認で全額返金／お断りでそのまま発送」／複数の農家の注文は準備前の農家の分だけ取り消せる／
 * 猶予なし（「準備を始める」で締め切り）／文言を合わせる。
 *
 * ここでは再現できない守り（PGlite はクエリを1本ずつ処理するので、読んだ後に別の操作が割り込めない）: 状態を条件にした更新のうち、
 * 先に読んだ値の確認と二重になっているもの。外してもこのファイルは通る（2026-09-26 に確認）:
 * - 発送の更新の「読んだ後に届いた依頼があれば発送しない」条件（services/orders.ts#transitionFarmOrder）
 * - 依頼の記録の「まだ依頼していない・準備中のまま」条件、回答の「まだ回答していない」条件（services/cancel-requests.ts）
 * - お客さまの取り消し（生産者ごと・注文全体）で refundOrder に渡す onlyStatus: "paid"（refundOrder の onlyStatus そのものは下で直接確かめる）
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
const refundPayment = vi.fn(async () => ({ id: "re_test" }));
vi.mock("@/server/services/payments/stripe", () => ({ refundPayment, cancelPaymentIntent: vi.fn() }));
const sendEmail = vi.fn(async () => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("../orders");
const { refundOrder } = await import("../refunds");
const account = await import("@/server/actions/account");
const farmerOrders = await import("@/server/actions/farmer-orders");
const { getOrderDetail } = await import("@/server/queries/account");
const { cancellationPolicy } = await import("@/config/content");

const address = { recipientName: "取消依頼 テスト", postalCode: "6560000", prefecture: "兵庫県", city: "南あわじ市", line1: "1", phone: "0799000000" };

async function signIn(userId: string, role: Role) {
  const u = (await db.query.user.findFirst({ where: eq(s.user.id, userId) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
}
const customer = async () => (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;

/** 2軒の農家の商品をまとめて買い、Stripe で支払い済みにした注文 */
async function twoFarmOrder() {
  const buyer = await customer();
  const a = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true, farm: true } }))!;
  const b = (await db.query.products.findFirst({
    where: and(ne(s.products.farmId, a.farmId), eq(s.products.status, "active")),
    with: { variants: true, farm: true },
  }))!;
  for (const p of [a, b]) await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, p.variants[0].id));
  const now = new Date();
  const { order } = await createOrder({
    userId: buyer.id, email: buyer.email, address, paymentProvider: "stripe", now,
    lines: [{ variantId: a.variants[0].id, quantity: 1 }, { variantId: b.variants[0].id, quantity: 1 }],
  });
  const pi = `pi_${order.id.slice(0, 8)}`;
  await db.update(s.orders).set({ stripePaymentIntentId: pi }).where(eq(s.orders.id, order.id));
  await markOrderPaid(order.id, { paymentIntentId: pi, now });
  const fos = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  const foA = fos.find((f) => f.farmId === a.farmId)!;
  const foB = fos.find((f) => f.farmId === b.farmId)!;
  return { order, pi, buyer, foA, foB, farmA: a.farm, variantA: a.variants[0].id };
}
const fo = async (id: string) => (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, id) }))!;
const orderStatus = async (id: string) => (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!.status;
const stock = async (variantId: string) => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
const subjects = () => (sendEmail.mock.calls as unknown as [{ subject: string; to: string }][]).map(([m]) => m);
const prepare = (id: string) => transitionFarmOrder(id, "preparing", { source: "farmer", now: new Date() });
/** 出荷準備中にして、お客さまがキャンセルを依頼した状態 */
async function requested() {
  const o = await twoFarmOrder();
  await prepare(o.foA.id);
  await signIn(o.buyer.id, "customer");
  const res = await account.requestFarmOrderCancel({ farmOrderId: o.foA.id, reason: "引っ越しで受け取れなくなりました" });
  if (!res.ok) throw new Error(res.error);
  return o;
}

beforeEach(() => {
  refundPayment.mockClear();
  sendEmail.mockClear();
});

describe("準備を始める前: お客さまが生産者ごとに取り消せる", () => {
  it("その生産者の分だけを送料も含めて返金し、在庫を戻す。ほかの生産者の分と注文はそのまま", async () => {
    const { order, pi, buyer, foA, foB, variantA } = await twoFarmOrder();
    const before = await stock(variantA);
    await signIn(buyer.id, "customer");

    const res = await account.cancelFarmOrder(foA.id);

    expect(res).toMatchObject({ ok: true });
    const amount = foA.subtotal + foA.shippingFee - foA.discount;
    expect(refundPayment).toHaveBeenCalledWith(pi, amount, `farm-order:${foA.id}`);
    expect(await fo(foA.id)).toMatchObject({ status: "cancelled", refundAmount: amount });
    expect((await fo(foB.id)).status).toBe("paid");
    expect(await orderStatus(order.id)).toBe("paid");
    expect(await stock(variantA)).toBe(before + 1);
  });

  it("出荷準備中の分は取り消せない（依頼になる）。返金しない", async () => {
    const { buyer, foA } = await twoFarmOrder();
    await prepare(foA.id);
    await signIn(buyer.id, "customer");

    expect(await account.cancelFarmOrder(foA.id)).toMatchObject({ ok: false, error: "出荷準備が始まっているため、キャンセルの依頼をご利用ください" });
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await fo(foA.id)).status).toBe("preparing");
  });

  it("1軒でも準備中なら注文全体は取り消せない。どこも準備前なら取り消せる", async () => {
    const one = await twoFarmOrder();
    await prepare(one.foA.id);
    await signIn(one.buyer.id, "customer");
    expect((await getOrderDetail(one.buyer.id, one.order.id))!.cancellable).toBe(false);
    const res = await account.cancelOrder(one.order.id);
    expect(res).toMatchObject({ ok: false });
    expect(!res.ok && res.error).toContain("出荷準備が始まっている生産者の分があるため");
    expect(await orderStatus(one.order.id)).toBe("paid");
    expect(refundPayment).not.toHaveBeenCalled();

    const two = await twoFarmOrder();
    expect((await getOrderDetail(two.buyer.id, two.order.id))!.cancellable).toBe(true);
    expect(await account.cancelOrder(two.order.id)).toMatchObject({ ok: true });
    expect(await orderStatus(two.order.id)).toBe("refunded");
  });

  it("生産者が「準備を始める」を押した後に届いた取り消しは通らない（返金の行を押さえるときに状態を確かめる）", async () => {
    const { order, foA } = await twoFarmOrder();
    await prepare(foA.id);
    await expect(refundOrder({ orderId: order.id, farmOrderId: foA.id, onlyStatus: "paid" }, { source: "customer" })).rejects.toThrow("注文の状態が変わったため");
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await fo(foA.id)).refundedAt).toBeNull();
  });

  it("返金の途中（行を押さえた後）の出荷単位は、準備にも発送にも進めない", async () => {
    const { foA, foB } = await twoFarmOrder();
    await db.update(s.farmOrders).set({ refundedAt: new Date() }).where(eq(s.farmOrders.id, foA.id));
    await expect(prepare(foA.id)).rejects.toThrow("他の操作で状態が変更されました");
    await db.update(s.farmOrders).set({ refundedAt: new Date() }).where(eq(s.farmOrders.id, foB.id));
    await expect(transitionFarmOrder(foB.id, "shipped", { source: "farmer", now: new Date(), trackingNumber: "412311112222" })).rejects.toThrow("他の操作で状態が変更されました");
  });
});

describe("出荷準備中: キャンセルの依頼", () => {
  it("依頼を記録して生産者のオーナーに知らせる。依頼は1回だけ", async () => {
    const { buyer, foA, farmA } = await requested();
    const owner = (await db.query.user.findFirst({ where: eq(s.user.id, farmA.ownerId) }))!;

    expect(await fo(foA.id)).toMatchObject({ cancelRequestReason: "引っ越しで受け取れなくなりました", cancelRequestAnsweredAt: null });
    expect((await fo(foA.id)).cancelRequestedAt).toBeInstanceOf(Date);
    expect(subjects()).toContainEqual(expect.objectContaining({ to: owner.email, subject: `【キャンセルの依頼】${foA.code}` }));
    expect(refundPayment).not.toHaveBeenCalled();

    await signIn(buyer.id, "customer");
    expect(await account.requestFarmOrderCancel({ farmOrderId: foA.id, reason: "もう一度" })).toMatchObject({ ok: false, error: "キャンセルの依頼は1つのご注文につき1回だけです" });
  });

  it("準備前の分には依頼できない（そのまま取り消せる）", async () => {
    const { buyer, foA } = await twoFarmOrder();
    await signIn(buyer.id, "customer");
    expect(await account.requestFarmOrderCancel({ farmOrderId: foA.id, reason: "理由です" })).toMatchObject({
      ok: false, error: "まだ出荷準備が始まっていないため、そのままキャンセルできます",
    });
    expect((await fo(foA.id)).cancelRequestedAt).toBeNull();
  });

  it("回答するまで、生産者は発送済みにできない（1件でも一括でも、送り状の取り込みの確認でも）", async () => {
    const { foA, farmA } = await requested();
    await signIn(farmA.ownerId, "farmer");

    expect(await farmerOrders.shipOrder({ id: foA.id, carrier: "yamato", trackingNumber: "412300001111" })).toMatchObject({
      ok: false, error: "お客さまからキャンセルの依頼が届いています。先に回答してください",
    });
    const bulk = await farmerOrders.shipOrdersBulk({ rows: [{ id: foA.id, carrier: "yamato", trackingNumber: "412300001111" }] });
    expect(bulk.ok).toBe(false);
    const preview = await farmerOrders.previewTrackingImport({ text: `${foA.code},412300001111` });
    expect(preview.ok && preview.data[0]).toMatchObject({ ok: false, reason: "キャンセルの依頼に回答してから登録してください" });
    expect((await fo(foA.id)).status).toBe("preparing");
  });

  it("承認すると全額返金してキャンセル。二度押しても返金は1回", async () => {
    const { pi, foA, farmA } = await requested();
    await signIn(farmA.ownerId, "farmer");

    expect(await farmerOrders.answerCancel({ id: foA.id, approve: true })).toMatchObject({ ok: true });
    const amount = foA.subtotal + foA.shippingFee - foA.discount;
    expect(refundPayment).toHaveBeenCalledWith(pi, amount, `farm-order:${foA.id}`);
    expect(await fo(foA.id)).toMatchObject({ status: "cancelled", cancelRequestAnswer: "approved", refundAmount: amount });

    expect((await farmerOrders.answerCancel({ id: foA.id, approve: true })).ok).toBe(false);
    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it("承認の返金が失敗したら回答を戻す（もう一度押せる）", async () => {
    const { foA, farmA } = await requested();
    await signIn(farmA.ownerId, "farmer");
    refundPayment.mockRejectedValueOnce(new Error("stripe down"));

    expect((await farmerOrders.answerCancel({ id: foA.id, approve: true })).ok).toBe(false);
    expect(await fo(foA.id)).toMatchObject({ status: "preparing", cancelRequestAnswer: null, cancelRequestAnsweredAt: null, refundedAt: null });
    expect(await farmerOrders.answerCancel({ id: foA.id, approve: true })).toMatchObject({ ok: true });
  });

  it("お断りするとお客さまにひとことを添えて知らせ、そのあとは発送できる", async () => {
    const { order, buyer, foA, farmA } = await requested();
    await signIn(farmA.ownerId, "farmer");

    expect(await farmerOrders.answerCancel({ id: foA.id, approve: false, reply: "箱詰めが済んでいるため、このままお届けします" })).toMatchObject({ ok: true });
    expect(await fo(foA.id)).toMatchObject({ status: "preparing", cancelRequestAnswer: "declined", cancelRequestReply: "箱詰めが済んでいるため、このままお届けします" });
    expect(subjects()).toContainEqual(expect.objectContaining({ to: buyer.email, subject: `【キャンセルの依頼について】注文番号 ${order.code}` }));
    expect(refundPayment).not.toHaveBeenCalled();

    const detail = (await getOrderDetail(buyer.id, order.id))!;
    expect(detail.farmOrders.find((f) => f.id === foA.id)!.cancelMode).toBe("declined");
    expect(await farmerOrders.shipOrder({ id: foA.id, carrier: "yamato", trackingNumber: "412300002222" })).toMatchObject({ ok: true });
  });

  it("出荷担当のスタッフは回答できない（返金を伴うので、キャンセルと同じ権限）", async () => {
    const { foA, farmA } = await requested();
    const staff = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    await db.insert(s.farmMembers).values({ farmId: farmA.id, email: staff.email, userId: staff.id, access: "shipping", acceptedAt: new Date(), expiresAt: new Date() });
    await signIn(staff.id, "customer");

    expect(await farmerOrders.answerCancel({ id: foA.id, approve: true })).toMatchObject({ ok: false, error: "この操作を行う権限がありません" });
    expect((await fo(foA.id)).cancelRequestAnsweredAt).toBeNull();
    expect(refundPayment).not.toHaveBeenCalled();
    await db.delete(s.farmMembers).where(eq(s.farmMembers.userId, staff.id));
  });

  it("運営が発送済みにしたときは、依頼を「お断り」で閉じる", async () => {
    const { foA } = await requested();
    await transitionFarmOrder(foA.id, "shipped", { source: "admin", now: new Date(), trackingNumber: "412300003333" });
    expect(await fo(foA.id)).toMatchObject({ status: "shipped", cancelRequestAnswer: "declined" });
  });
});

describe("案内の文言", () => {
  it("ご利用ガイド・最終確認画面の文が、準備前は取り消し・準備後は依頼という決まりを書いている", () => {
    expect(cancellationPolicy).toContain("出荷準備を始める前であれば");
    expect(cancellationPolicy).toContain("キャンセルを依頼");
    expect(cancellationPolicy).not.toContain("発送前であれば");
  });
});
