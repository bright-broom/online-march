"use client";
import { Heart, Search, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEngagement } from "@/components/shop/engagement";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { routes } from "@/config/nav";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { cartCount, useCart, useCartSheet } from "@/stores/cart";

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="bg-primary text-primary-foreground num absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold motion-safe:animate-in motion-safe:zoom-in-50">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function HeaderCartButton({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const count = useCart((s) => cartCount(s.items));
  const setOpen = useCartSheet((s) => s.setOpen);
  const n = hydrated ? count : 0;
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("relative rounded-full", className)}
      onClick={() => setOpen(true)}
      aria-label={n ? `カートを開く（${n}点）` : "カートを開く"}
    >
      <ShoppingBag className="size-5" />
      <CountBadge n={n} />
    </Button>
  );
}

export function HeaderFavoritesButton({ className }: { className?: string }) {
  const count = useEngagement((s) => (s.status === "user" ? s.favorites.size : 0));
  return (
    <Button asChild variant="ghost" size="icon-lg" className={cn("relative rounded-full", className)}>
      <Link href={routes.mypage.favorites} aria-label={count ? `お気に入り（${count}件）` : "お気に入り"}>
        <Heart className="size-5" />
        <CountBadge n={count} />
      </Link>
    </Button>
  );
}

/** Keyword search → /products?q= */
export function HeaderSearch({ className, autoFocus, onSubmitted }: { className?: string; autoFocus?: boolean; onSubmitted?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `${routes.products}?q=${encodeURIComponent(term)}` : routes.products);
        onSubmitted?.();
      }}
    >
      <InputGroup className="bg-muted/60 focus-within:bg-background h-9 rounded-full border-transparent transition-colors">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="品種・農家さんで検索"
          aria-label="商品を検索"
          enterKeyHint="search"
          autoFocus={autoFocus}
        />
      </InputGroup>
    </form>
  );
}
