import { NextResponse, type NextRequest } from "next/server";
import type { YMD } from "@/lib/dates";
import { salesCsvQuerySchema } from "@/lib/validators/farmer";
import { ActionError } from "@/server/actions/_utils";
import { assertFarm } from "@/server/auth/guards";
import { getSalesRows } from "@/server/queries/farmer";
import { buildSalesCsv } from "@/server/services/sales-csv";

/**
 * GET /api/farmer/sales?from=2026-01-01&to=2026-12-31&encoding=sjis
 * 確定申告・記帳用の売上明細 CSV。自分の農園の注文だけを、注文日で切り出す。
 */
export async function GET(req: NextRequest) {
  let farm: Awaited<ReturnType<typeof assertFarm>>["farm"];
  try {
    ({ farm } = await assertFarm()); // session role === farmer + owns a farm
  } catch (e) {
    return NextResponse.json({ error: e instanceof ActionError ? e.message : "権限がありません" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = salesCsvQuerySchema.safeParse({
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    encoding: sp.get("encoding") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "パラメータが正しくありません" }, { status: 400 });
  const { from, to, encoding } = parsed.data;

  const rows = await getSalesRows(farm.id, from as YMD, to as YMD); // farmId scope enforced in the query
  const csv = buildSalesCsv(rows, { from: from as YMD, to: to as YMD, farmName: farm.name, encoding });

  return new NextResponse(new Uint8Array(csv.body), {
    headers: {
      "Content-Type": csv.contentType,
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
