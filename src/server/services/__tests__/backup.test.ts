import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { opsConfig } = await import("@/config/ops");

const deps = (existing: { url: string; pathname: string; uploadedAt: Date }[] = []) => {
  const stored = new Map<string, Buffer>();
  const put = vi.fn(async (path: string, body: Buffer, _token: string) => {
    stored.set(path, body);
    return { url: `https://private.blob/${path}` };
  });
  const del = vi.fn(async (_urls: string[], _token: string) => {});
  return { put, del, stored, download: vi.fn(async (path: string) => stored.get(path)!), list: vi.fn(async () => existing), uploaded: () => put.mock.calls[0], deleted: () => del.mock.calls[0]?.[0] };
};

describe("database backup", () => {
  it("does nothing without a backup store token", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "");
    vi.resetModules();
    const { runBackup: fresh } = await import("../backup");
    const d = deps();
    expect(await fresh(new Date(), d)).toEqual({ skipped: "BACKUP_BLOB_READ_WRITE_TOKEN 未設定" });
    expect(d.put).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("uploads every table gzipped and prunes old dumps", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "blob_backup_token");
    vi.resetModules();
    const { runBackup: fresh } = await import("../backup");
    const now = new Date("2026-09-20T02:00:00+09:00");
    const old = new Date(now.getTime() - (opsConfig.backup.keepDays + 1) * 86_400_000);
    const keep = new Date(now.getTime() - 86_400_000);
    const d = deps([
      { url: "https://private.blob/old.json.gz", pathname: "db-backups/old.json.gz", uploadedAt: old },
      { url: "https://private.blob/recent.json.gz", pathname: "db-backups/recent.json.gz", uploadedAt: keep },
    ]);

    const r = await fresh(now, d);
    if ("skipped" in r) throw new Error("should not skip");
    expect(r.tables).toBeGreaterThan(10);
    expect(r.rows).toBeGreaterThan(100); // the seeded demo data
    expect(r.deleted).toBe(1);

    const [path, body, token] = d.uploaded()!;
    expect(path).toMatch(/^db-backups\/2026-09-20-\d+\.json\.gz$/);
    expect(token).toBe("blob_backup_token");
    const dump = JSON.parse(gunzipSync(body).toString());
    expect(Object.keys(dump.tables)).toContain("orders");
    expect(dump.tables.farms.length).toBeGreaterThan(0);
    expect(dump.tables.farms[0]).toHaveProperty("name");

    expect(d.deleted()).toEqual(["https://private.blob/old.json.gz"]); // the recent one survives
    expect(r.verified).toBe(1);
    vi.unstubAllEnvs();
  });

  it("fails the run when the stored dump cannot be read back", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "blob_backup_token");
    vi.resetModules();
    const { runBackup: fresh } = await import("../backup");
    const d = deps();
    const truncated = { ...d, download: vi.fn(async () => gzipSync(Buffer.from(JSON.stringify({ takenAt: "other", tables: {} })))) };

    await expect(fresh(new Date(), truncated)).rejects.toThrow("読み戻せませんでした");
    expect(d.deleted()).toBeUndefined(); // nothing is pruned when the new dump is not trustworthy
    vi.unstubAllEnvs();
  });
});
