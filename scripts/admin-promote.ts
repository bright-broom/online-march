/**
 * Grants the admin role to an account that already signed up through the site.
 *
 *   DATABASE_URL=… npx tsx scripts/admin-promote.ts --email owner@example.jp
 *
 * Passwords never pass through tooling: the operator registers in the UI, this only changes the role.
 */
import "dotenv/config";

async function main() {
  const i = process.argv.indexOf("--email");
  const email = i === -1 ? undefined : process.argv[i + 1];
  if (!email) throw new Error("--email <アドレス> を指定してください");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL が未設定です");

  const { db } = await import("../src/db/client");
  const { promoteToAdmin } = await import("../src/server/services/provisioning");
  const row = await promoteToAdmin(db, email);
  if (!row) {
    console.error(`[admin:promote] ${email} のアカウントが見つかりません。先にサイトで登録してください`);
    process.exit(1);
  }
  console.info(`[admin:promote] ${row.email} を ${row.role} にしました`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
