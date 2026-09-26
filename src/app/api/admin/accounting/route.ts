import { NextResponse, type NextRequest } from "next/server";
import { accountingCsvQuerySchema } from "@/lib/validators/admin";
import { ActionError } from "@/server/actions/_utils";
import { assertRole } from "@/server/auth/guards";
import { getAccountingRows } from "@/server/queries/admin";
import { buildAccountingCsv } from "@/server/services/accounting-csv";
import { recordAudit } from "@/server/services/audit";

/**
 * GET /api/admin/accounting?month=2026-09&encoding=utf8
 * 運営向け会計CSV（#21）。全生産者の売上・手数料・返金を含むので、運営（二段階認証済み。assertRole が確かめる）だけ。
 * 書き出したことは操作記録に残す。
 */
export async function GET(req: NextRequest) {
  let me: Awaited<ReturnType<typeof assertRole>>;
  try {
    me = await assertRole("admin");
  } catch (e) {
    return NextResponse.json({ error: e instanceof ActionError ? e.message : "権限がありません" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = accountingCsvQuerySchema.safeParse({ month: sp.get("month") ?? "", encoding: sp.get("encoding") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "パラメータが正しくありません" }, { status: 400 });
  const { month, encoding } = parsed.data;

  const rows = await getAccountingRows(month);
  const csv = buildAccountingCsv(rows, { month, encoding });
  await recordAudit(me, { action: "accounting.export", summary: `${month} の会計CSVを書き出し（${rows.length}件）`, detail: { month, rows: rows.length } });

  return new NextResponse(new Uint8Array(csv.body), {
    headers: {
      "Content-Type": csv.contentType,
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
