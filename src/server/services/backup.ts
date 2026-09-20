import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { opsConfig } from "@/config/ops";
import { restoreDatabase, type DatabaseDump } from "./backup-restore";
import { db } from "@/db";

import { env } from "@/lib/env";
import { toYmd } from "@/lib/dates";

export type BackupBlob = { url: string; pathname: string; uploadedAt: Date };
export type BackupDeps = {
  put: (path: string, body: Buffer, token: string) => Promise<{ url: string }>;
  /** Reads a stored dump back — a backup nobody can read is not a backup. */
  download: (pathOrUrl: string, token: string) => Promise<Buffer>;
  list: (prefix: string, token: string) => Promise<BackupBlob[]>;
  del: (urls: string[], token: string) => Promise<void>;
};

/** Every row of every table as JSON. Small shop, small data — a logical dump is simpler than pg_dump here. */
export async function exportDatabase(): Promise<DatabaseDump> {
  const tables = (await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`)).rows;
  const dump: DatabaseDump["tables"] = {};
  for (const { tablename } of tables) {
    const rows = await db.execute(sql.raw(`select * from "${tablename}"`));
    dump[tablename] = rows.rows as Record<string, unknown>[];
  }
  return { takenAt: new Date().toISOString(), tables: dump };
}

/**
 * Daily logical backup to a **private** Blob store (customer data must not land in the public image store).
 * Without BACKUP_BLOB_READ_WRITE_TOKEN the job is a no-op so the automation page does not show a permanent
 * failure — /admin/settings reports the missing token instead.
 */
export type BackupResult = { skipped: string } | { tables: number; rows: number; bytes: number; deleted: number; verified: number };

export async function runBackup(now: Date, deps: BackupDeps): Promise<BackupResult> {
  const token = env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!token) return { skipped: "BACKUP_BLOB_READ_WRITE_TOKEN 未設定" };

  const dump = await exportDatabase();
  const body = gzipSync(Buffer.from(JSON.stringify(dump)));
  if (body.byteLength < opsConfig.backup.minBytes) throw new Error(`バックアップが小さすぎます（${body.byteLength} bytes）。取得に失敗した可能性があります`);
  const path = `${opsConfig.backup.folder}/${toYmd(now)}-${now.getTime()}.json.gz`;
  const { url } = await deps.put(path, body, token);

  // read it back: a truncated or unreadable dump must fail the run, not sit there looking like a backup
  const restored = JSON.parse(gunzipSync(await deps.download(path, token)).toString()) as Awaited<ReturnType<typeof exportDatabase>>;
  const tables = Object.keys(dump.tables).length;
  if (Object.keys(restored.tables).length !== tables || restored.takenAt !== dump.takenAt) {
    throw new Error("保存したバックアップを読み戻せませんでした（内容が一致しません）");
  }

  // retention: drop dumps older than keepDays, after the new one is safely stored
  const cutoff = now.getTime() - opsConfig.backup.keepDays * 86_400_000;
  const old = (await deps.list(opsConfig.backup.folder, token)).filter((b) => b.uploadedAt.getTime() < cutoff && b.url !== url);
  if (old.length) await deps.del(old.map((b) => b.url), token);

  return { tables, rows: Object.values(dump.tables).reduce((a, r) => a + r.length, 0), bytes: body.byteLength, deleted: old.length, verified: 1 };
}

/** Real Vercel Blob implementation; injected so tests can run without network. */
export async function blobBackupDeps(): Promise<BackupDeps> {
  const { put, list, del, get } = await import("@vercel/blob");
  return {
    put: async (path, bodyBuf, token) => put(path, bodyBuf, { access: "private", token, addRandomSuffix: false, contentType: "application/gzip" }),
    download: async (pathOrUrl, token) => {
      const res = await get(pathOrUrl, { access: "private", token, useCache: false });
      if (!res || res.statusCode !== 200) throw new Error(`バックアップを読み戻せませんでした（${res?.statusCode ?? "not found"}）`);
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    },
    list: async (prefix, token) => (await list({ prefix, token })).blobs.map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt })),
    del: async (urls, token) => del(urls, { token }),
  };
}

export { restoreDatabase };
export type { DatabaseDump, RestoreTarget } from "./backup-restore";
