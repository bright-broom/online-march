import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cronJobs } from "../src/config/cron";

/**
 * 定期実行の時刻は src/config/cron.ts（worker.ts がジョブを選ぶ表）と wrangler.jsonc（Cloudflare が起こす時刻）の2か所にある。
 * 片方だけ直すと、そのジョブは黙って動かなくなる（起こされても worker.ts が見つけられない）。
 */
const root = path.resolve(__dirname, "..");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const wrangler = JSON.parse(stripComments(readFileSync(path.join(root, "wrangler.jsonc"), "utf8"))) as { triggers: { crons: string[] } };
const jobsSource = readFileSync(path.join(root, "src/server/jobs/index.ts"), "utf8");

describe("定期実行の設定", () => {
  it("wrangler.jsonc の時刻と config/cron.ts が一致している", () => {
    expect([...wrangler.triggers.crons].sort()).toEqual(cronJobs.map((j) => j.schedule).sort());
  });

  it("1つの時刻に1つのジョブだけ", () => {
    expect(new Set(cronJobs.map((j) => j.schedule)).size).toBe(cronJobs.length);
  });

  it("config/cron.ts のジョブはすべて実在する", () => {
    for (const { job } of cronJobs) expect(jobsSource).toContain(`"${job}": {`);
  });
});
