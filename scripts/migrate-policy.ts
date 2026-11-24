/**
 * ビルド時に DB マイグレーションを当ててよいか。
 *
 * Cloudflare Workers Builds の main 以外のビルド（と、旧 Vercel の Preview ビルド）では当てない。Preview に本番の DATABASE_URL が入っていると、ブランチを push しただけで
 * そのブランチのスキーマが本番 DB に当たってしまう（2026-09-24、旧プロジェクト online-march が Production/Preview の
 * 両方に DATABASE_URL を持ったまま、push のたびに migrate → ビルド失敗を繰り返していたのが見つかった）。
 * 本番のマイグレーションは push 前に手で当てる運用（docs/STATUS.md §4.1）で、ビルド時はその保険にすぎない。
 */
export type MigrateDecision = { run: true } | { run: false; reason: string };

export function migrateDecision(env: Record<string, string | undefined>): MigrateDecision {
  if (!env.DATABASE_URL) {
    return { run: false, reason: "DATABASE_URL not set → embedded PGlite migrates itself on first use" };
  }
  // Cloudflare Workers Builds: main 以外のブランチのビルド（プレビュー）では当てない。ビルド用の変数はブランチを問わず入るため
  if (env.WORKERS_CI && env.WORKERS_CI_BRANCH !== "main") {
    return { run: false, reason: `WORKERS_CI_BRANCH=${env.WORKERS_CI_BRANCH ?? "(unknown)"} → only main builds migrate` };
  }
  // VERCEL_ENV（旧ホスティング）: production | preview | development。どちらでもない（手元・CI）= 明示的に実行した操作なので当てる
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return { run: false, reason: `VERCEL_ENV=${env.VERCEL_ENV} → only production builds migrate` };
  }
  return { run: true };
}
