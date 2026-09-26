"use client";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { acceptStaffInvite } from "@/server/actions/farm-staff";

export function AcceptStaffInvite({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-11 rounded-full px-6"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptStaffInvite({ token });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(res.message ?? "参加しました");
          router.push(routes.farmer.orders);
        })
      }
    >
      {pending ? <Spinner /> : <Check />}スタッフとして参加する
    </Button>
  );
}
