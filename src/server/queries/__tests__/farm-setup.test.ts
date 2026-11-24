import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

/**
 * 承認直後の農園のダッシュボードに出す「販売を始めるまで」。
 * 何も無いのに「今日のやることはすべて完了」と出ていたため、売れる状態・売上を受け取れる状態かを判定して見せる。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { getFarmSetup } = await import("@/server/queries/farmer");
const { saveBankAccount } = await import("@/server/services/bank-account");
const { bankAccountSchema } = await import("@/lib/validators/bank-account");

async function newFarm(tag: string) {
  const userId = `setup-${tag}`;
  await db.insert(s.user).values({ id: userId, name: "テスト 生産者", email: `${userId}@example.test`, role: "farmer" });
  const [farm] = await db
    .insert(s.farms)
    .values({ ownerId: userId, slug: `setup-${tag}`, name: "テスト農園", representative: "テスト 生産者", status: "active" })
    .returning();
  return farm;
}

async function addProduct(farmId: string, tag: string, status: "active" | "draft", stock: number) {
  const [p] = await db.insert(s.products).values({ farmId, slug: `setup-${tag}`, name: "テスト玉ねぎ", status }).returning();
  await db.insert(s.productVariants).values({ productId: p.id, label: "5kg", weightGrams: 5000, price: 3000, stock, isDefault: true });
  return p;
}

describe("販売を始めるまで（getFarmSetup）", () => {
  it("承認したばかりの農園は、3つとも済んでいない", async () => {
    const farm = await newFarm("empty");
    expect(await getFarmSetup(farm)).toEqual({ product: false, payout: false, shop: false });
  });

  it("商品は「販売中」で在庫があるときだけ済みにする（下書き・在庫0では買えない）", async () => {
    const farm = await newFarm("product");
    await addProduct(farm.id, "product-draft", "draft", 10);
    await addProduct(farm.id, "product-empty", "active", 0);
    expect((await getFarmSetup(farm)).product).toBe(false);

    await addProduct(farm.id, "product-ok", "active", 5);
    expect((await getFarmSetup(farm)).product).toBe(true);
  });

  it("売上の受け取り先は、振込先口座か Stripe の登録のどちらかで済み", async () => {
    const farm = await newFarm("payout");
    expect((await getFarmSetup(farm)).payout).toBe(false);
    expect((await getFarmSetup({ ...farm, stripeOnboarded: true })).payout).toBe(true);

    const input = bankAccountSchema.parse({
      bankName: "テスト銀行",
      bankCode: "9999",
      branchName: "テスト支店",
      branchCode: "001",
      accountType: "ordinary",
      accountNumber: "1234567",
      holderKana: "テスト タロウ",
    });
    await saveBankAccount(farm.id, input);
    expect((await getFarmSetup(farm)).payout).toBe(true);
  });

  it("ショップページはアイコンと表紙の両方があるときだけ済み", async () => {
    const farm = await newFarm("shop");
    expect((await getFarmSetup({ ...farm, avatarImage: "/uploads/farms/a-b.jpg" })).shop).toBe(false);
    const [updated] = await db
      .update(s.farms)
      .set({ avatarImage: "/uploads/farms/a-b.jpg", heroImage: "/uploads/farms/c-d.jpg" })
      .where(eq(s.farms.id, farm.id))
      .returning();
    expect((await getFarmSetup(updated)).shop).toBe(true);
  });
});
