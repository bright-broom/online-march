import { eq, inArray } from "drizzle-orm";
import iconv from "iconv-lite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 運営向け会計CSV（#21）。月（JST の注文日）で切った出荷単位ごとの明細と、生産者別・全体の集計。
 * 全生産者の売上が入るので運営（二段階認証済み）だけが取れ、取ったことは操作記録に残る。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { GET } = await import("@/app/api/admin/accounting/route");
const { buildAccountingCsv } = await import("../accounting-csv");

const MONTH = "2031-03";
const at = (iso: string) => new Date(iso);
/** すべて "…" で囲って出しているので、行を "," で分ければ列になる */
const parse = (text: string) =>
  text
    .replace(/^﻿/, "")
    .trimEnd()
    .split("\r\n")
    .map((l) => (l ? l.slice(1, -1).split('","').map((c) => c.replaceAll('""', '"')) : []));
const get = (qs: string) => GET(new NextRequest(`http://localhost/api/admin/accounting?${qs}`));
const signIn = async (email: string, role: Role, twoFactorEnabled = true) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled };
  return u;
};

let inMonth: string[] = [];
let outOfMonth: string[] = [];
let pendingCode = "";

beforeAll(async () => {
  const fos = await db.select().from(s.farmOrders).where(inArray(s.farmOrders.status, ["delivered", "refunded", "cancelled", "paid"])).limit(5);
  expect(fos).toHaveLength(5);
  const dates = [
    at("2031-03-01T00:10:00+09:00"), // 月初（UTC ではまだ2月）→ 入る
    at("2031-03-31T23:59:00+09:00"), // 月末 → 入る
    at("2031-02-28T23:50:00+09:00"), // 前月 → 入らない
    at("2031-04-01T00:00:00+09:00"), // 翌月 → 入らない
    at("2031-03-15T12:00:00+09:00"), // 未決済にする → 入らない
  ];
  for (const [i, fo] of fos.entries()) await db.update(s.farmOrders).set({ createdAt: dates[i] }).where(eq(s.farmOrders.id, fo.id));
  await db.update(s.farmOrders).set({ status: "pending_payment" }).where(eq(s.farmOrders.id, fos[4].id));
  inMonth = [fos[0].code, fos[1].code];
  outOfMonth = [fos[2].code, fos[3].code];
  pendingCode = fos[4].code;
});

describe("だれが取れるか", () => {
  it("お客さま・生産者は 403", async () => {
    await signIn("customer@demo.awaji", "customer");
    expect((await get(`month=${MONTH}`)).status).toBe(403);
    await signIn("farmer@demo.awaji", "farmer");
    expect((await get(`month=${MONTH}`)).status).toBe(403);
  });

  it("二段階認証を設定していない運営も 403", async () => {
    currentUser = { id: "admin-no-2fa", name: "運営", email: "ops@awaji-onion.jp", image: null, role: "admin", twoFactorEnabled: false };
    expect((await get(`month=${MONTH}`)).status).toBe(403);
  });

  it("月の形が違えば 400", async () => {
    await signIn("admin@demo.awaji", "admin");
    expect((await get("month=2031-13")).status).toBe(400);
    expect((await get("month=")).status).toBe(400);
  });
});

describe("中身", () => {
  it("注文日（JST）でその月の分だけ。未決済は入らない。UTF-8 は BOM 付き", async () => {
    const admin = await signIn("admin@demo.awaji", "admin");
    const res = await get(`month=${MONTH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(`accounting-${MONTH}.csv`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parse(new TextDecoder().decode(bytes));

    const codes = rows.map((r) => r[2]);
    for (const c of inMonth) expect(codes).toContain(c);
    for (const c of [...outOfMonth, pendingCode]) expect(codes).not.toContain(c);

    const log = await db.query.adminAuditLogs.findFirst({ where: eq(s.adminAuditLogs.action, "accounting.export") });
    expect(log).toMatchObject({ actorId: admin.id, detail: { month: MONTH, rows: 2 } });
  });

  it("明細の金額を足すと、生産者別の集計と合計に一致する", async () => {
    await signIn("admin@demo.awaji", "admin");
    const rows = parse(await (await get(`month=${MONTH}`)).text());
    const detailStart = rows.findIndex((r) => r[0] === "注文日") + 1;
    const detail = rows.slice(detailStart, rows.findIndex((r, i) => i > detailStart && r.length === 0));
    const summaryStart = rows.findIndex((r) => r[0] === "生産者") + 1;
    const summary = rows.slice(summaryStart);
    const total = summary.at(-1)!;
    expect(total[0]).toBe("合計");

    const n = (v: string) => Number(v);
    // 明細: 商品代金6 送料7 割引8 支払額9 手数料10 受取額11 返金12 → 集計: 2..8
    for (const [d, sIdx] of [[6, 2], [7, 3], [8, 4], [9, 5], [10, 6], [11, 7], [12, 8]] as const) {
      const sum = detail.reduce((a, r) => a + n(r[d]), 0);
      expect(n(total[sIdx]), `col ${d}`).toBe(sum);
      expect(summary.slice(0, -1).reduce((a, r) => a + n(r[sIdx]), 0)).toBe(sum);
    }
    for (const r of detail) expect(n(r[9])).toBe(n(r[6]) + n(r[7]) - n(r[8]));
    expect(n(total[1])).toBe(detail.length);
  });

  it("生産者名のカンマ・引用符を壊さない。Shift_JIS も選べる", () => {
    const row = {
      orderedAt: at("2031-03-02T10:00:00+09:00"), orderCode: "AM-1", farmOrderCode: "AM-1-1", farmName: '阿波"農園", 本店', status: "delivered" as const,
      paymentMethod: "card", subtotal: 3000, shippingFee: 800, discount: 300, commission: 300, payoutAmount: 3500, refundAmount: null, refundedAt: null,
      payoutScheduledFor: "2031-04-15", payoutPaidAt: null,
    };
    const csv = buildAccountingCsv([row], { month: MONTH, encoding: "sjis" });
    const text = iconv.decode(csv.body, "Shift_JIS");
    expect(text).toContain('"阿波""農園"", 本店"');
    expect(csv.contentType).toContain("Shift_JIS");
    expect(parse(text).find((r) => r[2] === "AM-1-1")![9]).toBe("3500");
  });
});
