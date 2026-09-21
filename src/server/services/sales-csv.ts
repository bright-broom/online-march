import "server-only";
import iconv from "iconv-lite";
import { farmOrderStatusMeta } from "@/config/status";
import type { FarmOrderStatus } from "@/db/schema";
import { toYmd, type YMD } from "@/lib/dates";

/**
 * 売上明細の書き出し。生産者は確定申告や記帳で「いつ・いくら売れて・手数料がいくらで・受取額がいくらか」を
 * 手元に残す必要がある。画面の集計だけでは税理士にも会計ソフトにも渡せないので CSV にする。
 * 1行 = 1出荷単位（farm_orders）。金額はすべて円（整数）。
 */
export type SalesRow = {
  orderedAt: Date;
  orderCode: string;
  farmOrderCode: string;
  status: FarmOrderStatus;
  prefecture: string;
  items: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  commission: number;
  payoutAmount: number;
  refundedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  payoutScheduledFor: string | null;
  payoutPaidAt: Date | null;
};

const q = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const ymd = (d: Date | null) => (d ? toYmd(d) : "");

const header = [
  "注文日", "注文番号", "出荷単位番号", "状態", "お届け先（都道府県）", "商品",
  "商品代金", "送料", "クーポン割引", "販売手数料", "受取額",
  "返金日", "発送日", "配達日", "精算予定日", "入金日",
];

const line = (r: SalesRow) => [
  toYmd(r.orderedAt), r.orderCode, r.farmOrderCode, farmOrderStatusMeta[r.status].label, r.prefecture, r.items,
  r.subtotal, r.shippingFee, r.discount, -r.commission, r.payoutAmount,
  ymd(r.refundedAt), ymd(r.shippedAt), ymd(r.deliveredAt), r.payoutScheduledFor ?? "", ymd(r.payoutPaidAt),
];

/** 合計行。会計ソフトに取り込む前に、金額が合っているかを農家さん自身が確かめられるように付ける。 */
const totals = (rows: SalesRow[]) => {
  const sum = (pick: (r: SalesRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
  return ["合計", "", "", `${rows.length}件`, "", "",
    sum((r) => r.subtotal), sum((r) => r.shippingFee), sum((r) => r.discount), -sum((r) => r.commission), sum((r) => r.payoutAmount),
    "", "", "", "", ""];
};

/** Excel（日本語版）は Shift_JIS が安全。UTF-8 は BOM 付きで出す。 */
export function buildSalesCsv(rows: SalesRow[], p: { from: YMD; to: YMD; farmName: string; encoding?: "sjis" | "utf8" }) {
  const encoding = p.encoding ?? "sjis";
  const table = [header, ...rows.map(line), ...(rows.length ? [totals(rows)] : [])];
  const text = table.map((cols) => cols.map(q).join(",")).join("\r\n") + "\r\n";
  return {
    body: encoding === "sjis" ? iconv.encode(text, "Shift_JIS") : Buffer.from("﻿" + text, "utf8"),
    filename: `sales-${p.from}_${p.to}.csv`,
    contentType: `text/csv; charset=${encoding === "sjis" ? "Shift_JIS" : "UTF-8"}`,
  };
}
