import { Clock, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { farmStatusMeta } from "@/config/status";
import type { FarmStatus } from "@/db/schema";

const copy: Record<Exclude<FarmStatus, "active">, { icon: typeof Clock; body: string }> = {
  pending: {
    icon: Clock,
    body: "運営が出店内容を確認しています。承認されるまでストアには表示されませんが、商品登録やショップページの準備は今から進められます。",
  },
  suspended: {
    icon: ShieldAlert,
    body: "現在ショップは停止されており、ストアに表示されていません。詳しくは運営までお問い合わせください。進行中のご注文の発送は引き続き行え、その売上は通常どおり精算されます。",
  },
};

/** Shown above every /farmer page while the farm is not active. */
export function FarmStatusBanner({ status }: { status: FarmStatus }) {
  if (status === "active") return null;
  const { icon: IconC, body } = copy[status];
  return (
    <Alert variant={status === "suspended" ? "destructive" : "default"} className="no-print mb-6 border-primary/30 bg-primary/5">
      <IconC />
      <AlertTitle>ショップの状態：{farmStatusMeta[status].label}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
