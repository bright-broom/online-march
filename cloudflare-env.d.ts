/**
 * Cloudflare のバインディング（wrangler.jsonc）の型。wrangler.jsonc を変えたらここも直す。
 * `wrangler types` の出力は Workers の実行時の型（Response など）を全体に入れてしまい、Next.js 側の型とぶつかるので使わない。
 * Workers の型はモジュールとして読み込む（@cloudflare/workers-types/index.ts）。
 */
import type { Hyperdrive, R2Bucket } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: Hyperdrive;
    UPLOADS?: R2Bucket;
    BACKUPS?: R2Bucket;
    DB_DRIVER?: "hyperdrive";
    STORAGE_BACKEND?: "r2";
  }
}
