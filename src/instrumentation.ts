import type { Instrumentation } from "next";

/**
 * 本番のサーバーエラー（ページ表示・Route Handler・Webhook・Server Action から投げられたもの）を運営へ知らせる（#12）。
 * DB を使うので Node.js ランタイムだけ。Server Action の想定外のエラーは runAction が受け止めるので、そちらからも報告している。
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("@/server/services/error-report");
  await reportServerError(err, { kind: context.routeType, path: request.path, method: request.method });
};
