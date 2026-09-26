import { z } from "zod";
import { bankAccountTypes, type BankAccountType } from "@/config/payments";

const digits = (label: string, n: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.normalize("NFKC").replace(/[\s-]/g, ""))
    .pipe(z.string().regex(new RegExp(`^\\d{${n}}$`), `${label}は${n}桁の数字で入力してください`));

/** 振込先口座（#20）。client/server 共用。全角数字・半角カナは NFKC でそろえる */
export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, "銀行名を入力してください").max(30),
  bankCode: digits("金融機関コード", 4),
  branchName: z.string().trim().min(1, "支店名を入力してください").max(30),
  branchCode: digits("支店コード", 3),
  accountType: z.enum(Object.keys(bankAccountTypes) as [BankAccountType, ...BankAccountType[]], { error: "預金種目を選んでください" }),
  // 7桁に満たない口座番号は先頭を0で埋めるのが全銀の決まり
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.normalize("NFKC").replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{1,7}$/, "口座番号は7桁までの数字で入力してください"))
    .transform((v) => v.padStart(7, "0")),
  holderKana: z
    .string()
    .trim()
    .transform((v) => v.normalize("NFKC").replace(/\s+/g, " "))
    .pipe(z.string().min(1, "口座名義を入力してください").max(40).regex(/^[ァ-ヶー（）()．.・\-／/ A-Z0-9]+$/, "口座名義はカタカナで入力してください（例: アワジ タロウ）")),
});
export type BankAccountInput = z.input<typeof bankAccountSchema>;
