"use client";
import { XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cancelOrder } from "@/server/actions/account";

export function CancelOrderButton({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <XCircle />注文をキャンセル
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ご注文をキャンセルしますか？</AlertDialogTitle>
          <AlertDialogDescription>
            注文番号 {orderCode} のすべての商品がキャンセルされます。お支払い済みの場合は返金手続きを行います。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>戻る</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await cancelOrder(orderId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(res.message);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {pending && <Spinner />}キャンセルする
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
