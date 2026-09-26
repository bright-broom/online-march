import "server-only";
import type { AuditAction } from "@/config/audit";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { reportServerError } from "./error-report";

type Actor = { id: string; email: string };

/**
 * 運営の操作を記録する（#19）。操作が成功したあとに呼ぶ。
 * 記録に失敗しても、すでに済んだ操作（返金など）を失敗に見せない。代わりに運営へエラーとして知らせる。
 */
export async function recordAudit(
  actor: Actor,
  entry: { action: AuditAction; target?: { type: string; id: string }; summary: string; detail?: Record<string, unknown> },
) {
  try {
    await db.insert(adminAuditLogs).values({
      actorId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.target?.type ?? null,
      targetId: entry.target?.id ?? null,
      summary: entry.summary,
      detail: entry.detail ?? {},
    });
  } catch (e) {
    await reportServerError(e, { kind: "action", path: `操作記録の保存（${entry.action}）` });
  }
}
