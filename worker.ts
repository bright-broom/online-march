/**
 * Cloudflare Workers の入口（wrangler.jsonc の main）。
 * OpenNext がビルドした Next.js の Worker（.open-next/worker.js）に、定期実行（Cron Triggers）を足す。
 * 定期実行は Vercel Cron のときと同じく /api/cron/<job> を CRON_SECRET 付きで呼ぶ（認可とジョブの記録をそこに一本化）。
 */
// @ts-expect-error -- ビルド時に OpenNext が生成する
import { default as handler } from "./.open-next/worker.js";
import type { ExecutionContext, ExportedHandler, ScheduledController } from "@cloudflare/workers-types";
import { cronJobs } from "./src/config/cron";

type Env = CloudflareEnv & { CRON_SECRET?: string };

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const job = cronJobs.find((j) => j.schedule === event.cron)?.job;
    if (!job) {
      console.error(`[cron] no job for schedule "${event.cron}"`);
      return;
    }
    const req = new Request(`https://cron.internal/api/cron/${job}`, {
      headers: env.CRON_SECRET ? { authorization: `Bearer ${env.CRON_SECRET}` } : {},
    });
    const res = (await handler.fetch(req, env, ctx)) as globalThis.Response;
    const body = await res.text();
    if (!res.ok) throw new Error(`[cron] ${job} failed (${res.status}): ${body.slice(0, 500)}`);
    console.info(`[cron] ${job} ok: ${body.slice(0, 200)}`);
  },
} satisfies ExportedHandler<Env>;

// OpenNext の Durable Object（キャッシュの再生成キュー）
// @ts-expect-error -- ビルド時に OpenNext が生成する
export { DOQueueHandler } from "./.open-next/worker.js";
