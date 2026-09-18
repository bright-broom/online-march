"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { confirmStripeCheckout } from "@/server/actions/checkout";
import { useCart } from "@/stores/cart";

/**
 * Runs once on the success page: clears the cart and, when returning from Stripe with the
 * order still pending, verifies the session server-side (webhook may lag) then refreshes.
 */
export function SuccessEffects({ orderId, sessionId, pending }: { orderId: string; sessionId: string | null; pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    useCart.getState().clear();
    if (!pending || !sessionId) return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      const res = await confirmStripeCheckout({ orderId, sessionId });
      if (cancelled) return;
      if (res.ok && res.data.paid) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (attempts < 5) setTimeout(check, 2000 * attempts);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [orderId, sessionId, pending, router]);
  return null;
}
