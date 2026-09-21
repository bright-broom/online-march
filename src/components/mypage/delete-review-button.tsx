"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteReview } from "@/server/actions/reviews";

export function DeleteReviewButton({ reviewId, productName }: { reviewId: string; productName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive rounded-full">
          <Trash2 />削除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>レビューを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{productName}」へのレビューを削除します。商品と生産者の評価も計算し直されます。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>戻る</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await deleteReview(reviewId);
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
            {pending && <Spinner />}削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
