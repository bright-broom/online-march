/**
 * Restore a `backup-db` dump into the database in DATABASE_URL. Destructive: every table is replaced.
 *
 *   npx tsx scripts/db-restore.ts --file .deploy/backup.json.gz --yes
 *   npx tsx scripts/db-restore.ts --blob db-backups/2026-09-20-….json.gz --yes   (needs BACKUP_BLOB_READ_WRITE_TOKEN)
 *   npx tsx scripts/db-restore.ts --blob latest --yes
 *
 * Without --yes it prints what would be restored and stops. See docs/DEPLOY.md §Runbook.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

async function loadDump(): Promise<Buffer> {
  const file = arg("file");
  if (file) return gunzipSync(readFileSync(file));
  const blobPath = arg("blob");
  if (!blobPath) throw new Error("--file <path> か --blob <pathname|latest> を指定してください");
  const token = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BACKUP_BLOB_READ_WRITE_TOKEN が設定されていません");
  const { list, get } = await import("@vercel/blob");
  const { opsConfig } = await import("../src/config/ops");
  let pathname = blobPath;
  if (blobPath === "latest") {
    const { blobs } = await list({ prefix: opsConfig.backup.folder, token });
    if (!blobs.length) throw new Error("バックアップが見つかりません");
    pathname = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0].pathname;
    console.info(`[db:restore] 最新のバックアップ: ${pathname}`);
  }
  const res = await get(pathname, { access: "private", token, useCache: false });
  if (!res || res.statusCode !== 200) throw new Error(`バックアップを取得できません（${res?.statusCode ?? "not found"}）`);
  return gunzipSync(Buffer.from(await new Response(res.stream).arrayBuffer()));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL が未設定です（ローカル PGlite への復元は想定していません）");
  const dump = JSON.parse((await loadDump()).toString()) as { takenAt: string; tables: Record<string, unknown[]> };
  const summary = Object.entries(dump.tables)
    .filter(([, rows]) => rows.length)
    .map(([t, rows]) => `${t}:${rows.length}`);
  console.info(`[db:restore] 取得日時 ${dump.takenAt}`);
  console.info(`[db:restore] ${summary.length} テーブル / ${Object.values(dump.tables).reduce((a, r) => a + r.length, 0)} 行`);
  console.info(`[db:restore] ${summary.join(" ")}`);

  const host = new URL(process.env.DATABASE_URL).host;
  if (!process.argv.includes("--yes")) {
    console.info(`[db:restore] --yes を付けると ${host} の全テーブルを置き換えます（確認のみで終了）`);
    process.exit(0);
  }
  console.warn(`[db:restore] ${host} の全テーブルを置き換えます…`);
  const { db } = await import("../src/db/client");
  const { restoreDatabase } = await import("../src/server/services/backup-restore");
  const restored = await restoreDatabase(db, dump as never);
  console.info("[db:restore] 完了:", restored);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
