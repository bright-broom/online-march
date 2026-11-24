import { describe, expect, it, vi } from "vitest";
import { lookupPostalCode, normalizePostalCode } from "../postal-code";

/** 郵便番号から住所を引く（お届け先の入力の手間を減らす）。引けないときは何もしないで手入力に任せる */
const ok = (results: unknown) => vi.fn(async () => new Response(JSON.stringify({ status: 200, results }), { status: 200 })) as unknown as typeof fetch;

describe("郵便番号から住所", () => {
  it("ハイフン・全角・空白があっても7桁にそろえる。7桁でなければ問い合わせない", async () => {
    expect(normalizePostalCode("154-0015")).toBe("1540015");
    expect(normalizePostalCode("１５４ー００１５")).toBe("1540015");
    expect(normalizePostalCode("15400")).toBeNull();
    const f = ok([]);
    expect(await lookupPostalCode("12345", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("都道府県・市区町村・町域を返す", async () => {
    const f = ok([{ address1: "東京都", address2: "世田谷区", address3: "桜新町" }]);
    expect(await lookupPostalCode("154-0015", f)).toEqual({ prefecture: "東京都", city: "世田谷区", town: "桜新町" });
    expect(String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain("zipcode=1540015");
  });

  it("同じ番号は2回目から問い合わせない", async () => {
    const f = ok([{ address1: "兵庫県", address2: "南あわじ市", address3: "福良甲" }]);
    await lookupPostalCode("656-0501", f);
    await lookupPostalCode("6560501", f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("見つからない・知らない都道府県名・通信の失敗は null（画面は手入力のまま）", async () => {
    expect(await lookupPostalCode("0000001", ok(null))).toBeNull();
    expect(await lookupPostalCode("0000002", ok([{ address1: "どこか", address2: "x", address3: "y" }]))).toBeNull();
    const down = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await lookupPostalCode("0000003", down)).toBeNull();
    const err = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await lookupPostalCode("0000004", err)).toBeNull();
  });
});
