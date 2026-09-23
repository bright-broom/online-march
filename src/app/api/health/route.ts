import { connection, NextResponse } from "next/server";
import { checkHealth } from "@/server/services/health";

/** 稼働確認と、コールドスタートの内訳（関数の起動 / DB）の計測。docs/PERFORMANCE.md */
export async function GET() {
  await connection();
  const health = await checkHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
