import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { inventory, purgeAllData, promoteToAdmin, resetTwoFactor } = await import("../provisioning");
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

  it("二段階認証のやり直し: 秘密鍵とセッションを消して無効に戻す（他人の設定には触れない）", async () => {
    const target = await demoCopy();
    for (const [id, email] of [["lost-1", "Lost@Awaji-Marche.jp"], ["other-1", "other@awaji-marche.jp"]]) {
      await target.execute(sql`insert into "user" (id, name, email, email_verified, role, two_factor_enabled) values (${id}, '運営', ${email}, true, 'admin', true)`);
      await target.execute(sql`insert into two_factor (id, secret, backup_codes, user_id) values (${`tf-${id}`}, 'enc', 'enc', ${id})`);
      await target.execute(sql`insert into session (id, expires_at, token, user_id) values (${`s-${id}`}, now() + interval '1 day', ${`t-${id}`}, ${id})`);
    }

    expect(await resetTwoFactor(target, " lost@awaji-marche.jp ")).toEqual({ email: "Lost@Awaji-Marche.jp" });
    const state = async (id: string) =>
      (await target.execute(sql`select u.two_factor_enabled as on, (select count(*) from two_factor where user_id = u.id)::int as secrets, (select count(*) from session where user_id = u.id)::int as sessions from "user" u where u.id = ${id}`)).rows[0];
    expect(await state("lost-1")).toEqual({ on: false, secrets: 0, sessions: 0 });
    expect(await state("other-1")).toEqual({ on: true, secrets: 1, sessions: 1 });
    expect(await resetTwoFactor(target, "nobody@awaji-marche.jp")).toBeNull();
  });
});

