"use client";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { routes } from "@/config/nav";
import { checkoutCanceledCopy, checkoutCanceledParam } from "@/config/payments";
import { cancelAbandonedCheckout } from "@/server/actions/checkout";
import type { AbandonedCheckout } from "@/server/services/orders";
import { useCart } from "@/stores/cart";

/**
 * Stripe の決済画面で「戻る」を押して /cart に帰ってきたとき（#17）。その注文をすぐ取り消して在庫とクーポンを戻し、
 * 何が起きたかを伝える。支払いが済んでいた・コンビニ払いの番号を受け取っていた場合は取り消さずにそう案内する。
 */
export function CheckoutCanceledNotice() {
  const params = useSearchParams();
  const orderId = params.get(checkoutCanceledParam);
  const router = useRouter();
  const pathname = usePathname();
  const [result, setResult] = useState<{ kind: AbandonedCheckout["kind"]; orderId: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;
    void cancelAbandonedCheckout({ orderId }).then((res) => {
      const kind = res.ok ? res.data.kind : "not_pending";
      if (kind === "paid") useCart.getState().clear();
      setResult({ kind, orderId });
      router.replace(pathname, { scroll: false }); // a reload must not run this again
    });
  }, [orderId, pathname, router]);

  if (!result) return null;
  const copy = checkoutCanceledCopy[result.kind];
  const done = result.kind === "paid" || result.kind === "awaiting_payment";
  return (
    <Alert className="mb-6">
      {done ? <CircleCheck /> : <CircleAlert />}
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.body}</p>
        {result.kind !== "cancelled" && (
          <Link href={routes.mypage.order(result.orderId)} className="font-medium underline underline-offset-4">
            ご注文の状況を見る
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
