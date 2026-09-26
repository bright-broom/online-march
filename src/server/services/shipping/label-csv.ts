import "server-only";
import iconv from "iconv-lite";
import { carriers, deliveryTimeSlots, shippingPolicy, type DeliveryTimeSlot } from "@/config/shipping";
import type { AddressSnapshot, Carrier, Farm } from "@/db/schema";
import { toYmd } from "@/lib/dates";
import { looksLikePhoneNumber, normalizeTrackingNumber, trackingNumberPattern } from "@/lib/shipping";

export type LabelRow = {
  code: string;
  carrier: Carrier;
  shipDate: string; // YYYY-MM-DD
  deliveryDate: string | null;
  timeSlot: string | null;
  boxCount: number;
  to: AddressSnapshot;
  from: Pick<Farm, "name" | "phone" | "postalCode" | "prefecture" | "city" | "addressLine">;
  itemName: string;
};

const q = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const ymdSlash = (d: string | null) => (d ? d.replaceAll("-", "/") : "");
const zip = (z: string) => z.replace(/[^\d]/g, "");
const slot = (s: string | null, c: Carrier) => (s ? deliveryTimeSlots[s as DeliveryTimeSlot]?.[c] ?? "" : "");

/**
 * Column layouts follow each carrier's import spec (主要項目のみ).
 * Adjust mapping in the carrier's label software once ("取込パターン") and reuse.
 */
const layouts: Record<(typeof carriers)[Carrier]["csvFormat"], { header: string[]; row: (r: LabelRow) => unknown[] }> = {
  yamato_b2: {
    header: ["お客様管理番号", "送り状種類", "クール区分", "出荷予定日", "お届け予定日", "配達時間帯", "お届け先電話番号", "お届け先郵便番号", "お届け先住所", "お届け先アパートマンション名", "お届け先名", "敬称", "ご依頼主電話番号", "ご依頼主郵便番号", "ご依頼主住所", "ご依頼主名", "品名１", "荷扱い１", "荷扱い２", "個数口枠の印字", "記事"],
    row: (r) => ["" + r.code, "0", "0", ymdSlash(r.shipDate), ymdSlash(r.deliveryDate), slot(r.timeSlot, "yamato"), r.to.phone, zip(r.to.postalCode), `${r.to.prefecture}${r.to.city}${r.to.line1}`, r.to.line2 ?? "", r.to.recipientName, "様", r.from.phone, zip(r.from.postalCode), `${r.from.prefecture}${r.from.city}${r.from.addressLine}`, r.from.name, r.itemName, shippingPolicy.handling[0], shippingPolicy.handling[1], r.boxCount > 1 ? "1" : "", r.code],
  },
  japanpost_yupri: {
    header: ["お客様側管理番号", "発送予定日", "お届け先 郵便番号", "お届け先 住所1", "お届け先 住所2", "お届け先 名称", "お届け先 敬称", "お届け先 電話番号", "ご依頼主 郵便番号", "ご依頼主 住所1", "ご依頼主 名称", "ご依頼主 電話番号", "品名", "個数", "配達希望日", "配達希望時間帯", "ワレモノ指定", "ナマモノ指定"],
    row: (r) => [r.code, ymdSlash(r.shipDate), zip(r.to.postalCode), `${r.to.prefecture}${r.to.city}${r.to.line1}`, r.to.line2 ?? "", r.to.recipientName, "様", r.to.phone, zip(r.from.postalCode), `${r.from.prefecture}${r.from.city}${r.from.addressLine}`, r.from.name, r.from.phone, r.itemName, r.boxCount, ymdSlash(r.deliveryDate), slot(r.timeSlot, "japanpost"), "0", "1"],
  },
  sagawa_ehiden: {
    header: ["お客様管理番号", "お届け先電話番号", "お届け先郵便番号", "お届け先住所１", "お届け先住所２", "お届け先名称１", "ご依頼主電話番号", "ご依頼主郵便番号", "ご依頼主住所１", "ご依頼主名称１", "品名１", "出荷個数", "配達日", "配達指定時間帯", "出荷日"],
    row: (r) => [r.code, r.to.phone, zip(r.to.postalCode), `${r.to.prefecture}${r.to.city}${r.to.line1}`, r.to.line2 ?? "", r.to.recipientName, r.from.phone, zip(r.from.postalCode), `${r.from.prefecture}${r.from.city}${r.from.addressLine}`, r.from.name, r.itemName, r.boxCount, ymdSlash(r.deliveryDate), slot(r.timeSlot, "sagawa"), ymdSlash(r.shipDate)],
  },
};

/** Build a carrier import CSV. Default encoding Shift_JIS (what B2/ゆうプリR/e飛伝 expect). */
export function buildLabelCsv(carrier: Carrier, rows: LabelRow[], encoding: "sjis" | "utf8" = "sjis") {
  const layout = layouts[carriers[carrier].csvFormat];
  const text = [layout.header, ...rows.map(layout.row)].map((cols) => cols.map(q).join(",")).join("\r\n") + "\r\n";
  const body = encoding === "sjis" ? iconv.encode(text, "Shift_JIS") : Buffer.from("﻿" + text, "utf8");
  return { body, filename: `${carrier}-labels-${toYmd(new Date())}.csv`, contentType: `text/csv; charset=${encoding === "sjis" ? "Shift_JIS" : "UTF-8"}` };
}

/** 追跡番号の列の見出し（B2クラウド・ゆうプリR・e飛伝の書き出しと、手作りの CSV でよく使う名前） */
const TRACKING_HEADER = /伝票番号|追跡番号|問い?合わ?せ(伝票)?番号|送り状番号|荷物番号/;
const ORDER_CODE = /AM-\d{6}-[0-9A-Z]{4}-\d+/;

/** 1行を列に分ける（"…" の中のカンマ・"" を扱う最小限の CSV 分割） */
function cellsOf(line: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\t")) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((v) => v.trim());
}

/**
 * Parse a tracking-number CSV exported from the carrier software (or hand-made).
 * 各行から注文番号（AM-XXXXXX-XXXX-N）と追跡番号を拾う。追跡番号は、見出し行に「伝票番号」などの列があればその列だけを読む。
 * 見出しが無いときは、数字 10〜14 桁の列のうち電話番号の形（0 始まり 10〜11 桁）を除いた最初のものを使う（お届け先の電話番号を取り違えないため, #21）。
 * どちらも決まり（lib/shipping.ts#trackingNumberPattern）に合うものだけ。
 */
export function parseTrackingCsv(input: Buffer | string): { code: string; trackingNumber: string }[] {
  const utf8 = typeof input === "string" ? input : input.toString("utf8");
  const text = typeof input !== "string" && utf8.includes("�") ? iconv.decode(input, "Shift_JIS") : utf8;
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map(cellsOf);
  const header = rows.find((r) => r.some((c) => TRACKING_HEADER.test(c)) && !r.some((c) => ORDER_CODE.test(c)));
  const column = header ? header.findIndex((c) => TRACKING_HEADER.test(c)) : -1;
  const out: { code: string; trackingNumber: string }[] = [];
  for (const cells of rows) {
    const code = cells.join(",").match(ORDER_CODE)?.[0];
    if (!code) continue;
    const candidates = column >= 0 ? [cells[column] ?? ""] : cells.filter((c) => !ORDER_CODE.test(c) && /^\d{10,14}$/.test(normalizeTrackingNumber(c)) && !looksLikePhoneNumber(c));
    const tracking = candidates.map(normalizeTrackingNumber).find((c) => trackingNumberPattern.test(c));
    if (tracking) out.push({ code, trackingNumber: tracking });
  }
  return out;
}

export const defaultItemName = shippingPolicy.itemName;
