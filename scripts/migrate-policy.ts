/**
 * ビルド時に DB マイグレーションを当ててよいか。
 *
 * Vercel の Preview ビルドでは当てない。Preview に本番の DATABASE_URL が入っていると、ブランチを push しただけで
 * そのブランチのスキーマが本番 DB に当たってしまう（2026-09-24、旧プロジェクト online-march が Production/Preview の
 * 両方に DATABASE_URL を持ったまま、push のたびに migrate → ビルド失敗を繰り返していたのが見つかった）。
 * 本番のマイグレーションは push 前に手で当てる運用（docs/STATUS.md §4.1）で、ビルド時はその保険にすぎない。
 */
export type MigrateDecision = { run: true } | { run: false; reason: string };

export function migrateDecision(env: Record<string, string | undefined>): MigrateDecision {
  if (!env.DATABASE_URL) {
    return { run: false, reason: "DATABASE_URL not set → embedded PGlite migrates itself on first use" };
  }
  // VERCEL_ENV: production | preview | development。Vercel 以外（手元・CI）では未設定 = 明示的に実行した操作なので当てる
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return { run: false, reason: `VERCEL_ENV=${env.VERCEL_ENV} → only production builds migrate` };
  }
  return { run: true };
}
