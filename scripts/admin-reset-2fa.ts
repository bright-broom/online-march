/**
 * 二段階認証をやり直させる。運営が端末もバックアップコードもなくしてログインできなくなったとき用。
 *
 *   DATABASE_URL=… npm run admin:reset-2fa -- --email owner@example.jp
 *
 * 秘密鍵を消して無効にし、ログイン中のセッションも切る。本人はパスワードでログインし直すと設定画面へ案内される。
 * 実行する前に、本人からの依頼であることを別の手段（電話など）で必ず確かめること。
 */
import "dotenv/config";

async function main() {
  const i = process.argv.indexOf("--email");
  const email = i === -1 ? undefined : process.argv[i + 1];
  if (!email) throw new Error("--email <アドレス> を指定してください");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL が未設定です");

  const { db } = await import("../src/db/client");
  const { resetTwoFactor } = await import("../src/server/services/provisioning");
  const row = await resetTwoFactor(db, email);
  if (!row) {
    console.error(`[admin:reset-2fa] ${email} のアカウントが見つかりません`);
    process.exit(1);
  }
  console.info(`[admin:reset-2fa] ${row.email} の二段階認証を解除しました。次のログインで設定し直してもらってください`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
