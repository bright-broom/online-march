import { sql, type SQL } from "drizzle-orm";
import { demoEmailDomains } from "@/config/demo";

/** Structural, like RestoreTarget: works with the Neon client (scripts) and PGlite (tests). */
export type ProvisioningTarget = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> };

export type Inventory = { users: number; demoUsers: number; realUsers: number; farms: number; orders: number };

/** What a purge would remove. `realUsers` > 0 means this is not a demo database — the caller must stop. */
export async function inventory(target: ProvisioningTarget): Promise<Inventory> {
  const [row] = (
    await target.execute(sql`
      select
        (select count(*)::int from "user") as users,
        (select count(*)::int from "user" where lower(split_part(email, '@', 2)) = any(${sql.param(demoEmailDomains.map(String))})) as demo_users,
        (select count(*)::int from farms) as farms,
        (select count(*)::int from orders) as orders`)
  ).rows;
  const users = Number(row.users);
  const demoUsers = Number(row.demo_users);
  return { users, demoUsers, realUsers: users - demoUsers, farms: Number(row.farms), orders: Number(row.orders) };
}

/**
 * Empties every business table so the shop opens with real data only. Used once, at go-live, after
 * DEMO_MODE=false; `scripts/demo-purge.ts` refuses to run it when the database holds non-demo accounts.
 */
export async function purgeAllData(target: ProvisioningTarget) {
  await target.execute(sql`
    truncate table job_runs, platform_settings, announcements, notifications, coupons, payouts,
      messages, farm_follows, favorites, reviews, shipment_events, order_items, farm_orders, orders,
      addresses, product_images, product_variants, products, farms, verification, account, session, rate_limit, "user"
    restart identity cascade`);
  return inventory(target);
}

/** The first operator signs up through the UI (no password ever passes through tooling), then is promoted here. */
export async function promoteToAdmin(target: ProvisioningTarget, email: string) {
  const [row] = (
    await target.execute(sql`update "user" set role = 'admin' where lower(email) = ${email.trim().toLowerCase()} returning email, role`)
  ).rows;
  return row ? { email: String(row.email), role: String(row.role) } : null;
}
