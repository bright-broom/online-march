import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutSkeleton } from "@/components/checkout/checkout-skeleton";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { routes } from "@/config/nav";
import { features } from "@/lib/env";
import { requireUser } from "@/server/auth/guards";
import { listAddresses } from "@/server/queries/account";

export const metadata: Metadata = { title: "ご購入手続き", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="eyebrow">Checkout</p>
          <h1 className="heading-display text-3xl sm:text-4xl">ご購入手続き</h1>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Lock className="size-3.5" />通信は暗号化され、安全に保護されています
        </p>
      </div>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutGate />
      </Suspense>
    </div>
  );
}

async function CheckoutGate() {
  const user = await requireUser(routes.checkout);
  const addresses = await listAddresses(user.id);
  return <CheckoutView addresses={addresses} customerName={user.name} paymentMode={features.stripe ? "stripe" : "demo"} />;
}
