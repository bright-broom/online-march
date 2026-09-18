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
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
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

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM"; // exists but not ours
  }
};

/**
 * Single-writer lock for the file DB. `${dir}.owner` is created atomically (O_EXCL) and holds the
 * owning PID. A lock whose owner is dead is stale (killed dev server) and is taken over; PGlite's
 * own leftover `postmaster.pid` is then removed. Losing processes must not open the directory.
 */
function acquireFileLock(dir: string): boolean {
  const ownerFile = `${dir}.owner`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(ownerFile, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      const pglitePid = path.join(dir, "postmaster.pid");
      if (existsSync(pglitePid)) {
        unlinkSync(pglitePid);
        console.info(`[db] pid ${process.pid}: cleared stale PGlite lock`);
      }
      process.once("exit", () => {
        try {
          if (readFileSync(ownerFile, "utf8") === String(process.pid)) unlinkSync(ownerFile);
        } catch {}
      });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const owner = Number(readFileSync(ownerFile, "utf8"));
      if (owner === process.pid) return true;
      if (Number.isFinite(owner) && isAlive(owner)) return false;
      try {
        unlinkSync(ownerFile); // stale owner — take over on next attempt
      } catch {}
    }
  }
  return false;
}

/** Open PGlite, migrate and seed. Resolves to the ready client. */
async function openPglite(dir: string | undefined): Promise<PGlite> {
  if (dir && !acquireFileLock(dir)) throw new Error("PGlite data dir is owned by another live process");
  const client = new PGlite(dir);
  await client.waitReady;
  if (dir) console.info(`[db] pid ${process.pid}: opened ${dir}`);
  const rawDb = drizzlePglite({ client, schema });
  await migratePglite(rawDb, { migrationsFolder: MIGRATIONS_FOLDER });
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(rawDb as unknown as Database);
  return client;
}

function createPglite(): Database {
  if (!globalForDb.__pglite) {
    // The file DB is single-writer: only the main server process may open it.
    // `next build` workers and Next's child workers (jest-worker sets JEST_WORKER_ID;
    // Next sets IS_NEXT_WORKER) get an isolated, seeded in-memory copy instead.
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    const isChildWorker = Boolean(process.env.JEST_WORKER_ID || process.env.IS_NEXT_WORKER);
    const dir = process.env.PGLITE_DIR ?? (isBuild || isChildWorker ? "memory://" : ".data/pglite");
    const inMemory = dir.startsWith("memory://");
    if (!inMemory) mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
    const ready = openPglite(inMemory ? undefined : dir).catch(async (err) => {
      // The file DB is single-process. Secondary processes (e.g. the dev server's
      // static-params worker) fall back to an isolated in-memory copy instead of failing.
      console.info(`[db] pid ${process.pid}: ${dir} busy/unavailable (${String(err).slice(0, 80)}) → isolated in-memory copy`);
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
