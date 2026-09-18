"use client";
import { CartContents } from "@/components/shop/cart/cart-contents";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHydrated } from "@/hooks/use-hydrated";
import { cartCount, useCart, useCartSheet } from "@/stores/cart";

/** Slide-over cart. Mounted once in the shop layout; opened via useCartSheet(). */
export function CartSheet() {
  const open = useCartSheet((s) => s.open);
  const setOpen = useCartSheet((s) => s.setOpen);
  const count = useCart((s) => cartCount(s.items));
  const hydrated = useHydrated();
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="px-4 pt-5 pb-3">
          <SheetTitle className="heading-display flex items-baseline gap-2 text-xl">
            カート
            {hydrated && count > 0 && <span className="num text-muted-foreground text-sm font-normal">{count}点</span>}
          </SheetTitle>
          <SheetDescription className="text-xs">農家さんごとに箱詰めして直送します。</SheetDescription>
        </SheetHeader>
        <CartContents variant="sheet" onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
