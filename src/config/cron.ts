/**
 * 定期実行の時刻（UTC の cron 式。日本時間 = +9時間）。
 * Cloudflare の Cron Triggers（wrangler.jsonc の triggers.crons）と1対1で、worker.ts がこの表でジョブを選ぶ。
 * 時刻を変えるときは wrangler.jsonc も直す（test/cron-config.test.ts が食い違いを止める）。
 * 1つの cron 式に1つのジョブだけ（同じ時刻を2つに使わない）。
 */
export const cronJobs = [
  { job: "cancel-unpaid", schedule: "15 15 * * *" },
  { job: "ship-reminders", schedule: "0 23 * * *" },
  { job: "sync-tracking", schedule: "0 21 * * *" },
  { job: "review-requests", schedule: "0 1 * * *" },
  { job: "close-payouts", schedule: "0 16 * * *" },
  { job: "backup-db", schedule: "30 17 * * *" },
  { job: "compare-prices", schedule: "45 19 * * *" },
] as const;
