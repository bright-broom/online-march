"use client";
import { PackageCheck } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { confirmReceived } from "@/server/actions/account";

/** 発送済みの荷物の「受け取りました」（#25）。押すとその場で配達完了になり、レビューが書けるようになる */
export function ConfirmReceivedButton({ farmOrderId }: { farmOrderId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await confirmReceived(farmOrderId);
          if (res.ok) toast.success(res.message ?? "受け取りを確認しました");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Spinner /> : <PackageCheck />}受け取りました
    </Button>
  );
}
