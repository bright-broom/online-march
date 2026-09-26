import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { shippingPolicy } from "@/config/shipping";
import { formatDateTime } from "@/lib/format";

/**
 * 配達の問題（#25）。発送済みのあいだだけ出す。自動では配達完了にしないので、運営が判断する
 * （お客さまに届いていれば配達完了に、届かないなら返金）。生産者・運営の注文画面で使う。
 */
export function DeliveryIssueAlert({ status, at, note, audience }: { status: string; at: Date | null; note: string | null; audience: "farmer" | "admin" }) {
  if (status !== "shipped" || !at) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert />
      <AlertTitle>{shippingPolicy.delivery.issueNotice}（{formatDateTime(at)}）</AlertTitle>
      <AlertDescription>
        <p>{note}</p>
        <p>
          {audience === "farmer"
            ? "自動では配達完了になりません。お客さまにご連絡のうえ、再配達や返送の状況を運営にお知らせください。"
            : "自動では配達完了になりません。届いていれば「配達完了」に、届かない場合は返金してください。"}
        </p>
      </AlertDescription>
    </Alert>
  );
}
