import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Stripe を使わない農家の振込先口座（#20）。生産者が自分で登録し、運営は振込のときだけ全桁を見る。
 * 口座番号は DB にも画面の一覧にも平文で出さない。全桁を見た運営の操作は記録に残る。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { saveFarmBankAccount } = await import("../farmer-shop");
const { revealFarmBankAccount } = await import("../admin-ops");
const { decryptAccountNumber, encryptAccountNumber } = await import("@/server/services/bank-account");
const { getAdminPayouts } = await import("@/server/queries/admin");
const { toYmd } = await import("@/lib/dates");

const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const valid = { bankName: "淡路信用金庫", bankCode: "１２３４", branchName: "南あわじ支店", branchCode: "567", accountType: "ordinary", accountNumber: "98765", holderKana: "ｱﾜｼﾞ ﾀﾛｳ" };

let farmId = "";
beforeAll(async () => {
  const owner = (await db.query.user.findFirst({ where: eq(s.user.email, "farmer@demo.awaji") }))!;
  farmId = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, owner.id) }))!.id;
});

describe("振込先口座", () => {
  it("暗号化は毎回ちがう文字列になり、改ざんされたら読めない", () => {
    const a = encryptAccountNumber("0098765");
    expect(a).not.toContain("0098765");
    expect(encryptAccountNumber("0098765")).not.toBe(a);
    expect(decryptAccountNumber(a)).toBe("0098765");
    const [v, iv, tag, ct] = a.split(":");
    const tampered = [v, iv, tag, Buffer.from("x" + Buffer.from(ct, "base64").toString("latin1"), "latin1").toString("base64")].join(":");
    expect(() => decryptAccountNumber(tampered)).toThrow();
  });

  it("生産者が登録すると、全角・半角をそろえ、口座番号は7桁にして暗号化して保存する", async () => {
    await signIn("farmer@demo.awaji", "farmer");

    const res = await saveFarmBankAccount(null, form(valid));

    expect(res).toMatchObject({ ok: true, data: { last4: "8765" } });
    const row = (await db.query.farmBankAccounts.findFirst({ where: eq(s.farmBankAccounts.farmId, farmId) }))!;
    expect(row).toMatchObject({ bankCode: "1234", branchCode: "567", accountNumberLast4: "8765", holderKana: "アワジ タロウ" });
    expect(JSON.stringify(row)).not.toContain("0098765");
    expect(decryptAccountNumber(row.accountNumberEnc)).toBe("0098765");
  });

  it("形式の違う入力は項目ごとに教える", async () => {
    await signIn("farmer@demo.awaji", "farmer");

    const res = await saveFarmBankAccount(null, form({ ...valid, bankCode: "12", accountNumber: "12345678", holderKana: "awaji taro" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors ?? {})).toEqual(expect.arrayContaining(["bankCode", "accountNumber", "holderKana"]));
  });

  it("購入者は登録できない", async () => {
    await signIn("customer@demo.awaji", "customer");

    expect((await saveFarmBankAccount(null, form(valid))).ok).toBe(false);
  });

  it("運営の精算一覧には下4桁まで。全桁は「表示」したときだけで、その操作が記録に残る", async () => {
    await signIn("farmer@demo.awaji", "farmer");
    await saveFarmBankAccount(null, form(valid));
    await db.update(s.farms).set({ stripeAccountId: null, stripeOnboarded: false }).where(eq(s.farms.id, farmId));
    await db.insert(s.payouts).values({ farmId, periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 3000, shippingFees: 0, commission: 0, amount: 3000, orderCount: 1, scheduledFor: toYmd(new Date()) });

    const { list } = await getAdminPayouts(new Date());
    const row = list.find((p) => p.farmId === farmId)!;
    expect(row.bankAccount).toMatchObject({ accountNumberLast4: "8765", holderKana: "アワジ タロウ" });
    expect(JSON.stringify(list)).not.toContain("0098765");
    expect(JSON.stringify(list)).not.toContain("v1:");

    const admin = await signIn("admin@demo.awaji", "admin");
    const res = await revealFarmBankAccount({ farmId });
    expect(res).toMatchObject({ ok: true, data: { accountNumber: "0098765" } });
    const logs = await db.select().from(s.adminAuditLogs).where(eq(s.adminAuditLogs.action, "farm.bank_account_reveal"));
    expect(logs.some((l) => l.actorId === admin.id && l.targetId === farmId)).toBe(true);
  });

  it("運営以外は全桁を見られない", async () => {
    await signIn("farmer@demo.awaji", "farmer");

    const res = await revealFarmBankAccount({ farmId });

    expect(res.ok).toBe(false);
  });
});
