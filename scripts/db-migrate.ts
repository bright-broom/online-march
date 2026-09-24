/** Apply drizzle migrations to DATABASE_URL (Neon). Skipped for embedded PGlite and Vercel preview builds (migrate-policy.ts). */
import "dotenv/config";
import { migrateDecision } from "./migrate-policy";

async function main() {
  const decision = migrateDecision(process.env);
  if (!decision.run) {
    console.info(`[db:migrate] ${decision.reason}. Skipping.`);
    return;
  }
  const { db, MIGRATIONS_FOLDER } = await import("../src/db/client");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.info("[db:migrate] done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
