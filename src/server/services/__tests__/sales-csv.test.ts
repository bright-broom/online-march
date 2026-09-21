import { eq, ne } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

/**
 * 確定申告・記帳に使う売上明細。数字が1円でもずれたら使えないし、
 * よその農園の注文が混ざれば個人情報の事故になる。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid } = await import("../orders");
const { getSalesRows } = await import("@/server/queries/farmer");
const { buildSalesCsv } = await import("../sales-csv");
const { toYmd } = await import("@/lib/dates");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };

const iconv = (await import("iconv-lite")).default;
const decode = (body: Buffer, encoding: "sjis" | "utf8"): string =>
  encoding === "utf8" ? body.toString("utf8") : iconv.decode(body, "Shift_JIS");

const farmOf = async (slug: string) => (await db.query.farms.findFirst({ where: eq(s.farms.slug, slug) }))!;

/** 1件だけ注文を作り、その農園の売上にする */
async function orderFor(productSlug: string, orderedAt: Date) {
  const userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, productSlug), with: { variants: true } }))!;
  const variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
  const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 2 }], address, paymentProvider: "demo", now: new Date() });
  await markOrderPaid(order.id, { now: new Date() });
  const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  await db.update(s.farmOrders).set({ createdAt: orderedAt }).where(eq(s.farmOrders.id, fo.id));
  return { orderId: order.id, farmOrderId: fo.id, code: fo.code, farmId: fo.farmId };
}

describe("売上明細の書き出し", () => {
  it("自分の農園の注文だけを、期間で切り出す", async () => {
    const mine = await farmOf("awa-farm");
    const inside = await orderFor("awa-tsurigoya-tarzan", new Date("2026-03-10T09:00:00+09:00"));
    const before = await orderFor("awa-tsurigoya-tarzan", new Date("2025-12-31T23:00:00+09:00"));
    const other = await orderFor("matsuho-momiji3", new Date("2026-03-11T09:00:00+09:00")); // よその農園

    const rows = await getSalesRows(mine.id, "2026-01-01", "2026-12-31");
    const codes = rows.map((r) => r.farmOrderCode);

    expect(codes).toContain(inside.code);
    expect(codes).not.toContain(before.code); // 前年ぶんは入らない
    expect(codes).not.toContain(other.code);
    expect(other.farmId).not.toBe(mine.id);
  });

  it("期間の最終日に入った注文も含める", async () => {
    const mine = await farmOf("awa-farm");
    const lastDay = await orderFor("awa-tsurigoya-tarzan", new Date("2026-06-30T23:30:00+09:00"));

    const rows = await getSalesRows(mine.id, "2026-06-01", "2026-06-30");

    expect(rows.map((r) => r.farmOrderCode)).toContain(lastDay.code);
  });

  it("金額は精算と同じ計算（商品代金＋送料−手数料＝受取額）", async () => {
    const mine = await farmOf("awa-farm");
    const made = await orderFor("awa-tsurigoya-tarzan", new Date("2026-04-02T09:00:00+09:00"));

    const row = (await getSalesRows(mine.id, "2026-04-01", "2026-04-30")).find((r) => r.farmOrderCode === made.code)!;

    expect(row.payoutAmount).toBe(row.subtotal + row.shippingFee - row.commission);
    expect(row.commission).toBeGreaterThan(0);
    expect(row.items).toMatch(/×2/); // 何をいくつ売ったかが読める
  });

  it("CSV に見出し・明細・合計が入り、Excel で開ける文字コードで出る", async () => {
    const mine = await farmOf("awa-farm");
    await orderFor("awa-tsurigoya-tarzan", new Date("2026-05-02T09:00:00+09:00"));
    const rows = await getSalesRows(mine.id, "2026-05-01", "2026-05-31");

    const csv = buildSalesCsv(rows, { from: "2026-05-01", to: "2026-05-31", farmName: mine.name });
    const text = decode(csv.body, "sjis");
    const lines = text.trim().split("\r\n");

    expect(lines[0]).toContain("注文番号");
    expect(lines[0]).toContain("受取額");
    expect(lines).toHaveLength(rows.length + 2); // 見出し + 明細 + 合計
    expect(lines.at(-1)).toContain("合計");
    const totalPayout = rows.reduce((a, r) => a + r.payoutAmount, 0);
    expect(lines.at(-1)).toContain(String(totalPayout));
    expect(csv.contentType).toContain("Shift_JIS");
    expect(csv.filename).toBe("sales-2026-05-01_2026-05-31.csv");
  });

  it("商品名にカンマや引用符があっても列がずれない", async () => {
    const mine = await farmOf("awa-farm");
    const made = await orderFor("awa-tsurigoya-tarzan", new Date("2026-07-02T09:00:00+09:00"));
    await db.update(s.orderItems).set({ productName: 'たまねぎ, 5kg "特大"' }).where(eq(s.orderItems.farmOrderId, made.farmOrderId));

    const rows = await getSalesRows(mine.id, "2026-07-01", "2026-07-31");
    const text = decode(buildSalesCsv(rows, { from: "2026-07-01", to: "2026-07-31", farmName: mine.name, encoding: "utf8" }).body, "utf8");
    const row = text.split("\r\n").find((l: string) => l.includes(made.code))!;

    expect(row).toContain('""特大""'); // 引用符はエスケープされる
    expect(row.split('","')).toHaveLength(16); // 列数は見出しと同じ
  });

  it("未決済の注文は売上に数えない", async () => {
    const mine = await farmOf("awa-farm");
    const userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
    await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, product.variants[0].id));
    const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "stripe", now: new Date() });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));

    const rows = await getSalesRows(mine.id, toYmd(new Date()), toYmd(new Date()));

    expect(rows.map((r) => r.farmOrderCode)).not.toContain(fo.code);
    expect(await db.query.farmOrders.findFirst({ where: ne(s.farmOrders.id, fo.id) })).toBeTruthy();
  });
});
