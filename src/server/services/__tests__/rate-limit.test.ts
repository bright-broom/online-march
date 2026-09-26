import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * アプリ側の回数制限（#21）。アップロード・メッセージ・レビュー・使えないクーポンの入力を、本人ごとに数えて止める。
 * Vercel では関数ごとにメモリが分かれるので DB で数え、同時に来ても数え漏れないこと。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("node:fs/promises", () => ({ writeFile: vi.fn(async () => {}), mkdir: vi.fn(async () => {}) }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { rateLimits } = await import("@/config/rate-limits");
const { consumeRateLimit, isRateLimited } = await import("../rate-limit");
const { sendMessage } = await import("@/server/actions/messages");
const { getCheckoutQuote } = await import("@/server/actions/checkout");
const { POST: upload } = await import("@/app/api/upload/route");

const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};
/** 上限まで使い切った状態を作る */
const exhaust = (name: keyof typeof rateLimits, userId: string) =>
  db
    .insert(s.rateLimit)
    .values({ id: `app:${name}:${userId}`, key: `app:${name}:${userId}`, count: rateLimits[name].max, lastRequest: Date.now() })
    .onConflictDoUpdate({ target: s.rateLimit.id, set: { count: rateLimits[name].max, lastRequest: Date.now() } });

beforeEach(async () => {
  await db.delete(s.rateLimit);
});

describe("回数の数え方", () => {
  it("上限まで通し、超えたら止め、窓が過ぎたら戻る", async () => {
    const { max, windowSec } = rateLimits.message;
    const t0 = Date.now();
    for (let i = 0; i < max; i++) expect(await consumeRateLimit("message", "u-a", t0)).toBe(true);
    expect(await consumeRateLimit("message", "u-a", t0)).toBe(false);
    expect(await isRateLimited("message", "u-a", t0)).toBe(true);

    expect(await consumeRateLimit("message", "u-b", t0)).toBe(true); // 人ごとに別
    expect(await consumeRateLimit("message", "u-a", t0 + windowSec * 1000 + 1)).toBe(true);
  });

  // テストの PGlite はクエリを1本ずつ処理するので、本当の同時実行（数え漏れ）はここでは再現できない。
  // 数え漏れを防いでいるのは consumeRateLimit が1回の upsert で数える作りそのもの（読んでから書くと Neon では漏れうる）。
  it("まとめて呼んでも、通すのは上限の数だけ", async () => {
    const { max } = rateLimits.review;
    const results = await Promise.all(Array.from({ length: max + 5 }, () => consumeRateLimit("review", "u-race")));
    expect(results.filter(Boolean)).toHaveLength(max);
  });

  it("Better Auth の行と混ざらない（id が app: で始まる）", async () => {
    await consumeRateLimit("upload", "u-x");
    const rows = await db.select().from(s.rateLimit);
    expect(rows.map((r) => r.id)).toEqual(["app:upload:u-x"]);
  });
});

describe("各操作での制限", () => {
  it("メッセージ: 上限を超えると送れない", async () => {
    const me = await signIn("customer@demo.awaji", "customer");
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.status, "active") }))!;
    await exhaust("message", me.id);

    const res = await sendMessage({ farmId: farm.id, body: "こんにちは" });

    expect(res).toMatchObject({ ok: false, error: rateLimits.message.message });
  });

  it("レビュー: 上限を超えると投稿・編集できない", async () => {
    const { updateReview } = await import("@/server/actions/reviews");
    const me = await signIn("customer@demo.awaji", "customer");
    const review = (await db.query.reviews.findFirst())!;
    await exhaust("review", me.id);
    const fd = new FormData();
    for (const [k, v] of Object.entries({ reviewId: review.id, rating: "5", title: "とても甘い", body: "期待どおりの甘さでした。また買います。" })) fd.set(k, v);

    expect(await updateReview(null, fd)).toMatchObject({ ok: false, error: rateLimits.review.message });
  });

  it("アップロード: 上限を超えると 429", async () => {
    const me = await signIn("farmer@demo.awaji", "farmer");
    await exhaust("upload", me.id);
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" }));
    form.set("folder", "products");

    const res = await upload(new Request("http://localhost/api/upload", { method: "POST", body: form }));

    expect(res.status).toBe(429);
  });

  it("クーポン: 使えないコードだけを数え、上限を超えたら正しいコードも受け付けない（見積もりは返す）", async () => {
    const me = await signIn("customer@demo.awaji", "customer");
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
    await db.delete(s.coupons).where(eq(s.coupons.code, "RL-OK"));
    await db.insert(s.coupons).values({ code: "RL-OK", description: "テスト", type: "fixed", value: 100, minSubtotal: 0, isActive: true });
    const quote = (couponCode: string) => getCheckoutQuote({ lines: [{ variantId: product.variants[0].id, quantity: 1 }], prefecture: "大阪府", couponCode });

    const ok = await quote("RL-OK");
    expect(ok.ok && ok.data.coupon?.code).toBe("RL-OK");
    expect(await isRateLimited("couponMiss", me.id)).toBe(false);
    for (let i = 0; i < rateLimits.couponMiss.max; i++) await quote(`NOPE-${i}`);

    const blocked = await quote("RL-OK");
    expect(blocked.ok).toBe(true);
    expect(blocked.ok && blocked.data.coupon).toBeNull();
    expect(blocked.ok && blocked.data.couponError).toBe(rateLimits.couponMiss.message);
  });
});
