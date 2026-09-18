/** Seed demo data. `--reset` truncates everything first. Works for Neon and PGlite. */
import "dotenv/config";

async function main() {
  const { db } = await import("../src/db/client");
  const { seed, resetDatabase, seedIfEmpty } = await import("../src/db/seed");
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    const { MIGRATIONS_FOLDER } = await import("../src/db/client");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  if (process.argv.includes("--reset")) {
    await resetDatabase(db);
    await seed(db, new Date());
  } else {
    const seeded = await seedIfEmpty(db);
    if (!seeded) console.info("[db:seed] database already has data (use --reset to reseed)");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
