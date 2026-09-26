import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { rateLimits, type RateLimitName } from "@/config/rate-limits";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

/**
 * アプリ側の回数制限（#21）。Better Auth と同じ rate_limit テーブルを使う（Vercel では関数ごとにメモリが分かれるので DB に置く）。
 * 行の id を `app:<名前>:<ユーザーID>` にして Better Auth の行と混ざらないようにし、1回の upsert で数えるので同時に来ても数え漏れない。
 */
const idOf = (name: RateLimitName, subject: string) => `app:${name}:${subject}`;

/** 1回数える。上限を超えていたら false（その回は拒否する） */
export async function consumeRateLimit(name: RateLimitName, subject: string, now = Date.now()) {
  const { windowSec, max } = rateLimits[name];
  const id = idOf(name, subject);
  const windowStart = now - windowSec * 1000;
  const [row] = await db
    .insert(rateLimit)
    .values({ id, key: id, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.id,
      // 窓が過ぎていれば 1 からやり直す（lastRequest は窓の始まりとして使う）
      set: {
        count: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  return row.count <= max;
}

/** 数えずに、すでに上限に達しているかだけ見る（失敗したときだけ数えるもの用。例: 使えないクーポン） */
export async function isRateLimited(name: RateLimitName, subject: string, now = Date.now()) {
  const { windowSec, max } = rateLimits[name];
  const [row] = await db
    .select({ count: rateLimit.count })
    .from(rateLimit)
    .where(and(eq(rateLimit.id, idOf(name, subject)), gt(rateLimit.lastRequest, now - windowSec * 1000)));
  return (row?.count ?? 0) >= max;
}
