import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

let currentUser: { id: string; name: string; email: string; image: null; role: "farmer"; twoFactorEnabled: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { saveProduct } = await import("../farmer-products");
const { createOrder } = await import("@/server/services/orders");

let product: typeof s.products.$inferSelect & { variants: (typeof s.productVariants.$inferSelect)[]; images: (typeof s.productImages.$inferSelect)[] };

/** 編集画面が送るのと同じ形のフォーム。stockBase = 画面を開いた時点の在庫 */
function editForm(variant: { stock: number; stockBase?: number }) {
  const v = product.variants[0];
  const form = new FormData();
  form.set("id", product.id);
  form.set("name", product.name);
  form.set("category", product.category);
  form.set("variety", product.variety ?? "");
  form.set("summary", product.summary);
  form.set("description", product.description);
  form.set("cultivation", product.cultivation);
  form.set("status", product.status);
  form.set("highlights", JSON.stringify(product.highlights ?? []));
  form.set("images", JSON.stringify(product.images.map((i) => ({ url: i.url, alt: i.alt }))));
  form.set(
    "variants",
    JSON.stringify([
      { id: v.id, label: v.label, weightGrams: v.weightGrams, price: v.price, compareAtPrice: v.compareAtPrice, sku: v.sku ?? "", ...variant },
      ...product.variants.slice(1).map((o) => ({ id: o.id, label: o.label, weightGrams: o.weightGrams, price: o.price, compareAtPrice: o.compareAtPrice, stock: o.stock, stockBase: o.stock, sku: o.sku ?? "" })),
    ]),
  );
  return form;
}
const stockNow = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, product.variants[0].id) }))!.stock;
const setStock = (n: number) => db.update(s.productVariants).set({ stock: n }).where(eq(s.productVariants.id, product.variants[0].id));
/** 編集画面を開いている間に、お客さまが買う */
async function sell(quantity: number) {
  const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  const address = { recipientName: "在庫 テスト", postalCode: "6560000", prefecture: "兵庫県", city: "南あわじ市", line1: "1", phone: "0799000000" };
  await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId: product.variants[0].id, quantity }], address, paymentProvider: "demo", now: new Date() });
}

beforeAll(async () => {
  const farmer = (await db.query.user.findFirst({ where: eq(s.user.email, "farmer@demo.awaji") }))!;
  currentUser = { id: farmer.id, name: farmer.name, email: farmer.email, image: null, role: "farmer", twoFactorEnabled: false };
  const farm = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, farmer.id) }))!;
  product = (await db.query.products.findFirst({
    where: and(eq(s.products.farmId, farm.id), eq(s.products.status, "active")),
    with: { variants: { orderBy: asc(s.productVariants.sortOrder) }, images: true },
  }))!;
});

describe("商品編集の在庫", () => {
  it("編集中に売れた分は、保存しても在庫に戻らない（売り越さない）", async () => {
    await setStock(10);
    // 在庫10で編集画面を開く → その間に3個売れる → 在庫はそのままで保存
    await sell(3);
    expect(await stockNow()).toBe(7);
    const res = await saveProduct(null, editForm({ stock: 10, stockBase: 10 }));
    expect(res.ok).toBe(true);
    expect(await stockNow()).toBe(7);
  });

  it("入荷で増やした分は、売れた分を引いたうえで足される", async () => {
    await setStock(10);
    await sell(3);
    // 画面では 10 → 20（10個入荷）。実際の在庫は 7 + 10 = 17
    await saveProduct(null, editForm({ stock: 20, stockBase: 10 }));
    expect(await stockNow()).toBe(17);
  });

  it("0にして販売を止めたときは、マイナスにならず0になる", async () => {
    await setStock(10);
    await sell(3);
    await saveProduct(null, editForm({ stock: 0, stockBase: 10 }));
    expect(await stockNow()).toBe(0);
  });

  it("開いた時点の在庫を持たない古いフォームは、従来どおり入力値で上書きする", async () => {
    await setStock(10);
    await saveProduct(null, editForm({ stock: 4 }));
    expect(await stockNow()).toBe(4);
  });

  it("編集画面は開いた時点の在庫を一緒に送る（既存の規格だけ）", async () => {
    const { toVariantRows, serializeVariants } = await import("@/components/farmer/products/variants-editor");
    const rows = toVariantRows([
      { id: "11111111-1111-4111-8111-111111111111", label: "5kg", weightGrams: 5000, price: 2980, compareAtPrice: null, stock: 10, sku: "" },
    ]);
    rows[0] = { ...rows[0], stock: "20" }; // 画面で在庫を書き換える
    rows.push({ ...rows[0], key: "new", id: undefined, stockBase: undefined });
    const [existing, added] = serializeVariants(rows);
    expect(existing).toMatchObject({ stock: 20, stockBase: 10 });
    expect(added.stockBase).toBeUndefined();
  });
});

