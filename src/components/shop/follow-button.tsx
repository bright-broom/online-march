"use client";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import { toggleFollow } from "@/server/actions/engagement";
import { loginHrefForHere, useEngagement } from "./engagement";

export function FollowButton({
  farmId,
  farmName,
  size = "default",
  className,
}: {
  farmId: string;
  farmName: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const status = useEngagement((s) => s.status);
  const following = useEngagement((s) => s.follows.has(farmId));
  const setFollow = useEngagement((s) => s.setFollow);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (status === "guest") {
      router.push(loginHrefForHere(routes.login));
      return;
    }
    const next = !following;
    setFollow(farmId, next);
    startTransition(async () => {
      const res = await toggleFollow(farmId);
      if (!res.ok) {
        setFollow(farmId, !next);
        if (status !== "user") router.push(loginHrefForHere(routes.login));
        else toast.error(res.error);
        return;
      }
      setFollow(farmId, res.data.following);
      toast.success(res.data.following ? `${farmName}をフォローしました` : `${farmName}のフォローを解除しました`, {
        description: res.data.following ? "新商品や収穫のお知らせが届きます" : undefined,
      });
    });
  };

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "outline"}
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      className={cn("rounded-full", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-5", className)}
    >
      {following ? <Check /> : <Plus />}
      {following ? "フォロー中" : "フォローする"}
    </Button>
  );
}
