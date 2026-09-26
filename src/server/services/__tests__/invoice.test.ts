import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * インボイス対応（#10）。オーナーの決定（Issue #10 のコメント）:
 * 運営は登録済み／予定 → 番号が設定されていれば領収書・支払通知書に出す／商品 8%・送料 10%／生産者の番号は任意で登録／支払通知書を作る。
 */
const company = vi.hoisted(() => ({ invoiceRegistrationNumber: "" }));
vi.mock("@/config/site", async (orig) => {
  const mod = await orig<typeof import("@/config/site")>();
  return { ...mod, siteConfig: { ...mod.siteConfig, company: new Proxy(mod.siteConfig.company, { get: (t, k) => (k === "invoiceRegistrationNumber" ? company.invoiceRegistrationNumber : t[k as keyof typeof t]) }) } };
});
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn(), useRouter: () => ({}) }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid } = await import("../orders");
const { getOrderSummary, } = await import("@/server/queries/account");
const { getPayoutStatement } = await import("@/server/queries/farmer");
const { receiptTaxLines, receiptAmounts } = await import("@/lib/receipt");
const { ReceiptView } = await import("@/components/mypage/receipt-view");
const { PayoutStatementDocument } = await import("@/components/farmer/payouts/payout-statement");
const { saveFarmInvoiceNumber } = await import("@/server/actions/farmer-shop");
const { checkInvoiceNumber } = await import("@/server/queries/go-live");
const { productTaxRateSchema } = await import("@/lib/validators/farmer");
const { taxConfig } = await import("@/config/tax");

const address = { recipientName: "インボイス テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const REG = "T1234567890123";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  company.invoiceRegistrationNumber = "";
});

async function paidOrderWith(taxRate: number) {
  const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  await db.update(s.products).set({ taxRate }).where(eq(s.products.id, product.id));
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, product.variants[0].id));
  const now = new Date();
  const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId: product.variants[0].id, quantity: 2 }], address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  await db.update(s.products).set({ taxRate: 8 }).where(eq(s.products.id, product.id));
  return { order: (await getOrderSummary(buyer.id, order.id))!, buyer };
}

describe("注文明細の税率", () => {
  it("購入時点の商品の税率を控える（あとで商品を変えても変わらない）", async () => {
    const { order } = await paidOrderWith(10);
    expect(order.farmOrders[0].items[0].taxRate).toBe(10);
  });

  it("商品の税率は 8 か 10 だけ", () => {
    expect(productTaxRateSchema.safeParse("8").success).toBe(true);
    expect(productTaxRateSchema.safeParse("10").success).toBe(true);
    expect(productTaxRateSchema.safeParse("5").success).toBe(false);
  });
});

describe("領収書", () => {
  it("税率ごとの内訳の合計は受け取った額と一致する", async () => {
    const { order } = await paidOrderWith(8);
    const lines = receiptTaxLines(order);
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(receiptAmounts(order)!.received);
    expect(lines.map((l) => l.rate)).toContain(8);
  });

  const render = async (reg: string) => {
    company.invoiceRegistrationNumber = reg;
    const { order } = await paidOrderWith(8);
    return renderToStaticMarkup(
      createElement(ReceiptView, {
        data: {
          code: order.code, issuedAt: new Date(), total: order.total, refunded: 0, subtotal: order.subtotal, shippingTotal: order.shippingTotal,
          discountTotal: order.discountTotal, paymentLabel: "テスト", defaultName: "山田",
          items: order.farmOrders.flatMap((fo) => fo.items.map((it) => ({ name: it.productName, quantity: it.quantity, lineTotal: it.lineTotal, taxRate: it.taxRate }))),
          taxLines: receiptTaxLines(order),
        },
      }),
    );
  };

  it("運営の登録番号が設定されていれば出す。軽減税率の商品に印と注記", async () => {
    const html = await render(REG);
    expect(html).toContain(`登録番号 ${REG}`);
    expect(html).toContain(taxConfig.reducedNote);
    // 注記だけでなく、商品の行にも印がある（注記の分と合わせて2つ以上）
    expect(html.split(taxConfig.reducedMark).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/8%対象/);
    expect(html).toMatch(/うち消費税/);
  });

  it("未設定の間は番号を出さない（内訳は出す）", async () => {
    const html = await render("");
    expect(html).not.toContain("登録番号");
    expect(html).toMatch(/8%対象/);
  });
});

describe("生産者の登録番号", () => {
  const signIn = async (email: string, role: Role) => {
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
    currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
    return u;
  };

  it("全角・ハイフンをそろえて保存し、形の違うものは断る。空で消せる", async () => {
    const owner = await signIn("farmer@demo.awaji", "farmer");
    const stored = async () => (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, owner.id) }))!.invoiceRegistrationNumber;

    expect(await saveFarmInvoiceNumber(null, form({ invoiceRegistrationNumber: "ｔ１２３４-５６７８-９０１２３" }))).toMatchObject({ ok: true });
    expect(await stored()).toBe(REG);
    expect((await saveFarmInvoiceNumber(null, form({ invoiceRegistrationNumber: "T123" }))).ok).toBe(false);
    expect(await stored()).toBe(REG);
    expect(await saveFarmInvoiceNumber(null, form({ invoiceRegistrationNumber: "" }))).toMatchObject({ ok: true });
    expect(await stored()).toBeNull();
  });

  it("購入者も、「すべて」の権限のスタッフも変えられない（税の情報なのでオーナーだけ）", async () => {
    const owner = (await db.query.user.findFirst({ where: eq(s.user.email, "farmer@demo.awaji") }))!;
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, owner.id) }))!;
    const staffUser = await signIn("customer@demo.awaji", "customer");
    expect((await saveFarmInvoiceNumber(null, form({ invoiceRegistrationNumber: REG }))).ok).toBe(false);

    await db.insert(s.farmMembers).values({ farmId: farm.id, email: staffUser.email, userId: staffUser.id, access: "all", acceptedAt: new Date(), expiresAt: new Date() });
    expect(await saveFarmInvoiceNumber(null, form({ invoiceRegistrationNumber: REG }))).toMatchObject({ ok: false, error: "この操作を行う権限がありません" });
    await db.delete(s.farmMembers).where(eq(s.farmMembers.userId, staffUser.id));
  });
});

describe("支払通知書", () => {
  async function payoutOf(farmSlug: string) {
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, farmSlug) }))!;
    const [p] = await db
      .insert(s.payouts)
      .values({ farmId: farm.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 10000, shippingFees: 1600, commission: 1000, refundAdjustment: 500, amount: 10100, orderCount: 2, scheduledFor: "2026-09-15" })
      .returning();
    return { farm, payout: p };
  }

  it("自分の農園の精算だけ開ける", async () => {
    const { farm, payout } = await payoutOf("awa-farm");
    const other = (await db.query.farms.findFirst({ where: (f, { ne }) => ne(f.id, farm.id) }))!;
    expect(await getPayoutStatement(farm.id, payout.id)).not.toBeNull();
    expect(await getPayoutStatement(other.id, payout.id)).toBeNull();
  });

  it("販売手数料の消費税（10%）と振込額を出す。運営の登録番号があれば適格請求書を兼ねる", async () => {
    const { farm, payout } = await payoutOf("awa-farm");
    const statement = (await getPayoutStatement(farm.id, payout.id))!;
    const html = (reg: string) => {
      company.invoiceRegistrationNumber = reg;
      return renderToStaticMarkup(createElement(PayoutStatementDocument, { statement, farm, issuedAt: new Date() }));
    };
    const withReg = html(REG);
    expect(withReg).toContain("兼 適格請求書");
    expect(withReg).toContain(`登録番号 ${REG}`);
    expect(withReg).toContain("¥90"); // 1,000 × 10/110 = 90.9… → 90
    expect(withReg).toContain("¥10,100");
    expect(withReg).toContain("返金の相殺");
    expect(html("")).not.toContain("適格請求書（販売手数料）");
  });
});

describe("本番公開チェック", () => {
  it("未設定は要確認、形が違えば止める、正しければ OK", () => {
    expect(checkInvoiceNumber("").state).toBe("warning");
    expect(checkInvoiceNumber("T123").state).toBe("blocker");
    expect(checkInvoiceNumber(REG).state).toBe("ready");
  });
});
