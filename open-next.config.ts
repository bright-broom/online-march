import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * Next.js のキャッシュ（"use cache"・updateTag）を Cloudflare に置く設定（docs/PERFORMANCE.md・ADR #14）。
 * - 本体: R2（NEXT_INC_CACHE_R2_BUCKET）
 * - タグの失効記録: D1（NEXT_TAG_CACHE_D1）。updateTag したタグを全リージョンで失効させる
 * - 時間切れの再生成: Durable Object のキュー（NEXT_CACHE_DO_QUEUE）
 * enableCacheInterception は使わない（Partial Prerendering と併用できないため）。
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: doQueue,
});
