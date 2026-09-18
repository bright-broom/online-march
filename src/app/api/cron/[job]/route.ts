import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isJobName, runJob } from "@/server/jobs";

/** Vercel Cron entrypoint. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const { job } = await ctx.params;
  if (env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.CRON_SECRET && env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isJobName(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const result = await runJob(job, "cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
