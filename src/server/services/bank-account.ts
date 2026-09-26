import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farmBankAccounts } from "@/db/schema";
import { env } from "@/lib/env";
import type { bankAccountSchema } from "@/lib/validators/bank-account";
import type { z } from "zod";

/**
 * 振込先口座（#20）。口座番号は AES-256-GCM で暗号化して保存する。鍵は BETTER_AUTH_SECRET から口座用に導出するので、
 * その秘密を変えると復号できなくなる（生産者に登録し直してもらう）。表示は下4桁だけ（getMaskedBankAccount）。
 */
const key = () => createHash("sha256").update(`farm-bank-account:v1:${env.BETTER_AUTH_SECRET}`).digest();

export function encryptAccountNumber(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptAccountNumber(stored: string) {
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown bank account format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** 画面に出してよい形（口座番号は下4桁だけ） */
export const maskedColumns = {
  bankName: farmBankAccounts.bankName,
  bankCode: farmBankAccounts.bankCode,
  branchName: farmBankAccounts.branchName,
  branchCode: farmBankAccounts.branchCode,
  accountType: farmBankAccounts.accountType,
  accountNumberLast4: farmBankAccounts.accountNumberLast4,
  holderKana: farmBankAccounts.holderKana,
  updatedAt: farmBankAccounts.updatedAt,
};

export async function getMaskedBankAccount(farmId: string) {
  const [row] = await db.select(maskedColumns).from(farmBankAccounts).where(eq(farmBankAccounts.farmId, farmId));
  return row ?? null;
}
export type MaskedBankAccount = NonNullable<Awaited<ReturnType<typeof getMaskedBankAccount>>>;

export async function saveBankAccount(farmId: string, input: z.output<typeof bankAccountSchema>) {
  const values = {
    bankName: input.bankName,
    bankCode: input.bankCode,
    branchName: input.branchName,
    branchCode: input.branchCode,
    accountType: input.accountType,
    accountNumberEnc: encryptAccountNumber(input.accountNumber),
    accountNumberLast4: input.accountNumber.slice(-4),
    holderKana: input.holderKana,
    updatedAt: new Date(),
  };
  await db.insert(farmBankAccounts).values({ farmId, ...values }).onConflictDoUpdate({ target: farmBankAccounts.farmId, set: values });
}

/** 口座番号の全桁。運営が振込するときだけ（呼び出し側で操作記録を残す） */
export async function revealAccountNumber(farmId: string) {
  const [row] = await db.select({ enc: farmBankAccounts.accountNumberEnc }).from(farmBankAccounts).where(eq(farmBankAccounts.farmId, farmId));
  return row ? decryptAccountNumber(row.enc) : null;
}
