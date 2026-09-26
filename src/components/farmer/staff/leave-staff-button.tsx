"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { leaveStaff } from "@/server/actions/farm-staff";

/** スタッフが自分から抜ける（#24）。アカウントは購入者のまま残る */
export function LeaveStaffButton({ farmName }: { farmName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="rounded-full" disabled={pending}><LogOut />スタッフを抜ける</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>「{farmName}」のスタッフを抜けますか？</AlertDialogTitle>
          <AlertDialogDescription>生産者画面に入れなくなります。アカウントはそのまま残り、お買い物はこれまでどおりできます。もう一度参加するにはオーナーの招待が必要です。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const res = await leaveStaff();
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message ?? "抜けました");
                router.push(routes.mypage.root);
              })
            }
          >
            抜ける
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
