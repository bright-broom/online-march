import "server-only";
import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { opsConfig } from "@/config/ops";
import { db } from "@/db";
import { env } from "@/lib/env";
import { toYmd } from "@/lib/dates";

export type BackupBlob = { url: string; pathname: string; uploadedAt: Date };
export type BackupDeps = {
  put: (path: string, body: Buffer, token: string) => Promise<{ url: string }>;
  list: (prefix: string, token: string) => Promise<BackupBlob[]>;
  del: (urls: string[], token: string) => Promise<void>;
};

/** Every row of every table as JSON. Small shop, small data — a logical dump is simpler than pg_dump here. */
export async function exportDatabase() {
  const tables = (await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`)).rows;
  const dump: Record<string, unknown[]> = {};
  for (const { tablename } of tables) {
    const rows = await db.execute(sql.raw(`select * from "${tablename}"`));
    dump[tablename] = rows.rows;
  }
  return { takenAt: new Date().toISOString(), tables: dump };
}

/**
 * Daily logical backup to a **private** Blob store (customer data must not land in the public image store).
 * Without BACKUP_BLOB_READ_WRITE_TOKEN the job is a no-op so the automation page does not show a permanent
 * failure — /admin/settings reports the missing token instead.
 */
export type BackupResult = { skipped: string } | { tables: number; rows: number; bytes: number; deleted: number };

export async function runBackup(now: Date, deps: BackupDeps): Promise<BackupResult> {
  const token = env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!token) return { skipped: "BACKUP_BLOB_READ_WRITE_TOKEN 未設定" };

  const dump = await exportDatabase();
  const body = gzipSync(Buffer.from(JSON.stringify(dump)));
  if (body.byteLength < opsConfig.backup.minBytes) throw new Error(`バックアップが小さすぎます（${body.byteLength} bytes）。取得に失敗した可能性があります`);
  const path = `${opsConfig.backup.folder}/${toYmd(now)}-${now.getTime()}.json.gz`;
  const { url } = await deps.put(path, body, token);

  // retention: drop dumps older than keepDays, after the new one is safely stored
  const cutoff = now.getTime() - opsConfig.backup.keepDays * 86_400_000;
  const old = (await deps.list(opsConfig.backup.folder, token)).filter((b) => b.uploadedAt.getTime() < cutoff && b.url !== url);
  if (old.length) await deps.del(old.map((b) => b.url), token);

  return { tables: Object.keys(dump.tables).length, rows: Object.values(dump.tables).reduce((a, r) => a + r.length, 0), bytes: body.byteLength, deleted: old.length };
}

/** Real Vercel Blob implementation; injected so tests can run without network. */
export async function blobBackupDeps(): Promise<BackupDeps> {
  const { put, list, del } = await import("@vercel/blob");
  return {
    put: async (path, bodyBuf, token) => put(path, bodyBuf, { access: "private", token, addRandomSuffix: false, contentType: "application/gzip" }),
    list: async (prefix, token) => (await list({ prefix, token })).blobs.map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt })),
    del: async (urls, token) => del(urls, { token }),
  };
}
