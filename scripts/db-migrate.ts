/** Apply drizzle migrations to DATABASE_URL (Neon). No-op for embedded PGlite (auto-migrates on boot). */
import "dotenv/config";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.info("[db:migrate] DATABASE_URL not set → embedded PGlite migrates itself on first use. Skipping.");
    return;
  }
  const { db, MIGRATIONS_FOLDER } = await import("../src/db/client");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.info("[db:migrate] done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
