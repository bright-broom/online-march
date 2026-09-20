import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { exportDatabase } = await import("../backup");
const { restoreDatabase } = await import("../backup-restore");
const schema = await import("@/db/schema");
const { db } = await import("@/db/client");

/** A throwaway database, so restoring cannot disturb the seeded one the other tests share. */
const freshDatabase = async () => {
  const client = new PGlite();
  const target = drizzle({ client, schema });
  await migrate(target, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return target;
};
const count = async (d: Awaited<ReturnType<typeof freshDatabase>>, table: string) =>
  Number((await d.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${table}"`))).rows[0].n);

describe("restoring a backup", () => {
  it("rebuilds every table from a dump, in foreign-key order", async () => {
    const dump = await exportDatabase();
    const target = await freshDatabase();
    expect(await count(target, "orders")).toBe(0); // empty to begin with

    const restored = await restoreDatabase(target, dump);

    for (const [table, rows] of Object.entries(dump.tables)) {
      expect(await count(target, table), table).toBe(rows.length);
      if (rows.length) expect(restored[table], table).toBe(rows.length);
    }
    // relationships survive: every farm order still points at a farm and an order that exist
    const orphans = await target.execute<{ n: number }>(sql`
      select count(*)::int as n from farm_orders fo
      left join farms f on f.id = fo.farm_id
      left join orders o on o.id = fo.order_id
      where f.id is null or o.id is null`);
    expect(Number(orphans.rows[0].n)).toBe(0);
    const farm = (await target.execute<{ name: string; stripe_account_id: string | null }>(sql`select name, stripe_account_id from farms order by name limit 1`)).rows[0];
    expect(farm.name).toBe((dump.tables.farms as { name: string }[]).map((f) => f.name).sort()[0]);
  });

  it("replaces whatever is already in the target and can be run twice", async () => {
    const dump = await exportDatabase();
    const target = await freshDatabase();
    await restoreDatabase(target, dump);
    await target.execute(sql`delete from reviews`);
    await target.execute(sql`update farms set name = 'broken'`);

    await restoreDatabase(target, dump); // a second restore puts it back exactly

    expect(await count(target, "reviews")).toBe(dump.tables.reviews.length);
    const names = (await target.execute<{ name: string }>(sql`select name from farms order by name`)).rows.map((r) => r.name);
    expect(names).toEqual((dump.tables.farms as { name: string }[]).map((f) => f.name).sort());
  });

  it("leaves the target untouched when the dump is broken", async () => {
    const dump = await exportDatabase();
    const target = await freshDatabase();
    await restoreDatabase(target, dump);
    const before = await count(target, "orders");

    const broken = { ...dump, tables: { ...dump.tables, farm_orders: [{ id: "nope", order_id: "missing", farm_id: "missing" }] } };
    await expect(restoreDatabase(target, broken)).rejects.toThrow();

    expect(await count(target, "orders")).toBe(before); // the transaction rolled back
  });

  it("keeps the shared seeded database intact", async () => {
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from farms`)).rows[0].n)).toBeGreaterThan(0);
  });
});
