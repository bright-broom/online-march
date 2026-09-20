/**
 * Go-live step: empty the demo data so the shop opens with real data only.
 *
 *   DATABASE_URL=… npx tsx scripts/demo-purge.ts            # 何を消すか表示するだけ
 *   DATABASE_URL=… npx tsx scripts/demo-purge.ts --yes      # 実行
 *   DATABASE_URL=… npx tsx scripts/demo-purge.ts --yes --force   # デモ以外のアカウントがあっても実行
 *
 * Refuses by default when the database holds accounts outside the demo domain: that is a live shop, and
 * this command would delete its customers and orders. Back up first (docs/DEPLOY.md §Runbook).
 */
import "dotenv/config";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL が未設定です");
  const host = new URL(process.env.DATABASE_URL).host;
  const { db } = await import("../src/db/client");
  const { inventory, purgeAllData } = await import("../src/server/services/provisioning");

  const before = await inventory(db);
  console.info(`[demo:purge] 対象: ${host}`);
  console.info(`[demo:purge] ユーザー ${before.users}（デモ ${before.demoUsers} / デモ以外 ${before.realUsers}）・生産者 ${before.farms}・注文 ${before.orders}`);

  if (!process.argv.includes("--yes")) {
    console.info("[demo:purge] --yes を付けると上記をすべて削除します（確認のみで終了）");
    process.exit(0);
  }
  if (before.realUsers > 0 && !process.argv.includes("--force")) {
    console.error(`[demo:purge] 中止: デモ以外のアカウントが ${before.realUsers} 件あります。実データの可能性があるため削除しません（本当に消すなら --force）`);
    process.exit(1);
  }

  const after = await purgeAllData(db);
  console.info(`[demo:purge] 完了: ユーザー ${after.users}・生産者 ${after.farms}・注文 ${after.orders}`);
  console.info("[demo:purge] 次に: サイトで運営者アカウントを新規登録し、npm run admin:promote -- --email <アドレス> を実行してください");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
