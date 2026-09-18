import "server-only";
import { revalidateTag } from "next/cache";

/**
 * Expire cache tags immediately. Works in Server Actions, Route Handlers and cron jobs.
 * (In Server Actions you may use updateTag() directly for read-your-own-writes.)
 */
export function expireTags(...tags: (string | false | null | undefined)[]) {
  for (const t of tags) if (t) revalidateTag(t, { expire: 0 });
}
