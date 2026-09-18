import { NextResponse, type NextRequest } from "next/server";
import { toYmd } from "@/lib/dates";
import { labelQuerySchema } from "@/lib/validators/farmer";
import { ActionError } from "@/server/actions/_utils";
import { assertFarm } from "@/server/auth/guards";
import { getLabelSources, markLabelsPrinted } from "@/server/queries/farmer";
import { buildLabelCsv, defaultItemName } from "@/server/services/shipping/label-csv";

/**
 * GET /api/farmer/labels?ids=a,b&carrier=yamato&encoding=sjis
 * Carrier label-software import CSV (B2クラウド / ゆうプリR / e飛伝Ⅲ) for the signed-in farmer's own to-ship orders.
 */
export async function GET(req: NextRequest) {
  let farm: Awaited<ReturnType<typeof assertFarm>>["farm"];
  try {
    ({ farm } = await assertFarm()); // session role === farmer + owns a farm
  } catch (e) {
    const message = e instanceof ActionError ? e.message : "権限がありません";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = labelQuerySchema.safeParse({ ids: sp.get("ids") ?? "", carrier: sp.get("carrier") ?? farm.defaultCarrier, encoding: sp.get("encoding") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "パラメータが正しくありません" }, { status: 400 });
  const { ids, carrier, encoding } = parsed.data;

  // ownership + status enforced in the query (farmId scope, paid/preparing only)
  const sources = await getLabelSources(farm.id, ids);
  if (!sources.length) return NextResponse.json({ error: "送り状を作成できる注文がありません" }, { status: 404 });

  const now = new Date();
  const today = toYmd(now);
  const rows = sources.map((fo) => ({
    code: fo.code,
    carrier,
    shipDate: fo.shipByDate && fo.shipByDate > today ? fo.shipByDate : today,
    deliveryDate: fo.order.desiredDeliveryDate,
    timeSlot: fo.order.deliveryTimeSlot,
    boxCount: fo.boxCount,
    to: fo.order.shippingAddress,
    from: farm,
    itemName: defaultItemName,
  }));
  const csv = buildLabelCsv(carrier, rows, encoding);
  await markLabelsPrinted(farm.id, sources.map((s) => s.id), now);

  return new NextResponse(new Uint8Array(csv.body), {
    headers: {
      "Content-Type": csv.contentType,
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
