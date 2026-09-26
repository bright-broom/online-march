import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { reportServerError } from "@/server/services/error-report";

/** Uniform return type for every Server Action (consumed by useActionState / toast). */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Expected, user-facing failure. Message is shown in a toast. */
export class ActionError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ActionError("入力内容を確認してください", fieldErrors);
  }
  return result.data;
}

/**
 * Wrap action bodies: converts ActionError → {ok:false}, rethrows redirect/notFound,
 * logs unexpected errors without leaking details.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ActionError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    // unexpected: the user sees a generic message, so the operator has to hear about it (#12)
    await reportServerError(err, { kind: "action", path: "Server Action" });
    return { ok: false, error: "エラーが発生しました。時間をおいて再度お試しください。" };
  }
}

/** FormData → plain object (multi-value keys become arrays when suffixed with []). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) ((out[k.slice(0, -2)] ??= []) as unknown[]).push(v);
    else out[k] = v;
  }
  return out;
}
