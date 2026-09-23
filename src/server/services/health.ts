import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

let served = 0;

export type Health = {
  ok: boolean;
  /** このインスタンスが受けた最初のリクエストか（= コールドスタート） */
  coldStart: boolean;
  /** プロセス起動からの経過。コールドスタート時は「起動 + モジュール読み込み」にかかった時間の目安 */
  processAgeMs: number;
  /** `select 1` の往復。Neon が停止中なら起こす時間も含む */
  dbMs: number | null;
  region: string | null;
};

/**
 * 外から叩いて「遅いのは関数の起動か、DBか」を切り分けるための計測。
 * 秘密情報は返さない。DB に失敗しても計測値は返す（ok=false）。
 */
export async function checkHealth(): Promise<Health> {
  const coldStart = served++ === 0;
  const processAgeMs = Math.round(process.uptime() * 1000);
  const region = process.env.VERCEL_REGION ?? null;
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, coldStart, processAgeMs, dbMs: Math.round(performance.now() - started), region };
  } catch {
    return { ok: false, coldStart, processAgeMs, dbMs: null, region };
  }
}
