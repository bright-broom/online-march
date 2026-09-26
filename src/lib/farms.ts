import type { FarmStatus } from "@/db/schema";

/**
 * 出店申請が見送られた（却下された）農園。却下は一度も承認されていない農園を `suspended` にするので、
 * 承認後に停止した農園（approvedAt あり）と区別できる。再申請はこの状態からだけ受け付ける（#15）。
 */
export function isRejectedApplication(farm: { status: FarmStatus; approvedAt: Date | string | null }) {
  return farm.status === "suspended" && !farm.approvedAt;
}
