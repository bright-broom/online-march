import "server-only";
import iconv from "iconv-lite";
import { paymentMethodLabel } from "@/config/payments";
import { farmOrderStatusMeta } from "@/config/status";
import type { FarmOrderStatus } from "@/db/schema";
import { toYmd } from "@/lib/dates";

/**
 * 運営向け会計CSV（#21）。月ごとに、1出荷単位ずつの明細と、生産者別・全体の集計を1つのファイルにする。
 * 勘定科目への割り当てはしない（会計ソフト・税理士ごとに違うので、ここでは金額の事実だけを並べる）。
 * 金額はすべて円（整数）。クーポン割引は運営の負担で、生産者の受取額は減らない（docs/PAYMENTS.md）。
 */
export type AccountingRow = {
  orderedAt: Date;
  orderCode: string;
  farmOrderCode: string;
  farmName: string;
  status: FarmOrderStatus;
  paymentMethod: string | null;
  subtotal: number;
  shippingFee: number;
  discount: number;
  commission: number;
  payoutAmount: number;
  refundAmount: number | null;
  refundedAt: Date | null;
  payoutScheduledFor: string | null;
  payoutPaidAt: Date | null;
};

const q = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const ymd = (d: Date | null) => (d ? toYmd(d) : "");

/** お客さまが払った額（商品代金＋送料−クーポン割引） */
export const paidByCustomer = (r: Pick<AccountingRow, "subtotal" | "shippingFee" | "discount">) => r.subtotal + r.shippingFee - r.discount;

const detailHeader = [
  "注文日", "注文番号", "出荷単位番号", "生産者", "状態", "決済手段",
  "商品代金", "送料", "クーポン割引（運営負担）", "お客さま支払額", "販売手数料（運営の収入）", "生産者受取額",
  "返金額", "返金日", "精算予定日", "入金日",
];

const detail = (r: AccountingRow) => [
  toYmd(r.orderedAt), r.orderCode, r.farmOrderCode, r.farmName, farmOrderStatusMeta[r.status].label, paymentMethodLabel(r.paymentMethod) ?? "",
  r.subtotal, r.shippingFee, r.discount, paidByCustomer(r), r.commission, r.payoutAmount,
  r.refundAmount ?? 0, ymd(r.refundedAt), r.payoutScheduledFor ?? "", ymd(r.payoutPaidAt),
];

const summaryHeader = ["生産者", "件数", "商品代金", "送料", "クーポン割引（運営負担）", "お客さま支払額", "販売手数料（運営の収入）", "生産者受取額", "返金額"];

function summarize(name: string, rows: AccountingRow[]) {
  const sum = (pick: (r: AccountingRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
  return [
    name, rows.length,
    sum((r) => r.subtotal), sum((r) => r.shippingFee), sum((r) => r.discount), sum(paidByCustomer),
    sum((r) => r.commission), sum((r) => r.payoutAmount), sum((r) => r.refundAmount ?? 0),
  ];
}

/** 既定は UTF-8（BOM 付き。Excel でも文字化けしない）。古い会計ソフト向けに Shift_JIS も選べる。 */
export function buildAccountingCsv(rows: AccountingRow[], p: { month: string; encoding?: "utf8" | "sjis" }) {
  const encoding = p.encoding ?? "utf8";
  const byFarm = new Map<string, AccountingRow[]>();
  for (const r of rows) byFarm.set(r.farmName, [...(byFarm.get(r.farmName) ?? []), r]);
  const farmNames = [...byFarm.keys()].sort((a, b) => a.localeCompare(b, "ja"));

  const table: unknown[][] = [
    [`${p.month} の明細`],
    detailHeader,
    ...rows.map(detail),
    [],
    [`${p.month} の生産者別集計`],
    summaryHeader,
    ...farmNames.map((n) => summarize(n, byFarm.get(n)!)),
    summarize("合計", rows),
  ];
  const text = table.map((cols) => cols.map(q).join(",")).join("\r\n") + "\r\n";
  return {
    body: encoding === "sjis" ? iconv.encode(text, "Shift_JIS") : Buffer.from("﻿" + text, "utf8"),
    filename: `accounting-${p.month}.csv`,
    contentType: `text/csv; charset=${encoding === "sjis" ? "Shift_JIS" : "UTF-8"}`,
  };
}
