import "server-only";
import { routes } from "@/config/nav";
import { alertAdmins } from "./ops-alerts";

export const serverErrorAlert = {
  title: "サーバーでエラーが発生しました",
  /** 同じ場所・同じ内容のエラーはこの時間内に1回だけ知らせる */
  quietHours: 6,
  /** 内容が違っても1時間にこれ以上は知らせない（障害で大量に出たとき） */
  maxPerHour: 5,
} as const;

const kindLabel: Record<string, string> = {
  render: "ページ表示",
  route: "API",
  action: "操作（Server Action）",
  proxy: "Proxy",
};

/**
 * 本番のサーバーエラーを運営に知らせる（#12）。`instrumentation.ts#onRequestError`（ページ・API・Webhook）と、
 * 想定外のエラーを利用者向けの文言に置き換える `runAction` の両方から呼ばれる。
 * 通知に失敗しても元のエラー処理を邪魔しないよう、ここでは決して throw しない。
 * パスのクエリは落とす（パスワード再設定などのトークンを通知やメールに残さない）。
 */
export async function reportServerError(err: unknown, where: { kind: string; path: string; method?: string }) {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  const path = where.path.split("?")[0];
  console.error(`[server-error] ${where.kind} ${where.method ?? ""} ${path}${digest ? ` digest=${digest}` : ""}`, err);
  try {
    await alertAdmins({
      title: serverErrorAlert.title,
      body: [kindLabel[where.kind] ?? where.kind, `${where.method ?? ""} ${path}`.trim(), message.slice(0, 200), digest && `エラーID ${digest}`].filter(Boolean).join("｜"),
      href: routes.admin.automation,
      quietHours: serverErrorAlert.quietHours,
      maxPerHour: serverErrorAlert.maxPerHour,
      email: true,
    });
  } catch (e) {
    console.error("[server-error] could not alert admins", e);
  }
}
