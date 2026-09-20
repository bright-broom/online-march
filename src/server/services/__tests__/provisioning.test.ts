import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { inventory, purgeAllData, promoteToAdmin } = await import("../provisioning");
const { exportDatabase } = await import("../backup");
const { restoreDatabase } = await import("../backup-restore");
const schema = await import("@/db/schema");

/** A copy of the seeded demo database, so a purge here cannot touch the one other tests share. */
const demoCopy = async () => {
  const target = drizzle({ client: new PGlite(), schema });
  await migrate(target, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await restoreDatabase(target, await exportDatabase());
  return target;
};

describe("go-live provisioning", () => {
  it("counts what a purge would remove and empties the demo database", async () => {
    const target = await demoCopy();
    const before = await inventory(target);
    expect(before.demoUsers).toBeGreaterThan(0);
    expect(before.realUsers).toBe(0); // seeded accounts only: @demo.awaji plus the RFC 2606 documentation domains
    expect(before.orders).toBeGreaterThan(0);

    const after = await purgeAllData(target);

    expect(after).toMatchObject({ users: 0, farms: 0, orders: 0 });
    for (const table of ["user", "farms", "orders", "order_items", "payouts", "reviews", "session", "rate_limit"]) {
      const [row] = (await target.execute(sql.raw(`select count(*)::int as n from "${table}"`))).rows;
      expect(Number(row.n), table).toBe(0);
    }
  });

  it("reports real accounts so the caller can refuse to wipe a live shop", async () => {
    const target = await demoCopy();
    await target.execute(sql`insert into "user" (id, name, email, email_verified, role) values ('real-1', '山田', 'hanako@awaji-marche.jp', true, 'customer')`);

    const counts = await inventory(target);

    expect(counts.realUsers).toBe(1);
    expect(counts.demoUsers).toBe(counts.users - 1);
  });

  it("promotes an existing account to admin and reports a missing one", async () => {
    const target = await demoCopy();
    await target.execute(sql`insert into "user" (id, name, email, email_verified, role) values ('owner-1', '運営', 'Owner@Awaji-Marche.jp', true, 'customer')`);

    expect(await promoteToAdmin(target, "  owner@awaji-marche.JP ")).toMatchObject({ role: "admin" });
    const [row] = (await target.execute(sql`select role from "user" where id = 'owner-1'`)).rows;
    expect(row.role).toBe("admin");
    expect(await promoteToAdmin(target, "nobody@awaji-marche.jp")).toBeNull();
  });
});
