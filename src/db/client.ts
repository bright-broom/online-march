/**
 * Database client factory.
 *
 * - DATABASE_URL set  → Neon serverless (WebSocket Pool, supports transactions). Production / Preview.
 * - DATABASE_URL unset → embedded PGlite (Postgres 18 in WASM). Zero-config local dev.
 *     PGLITE_DIR=.data/pglite (default, persistent) | memory:// (build / CI, ephemeral)
 *     PGlite is migrated + seeded automatically on first use; queries wait for readiness.
 *
 * This module is import-safe from scripts (no "server-only"); app code imports `@/db`.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Database = NeonDatabase<typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type PgliteState = { ready: Promise<PGlite> };
const globalForDb = globalThis as unknown as { __pglite?: PgliteState; __neonPool?: Pool };

function createNeon(url: string): Database {
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  const pool = (globalForDb.__neonPool ??= new Pool({ connectionString: url }));
  return drizzleNeon({ client: pool, schema });
}

/** Open PGlite, migrate and seed. Resolves to the ready client. */
async function openPglite(dir: string | undefined): Promise<PGlite> {
  const client = new PGlite(dir);
  await client.waitReady;
  const rawDb = drizzlePglite({ client, schema });
  await migratePglite(rawDb, { migrationsFolder: MIGRATIONS_FOLDER });
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(rawDb as unknown as Database);
  return client;
}

function createPglite(): Database {
  if (!globalForDb.__pglite) {
    // `next build` spawns several workers → each gets an isolated in-memory copy.
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    const dir = process.env.PGLITE_DIR ?? (isBuild ? "memory://" : ".data/pglite");
    const inMemory = dir.startsWith("memory://");
    if (!inMemory) mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
    const ready = openPglite(inMemory ? undefined : dir).catch(async (err) => {
      // The file DB is single-process. Secondary processes (e.g. the dev server's
      // static-params worker) fall back to an isolated in-memory copy instead of failing.
      console.warn(`[db] PGlite at ${dir} unavailable in this process (${String(err).slice(0, 80)}); using in-memory copy`);
      return openPglite(undefined);
    });
    globalForDb.__pglite = { ready };
  }
  const { ready } = globalForDb.__pglite;

  // Stable facade: every call waits for readiness, then delegates to the live client.
  const facade = new Proxy(Object.create(PGlite.prototype) as PGlite, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return (...args: unknown[]) =>
        ready.then((client) => {
          const fn = Reflect.get(client, prop) as (...a: unknown[]) => unknown;
          return fn.apply(client, args);
        });
    },
  });
  return drizzlePglite({ client: facade, schema }) as unknown as Database;
}

export const isEmbeddedDb = !process.env.DATABASE_URL;

export const db: Database = process.env.DATABASE_URL
  ? createNeon(process.env.DATABASE_URL)
  : createPglite();
