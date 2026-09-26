import { and, asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「通常価格」の打ち消し表示（#11）。オーナーの決定（Issue #11 のコメント）:
 * 販売の記録がある価格だけ表示／直近8週間の過半＋最後に売ってから2週間以内／記録がたまるまで隠す。
 * 判定そのものの境界は lib/__tests__/compare-price.test.ts。ここは記録の付け方と、お客さまに見える値への反映。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

type Role = "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { syncPriceHistory, refreshAllDisplayCompareAt } = await import("../price-history");
const { saveProduct, setProductStatus } = await import("@/server/actions/farmer-products");
const { setProductArchived } = await import("@/server/actions/admin-catalog");
const { getFarmProducts, getProductBySlug } = await import("@/server/queries/catalog");
const { listFavoriteProducts } = await import("@/server/queries/account");
const { getCompareAtNotes } = await import("@/server/queries/farmer");
const { comparePricePolicy } = await import("@/config/catalog");

const DAY = 86_400_000;
const T0 = Date.now();
const at = (daysFromNow: number) => new Date(T0 + daysFromNow * DAY);

type Product = typeof s.products.$inferSelect & { variants: (typeof s.productVariants.$inferSelect)[]; images: (typeof s.productImages.$inferSelect)[] };
let product: Product;
const variantId = () => product.variants[0].id;

async function signIn(email: string, role: Role) {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
}
const setVariant = (fields: { price?: number; compareAtPrice?: number | null }) => db.update(s.productVariants).set(fields).where(eq(s.productVariants.id, variantId()));
const periods = () => db.select().from(s.variantPricePeriods).where(eq(s.variantPricePeriods.variantId, variantId())).orderBy(asc(s.variantPricePeriods.startedAt));
const shown = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId()) }))!.displayCompareAtPrice;
/** お客さまに見える通常価格: 商品ページ・商品カード（一覧は最安の規格の値。800円にした規格が最安）・お気に入り */
async function customerSees() {
  const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  await db.insert(s.favorites).values({ userId: buyer.id, productId: product.id }).onConflictDoNothing();
  const detail = (await getProductBySlug(product.slug))?.variants.find((v) => v.id === variantId())?.compareAt ?? null;
  const card = (await getFarmProducts(product.farmId)).find((p) => p.id === product.id)?.compareAt ?? null;
  const favorite = (await listFavoriteProducts(buyer.id)).find((p) => p.id === product.id)?.variant?.compareAtPrice ?? null;
  return [detail, card, favorite];
}

/** 70日前から 1,000円で販売し、14日前に 800円へ値下げして通常価格 1,000円を入れた */
async function discountedTwoWeeksAgo() {
  await setVariant({ price: 1000, compareAtPrice: null });
  await syncPriceHistory(db, product.id, at(-70));
  await setVariant({ price: 800, compareAtPrice: 1000 });
  await syncPriceHistory(db, product.id, at(-14));
}

beforeEach(async () => {
  const farmer = await signIn("farmer@demo.awaji", "farmer");
  const farm = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, farmer.id) }))!;
  product = (await db.query.products.findFirst({
    where: and(eq(s.products.farmId, farm.id), eq(s.products.status, "active")),
    with: { variants: { orderBy: asc(s.productVariants.sortOrder) }, images: true },
  }))!;
  await db.update(s.products).set({ status: "active" }).where(eq(s.products.id, product.id));
  await db.delete(s.variantPricePeriods).where(inArray(s.variantPricePeriods.variantId, product.variants.map((v) => v.id)));
  await db.update(s.productVariants).set({ displayCompareAtPrice: null }).where(eq(s.productVariants.productId, product.id));
});

describe("販売の記録", () => {
  it("公開中の価格で期間を開き、価格を変えたら閉じて新しい期間を開く。何度呼んでも増えない", async () => {
    await setVariant({ price: 1000 });
    await syncPriceHistory(db, product.id, at(-10));
    await syncPriceHistory(db, product.id, at(-9));
    await setVariant({ price: 900 });
    await syncPriceHistory(db, product.id, at(-5));
    const rows = await periods();
    expect(rows.map((r) => [r.price, r.startedAt.getTime(), r.endedAt?.getTime() ?? null])).toEqual([
      [1000, at(-10).getTime(), at(-5).getTime()],
      [900, at(-5).getTime(), null],
    ]);
  });
});

describe("お客さまに見える通常価格", () => {
  it("8週間通常価格で販売してから値下げしたら、打ち消し表示する", async () => {
    await discountedTwoWeeksAgo();
    expect(await shown()).toBe(1000);
    expect(await customerSees()).toEqual([1000, 1000, 1000]);
  });

  it("販売の記録がない通常価格は出さない（入れただけでは表示しない）", async () => {
    await setVariant({ price: 800, compareAtPrice: 1000 });
    await syncPriceHistory(db, product.id, at(0));
    expect(await shown()).toBeNull();
    expect(await customerSees()).toEqual([null, null, null]);
    expect((await getCompareAtNotes([variantId()], new Date()))[variantId()]).toEqual({ shown: false, message: comparePricePolicy.reasons.noRecord });
  });

  it("生産者の画面には表示中かどうかを出す", async () => {
    await discountedTwoWeeksAgo();
    expect((await getCompareAtNotes([variantId()], new Date()))[variantId()]).toEqual({ shown: true, message: comparePricePolicy.reasons.shown });
  });

  it("値下げから8週間を過ぎたら、毎日の自動処理で表示をやめる", async () => {
    await discountedTwoWeeksAgo();
    const changed = await refreshAllDisplayCompareAt(at(-14 + comparePricePolicy.maxSaleDays + 1));
    expect(changed).toContain(product.id);
    expect(await shown()).toBeNull();
  });

  it("生産者が非公開にしたら記録を閉じて表示をやめ、公開し直しても値下げの始まりは変わらない", async () => {
    await discountedTwoWeeksAgo();
    expect((await setProductStatus({ id: product.id, status: "draft" })).ok).toBe(true);
    expect((await periods()).every((p) => p.endedAt != null)).toBe(true);
    expect(await shown()).toBeNull();

    expect((await setProductStatus({ id: product.id, status: "active" })).ok).toBe(true);
    expect((await periods()).filter((p) => p.endedAt == null)).toHaveLength(1);
    expect(await shown()).toBe(1000); // 値下げの始まりは14日前のまま
  });

  it("運営がアーカイブしても記録を閉じる", async () => {
    await discountedTwoWeeksAgo();
    await signIn("admin@demo.awaji", "admin");
    expect((await setProductArchived({ productId: product.id, archived: true })).ok).toBe(true);
    expect((await periods()).every((p) => p.endedAt != null)).toBe(true);
    expect(await shown()).toBeNull();
  });

  it("商品の保存で価格を変えると記録に残る", async () => {
    await discountedTwoWeeksAgo();
    const v = (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId()) }))!;
    const form = new FormData();
    for (const [k, val] of Object.entries({
      id: product.id, name: product.name, category: product.category, variety: product.variety ?? "", summary: product.summary,
      description: product.description, cultivation: product.cultivation, status: product.status,
    })) form.set(k, val);
    form.set("highlights", JSON.stringify(product.highlights ?? []));
    form.set("images", JSON.stringify(product.images.map((i) => ({ url: i.url, alt: i.alt }))));
    form.set(
      "variants",
      JSON.stringify(
        product.variants.map((o) =>
          o.id === v.id
            ? { id: v.id, label: v.label, weightGrams: v.weightGrams, price: 1000, compareAtPrice: null, sku: v.sku ?? "", stock: v.stock, stockBase: v.stock }
            : { id: o.id, label: o.label, weightGrams: o.weightGrams, price: o.price, compareAtPrice: o.compareAtPrice, sku: o.sku ?? "", stock: o.stock, stockBase: o.stock },
        ),
      ),
    );
    expect((await saveProduct(null, form)).ok).toBe(true);
    const rows = await periods();
    expect(rows.at(-1)).toMatchObject({ price: 1000, endedAt: null });
    expect(rows.filter((p) => p.endedAt == null)).toHaveLength(1);
    expect(await shown()).toBeNull();
  });

  it("この機能を入れる前から公開していた商品も、毎日の自動処理で記録を始める", async () => {
    expect(await periods()).toHaveLength(0);
    await refreshAllDisplayCompareAt(new Date());
    expect((await periods()).filter((p) => p.endedAt == null)).toHaveLength(1);
  });
});
