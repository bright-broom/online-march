import "server-only";
import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare のバインディング（wrangler.jsonc）を取り出す。Workers の外（手元の next dev・テスト）では使わない:
 * 呼ぶのは features.r2 のときだけ（env.STORAGE_BACKEND === "r2"）。
 */
export async function r2Bucket(name: "UPLOADS" | "BACKUPS"): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = env[name];
  if (!bucket) throw new Error(`R2 binding ${name} is missing (wrangler.jsonc)`);
  return bucket;
}
