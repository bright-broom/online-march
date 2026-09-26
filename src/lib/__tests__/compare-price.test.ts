import { describe, expect, it } from "vitest";
import { compareAtVerdict, type PricePeriod } from "../compare-price";

/**
 * 「通常価格」を打ち消し表示してよいか（#11）。オーナーの決定: 値下げを始めた時点からさかのぼる8週間の過半を
 * 通常価格で販売していて、最後にその価格で販売してから2週間以内に値下げし、値下げが8週間以内のとき。
 */
const DAY = 86_400_000;
const now = new Date("2026-09-26T03:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const p = (price: number, from: number, to: number | null): PricePeriod => ({ price, startedAt: ago(from), endedAt: to == null ? null : ago(to) });
const verdict = (periods: PricePeriod[], price = 800, compareAt: number | null = 1000) => compareAtVerdict(periods, { price, compareAt }, now);

describe("表示してよい", () => {
  it("値下げ前の8週間ずっと通常価格で販売し、そのまま値下げした", () => {
    expect(verdict([p(1000, 70, 14), p(800, 14, null)])).toEqual({ ok: true, reason: "shown" });
  });

  it("通常価格での販売が4週間を1日でも超えれば表示（ちょうど4週間は表示しない）", () => {
    expect(verdict([p(1000, 43, 14), p(800, 14, null)]).ok).toBe(true); // 29日
    expect(verdict([p(1000, 42, 14), p(800, 14, null)])).toMatchObject({ ok: false, reason: "tooShort" }); // 28日
  });
});

describe("表示しない", () => {
  it("通常価格で販売した記録がない（記録を始める前から値下げしていた商品など）", () => {
    expect(verdict([p(800, 30, null)])).toMatchObject({ ok: false, reason: "noRecord" });
  });

  it("値下げ前の8週間より昔の販売は数えない", () => {
    // 200〜90日前の販売は窓（値下げ開始の56日前〜）の外。窓の中は 30〜20日前の10日だけ
    expect(verdict([p(1000, 200, 90), p(1000, 30, 20), p(800, 14, null)])).toMatchObject({ ok: false, reason: "tooShort" });
  });

  it("通常価格で最後に販売してから2週間より後に値下げした（ちょうど2週間までは表示）", () => {
    expect(verdict([p(1000, 90, 30), p(800, 16, null)]).ok).toBe(true); // 間が14日
    expect(verdict([p(1000, 90, 31), p(800, 16, null)])).toMatchObject({ ok: false, reason: "gapTooLong" }); // 15日
    expect(verdict([p(1000, 72, 30), p(800, 30, null)]).ok).toBe(true); // 間なし
  });

  it("値下げが8週間を超えて続いている（ちょうど8週間までは表示）", () => {
    expect(verdict([p(1000, 150, 56), p(800, 56, null)]).ok).toBe(true);
    expect(verdict([p(1000, 150, 57), p(800, 57, null)])).toMatchObject({ ok: false, reason: "saleTooLong" });
  });

  it("非公開をはさんで公開し直しても、値下げの始まりは最初の値下げのまま（8週間の上限を逃れられない）", () => {
    expect(verdict([p(1000, 150, 70), p(800, 70, 10), p(800, 5, null)])).toMatchObject({ ok: false, reason: "saleTooLong" });
  });

  it("値下げ中に価格を変えても、値下げの始まりは動かない", () => {
    expect(verdict([p(1000, 150, 60), p(900, 60, 30), p(800, 30, null)], 800)).toMatchObject({ ok: false, reason: "saleTooLong" });
  });

  it("公開していない・今の価格と記録が合わない・通常価格が販売価格以下", () => {
    expect(verdict([p(1000, 70, 14), p(800, 14, 1)])).toMatchObject({ ok: false, reason: "notListed" });
    expect(verdict([p(1000, 70, 14), p(700, 14, null)])).toMatchObject({ ok: false, reason: "notListed" });
    expect(verdict([p(1000, 70, 14), p(800, 14, null)], 800, 800).ok).toBe(false);
    expect(verdict([p(1000, 70, 14), p(800, 14, null)], 800, null).ok).toBe(false);
  });
});
