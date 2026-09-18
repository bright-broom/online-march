"use client";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/server/actions/engagement";
import { loginHrefForHere, useEngagement } from "./engagement";

/** Heart toggle. Guests are sent to login and brought back to the current page. */
export function FavoriteButton({
  productId,
  productName,
  variant = "overlay",
  className,
}: {
  productId: string;
  productName: string;
  variant?: "overlay" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const status = useEngagement((s) => s.status);
  const active = useEngagement((s) => s.favorites.has(productId));
  const setFavorite = useEngagement((s) => s.setFavorite);
  const [pending, startTransition] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === "guest") {
      router.push(loginHrefForHere(routes.login));
      return;
    }
    const next = !active;
    setFavorite(productId, next);
    startTransition(async () => {
      const res = await toggleFavorite(productId);
      if (!res.ok) {
        setFavorite(productId, !next);
        if (status !== "user") router.push(loginHrefForHere(routes.login));
        else toast.error(res.error);
        return;
      }
      setFavorite(productId, res.data.favorited);
      toast.success(res.data.favorited ? "お気に入りに追加しました" : "お気に入りから外しました", {
        description: productName,
        action: res.data.favorited
          ? { label: "一覧を見る", onClick: () => router.push(routes.mypage.favorites) }
          : undefined,
      });
    });
  };

  const label = active ? `${productName}をお気に入りから外す` : `${productName}をお気に入りに追加`;

  if (variant === "outline") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        aria-pressed={active}
        aria-label={label}
        className={cn("h-12 rounded-full px-4", className)}
      >
        <Heart className={cn("size-5 transition-colors", active && "fill-onion-red text-onion-red")} />
        <span className="hidden sm:inline">{active ? "お気に入り済み" : "お気に入り"}</span>
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "bg-background/85 text-foreground hover:bg-background focus-visible:ring-ring/50 inline-flex size-10 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition-all outline-none focus-visible:ring-3 active:scale-90 disabled:opacity-70",
        className,
      )}
    >
      <Heart className={cn("size-[18px] transition-all duration-300", active ? "fill-onion-red text-onion-red scale-110" : "")} />
    </button>
  );
}
