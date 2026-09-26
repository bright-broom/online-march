import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";

/**
 * 追跡番号（#21）。生産者の手入力・CSV取込・運営の入力で決まりが1つであること。
 * CSV取込では、同じ行にあるお届け先の電話番号を追跡番号と取り違えないこと（取り違えると、お客さまに届く発送メールの
 * 「荷物を追跡する」が他人の番号になり、配達完了の自動判定も狂う）。
 */
const { parseTrackingCsv } = await import("../shipping/label-csv");
const { isTrackingNumber, looksLikePhoneNumber, normalizeTrackingNumber } = await import("@/lib/shipping");
const { trackingNumberSchema } = await import("@/lib/validators/farmer");
const { adminTransitionSchema } = await import("@/lib/validators/admin");

const code = "AM-260926-AB12-1";
const code2 = "AM-260926-CD34-2";

describe("追跡番号の決まり", () => {
  it("全角・空白・ハイフンをそろえ、英数字8〜20桁だけを通す", () => {
    expect(normalizeTrackingNumber("４１２３－４５６７ ８９０１")).toBe("412345678901");
    expect(isTrackingNumber("4123-4567-8901")).toBe(true);
    expect(isTrackingNumber("1234567")).toBe(false);
    expect(isTrackingNumber("123456789012345678901")).toBe(false);
    expect(isTrackingNumber("4123/4567")).toBe(false);
  });

  it("生産者の入力と運営の入力で同じ決まり（運営は空なら既存の番号のまま）", () => {
    expect(trackingNumberSchema.parse("４１２３-４５６７-８９０１")).toBe("412345678901");
    expect(trackingNumberSchema.safeParse("123").success).toBe(false);
    const admin = (trackingNumber: string) => adminTransitionSchema.safeParse({ farmOrderId: crypto.randomUUID(), to: "shipped", trackingNumber });
    expect(admin("123").success).toBe(false);
    expect(admin("4123-4567-8901").data?.trackingNumber).toBe("412345678901");
    expect(admin("").data?.trackingNumber).toBeUndefined();
  });

  it("電話番号の形（0 始まり 10〜11 桁）を見分ける", () => {
    expect(looksLikePhoneNumber("090-1234-5678")).toBe(true);
    expect(looksLikePhoneNumber("0799-00-0000")).toBe(true);
    expect(looksLikePhoneNumber("412345678901")).toBe(false);
  });
});

describe("追跡番号CSVの取込", () => {
  it("見出しに「伝票番号」があれば、その列を読む（電話番号が前の列にあっても取り違えない）", () => {
    const csv = [
      "お客様管理番号,お届け先電話番号,お届け先名,伝票番号",
      `${code},090-1234-5678,山田 花子,4123-4567-8901`,
      `"${code2}","06-0000-0000","佐藤, 一郎","412345678902"`,
    ].join("\r\n");

    expect(parseTrackingCsv(csv)).toEqual([
      { code, trackingNumber: "412345678901" },
      { code: code2, trackingNumber: "412345678902" },
    ]);
  });

  it("伝票番号より前に別の長い番号（請求先顧客コードなど）があっても、見出しの列を読む", () => {
    const csv = ["お客様管理番号,請求先顧客コード,伝票番号", `${code},079900000001,412345678901`].join("\r\n");
    expect(parseTrackingCsv(csv)).toEqual([{ code, trackingNumber: "412345678901" }]);
  });

  it("見出しが無いときは、電話番号の形を除いた番号を使う", () => {
    expect(parseTrackingCsv(`${code},09012345678,412345678901`)).toEqual([{ code, trackingNumber: "412345678901" }]);
    expect(parseTrackingCsv(`${code},09012345678`)).toEqual([]); // 電話番号しか無ければ拾わない
  });

  it("伝票番号の列が決まりに合わない行は拾わない", () => {
    const csv = ["管理番号,伝票番号", `${code},未発行`, `${code2},412345678902`].join("\n");
    expect(parseTrackingCsv(csv)).toEqual([{ code: code2, trackingNumber: "412345678902" }]);
  });

  it("配送ソフトが書き出す Shift_JIS のファイルも読める", () => {
    const sjis = iconv.encode(["お問い合わせ番号,お客様管理番号,電話番号", `412345678901,${code},0799000000`].join("\r\n"), "Shift_JIS");
    expect(parseTrackingCsv(sjis)).toEqual([{ code, trackingNumber: "412345678901" }]);
  });
});
