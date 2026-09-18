"use client";
import { ArrowLeft, ShoppingBasket, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { prefectures, type DeliveryTimeSlot, type Prefecture } from "@/config/shipping";
import { useHydrated } from "@/hooks/use-hydrated";
import { addressSchema, fieldErrorsOf } from "@/lib/validators/account";
import { giftSchema, type noshiOptions } from "@/lib/validators/checkout";
import { getCheckoutQuote, placeOrder, type CheckoutQuote } from "@/server/actions/checkout";
import type { SavedAddress } from "@/server/queries/account";
import { useCart } from "@/stores/cart";
import { AddressStep, NEW_ADDRESS } from "./address-step";
import { emptyAddressDraft, type AddressDraft } from "./address-fields";
import { CheckoutSkeleton } from "./checkout-skeleton";
import { CouponField } from "./coupon-field";
import { DeliveryStep } from "./delivery-step";
import { GiftStep, type GiftDraft } from "./gift-step";
import { OrderSummary, type PaymentMode } from "./order-summary";
import { StepSection } from "./step-section";

const isPrefecture = (p: string): p is Prefecture => (prefectures as readonly string[]).includes(p);

export function CheckoutView({
  addresses, customerName, paymentMode,
}: {
  addresses: SavedAddress[];
  customerName: string;
  paymentMode: PaymentMode;
}) {
  const hydrated = useHydrated();
  const items = useCart((s) => s.items);
  const clearCart = useCart((s) => s.clear);
  const router = useRouter();

  const [choice, setChoice] = useState<string>(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? NEW_ADDRESS);
  const [draft, setDraft] = useState<AddressDraft>(() => emptyAddressDraft(customerName));
  const [saveNew, setSaveNew] = useState(true);
  const [desiredDate, setDesiredDate] = useState<string | null>(null);
  const [timeSlot, setTimeSlot] = useState<DeliveryTimeSlot>("none");
  const [gift, setGift] = useState<GiftDraft>({ wrapping: false, noshi: "", message: "" });
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [redirecting, setRedirecting] = useState<null | "payment" | "complete">(null);

  const [quoteState, setQuoteState] = useState<{ key: string; data: CheckoutQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();
  const [placing, startPlace] = useTransition();
  const requestId = useRef(0);

  const lines = useMemo(() => items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), [items]);
  const linesKey = JSON.stringify(lines);
  const prefecture = choice === NEW_ADDRESS ? draft.prefecture : (addresses.find((a) => a.id === choice)?.prefecture ?? "");
  const canQuote = hydrated && lines.length > 0 && isPrefecture(prefecture);
  const quoteKey = JSON.stringify([linesKey, prefecture, desiredDate, couponCode]);
  const quote = quoteState?.data ?? null;
  const fresh = quoteState?.key === quoteKey;

  // Authoritative server quote — debounced, latest request wins.
  useEffect(() => {
    if (!canQuote) return;
    const id = ++requestId.current;
    const key = quoteKey;
    const timer = setTimeout(() => {
      startQuote(async () => {
        const res = await getCheckoutQuote({ lines: JSON.parse(linesKey), prefecture: prefecture as Prefecture, desiredDate, couponCode });
        if (id !== requestId.current) return;
        if (!res.ok) {
          setQuoteError(res.error);
          return;
        }
        setQuoteError(null);
        setQuoteState({ key, data: res.data });
        const { earliestDeliveryDate: e, latestSelectableDate: l } = res.data;
        setDesiredDate((d) => (d && (d < e || d > l) ? null : d));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [canQuote, linesKey, prefecture, desiredDate, couponCode, quoteKey]);

  if (!hydrated) return <CheckoutSkeleton />;

  if (redirecting) {
    return (
      <div className="bg-card flex flex-col items-center gap-4 rounded-2xl border px-6 py-20 text-center" role="status" aria-live="polite">
        <Spinner className="text-primary size-8" />
        <p className="heading-display text-xl">{redirecting === "payment" ? "決済ページへ移動しています" : "ご注文を確定しています"}</p>
        <p className="text-muted-foreground text-sm">画面を閉じずにそのままお待ちください。</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={ShoppingBasket} title="カートに商品がありません" description="気になる玉ねぎをカートに入れてから、ご購入手続きへお進みください。" className="bg-card rounded-2xl border py-16">
        <Button asChild className="rounded-full">
          <Link href={routes.products}>商品をさがす</Link>
        </Button>
      </EmptyState>
    );
  }

  const activeQuote = canQuote ? quote : null;
  const unavailableItems = activeQuote ? items.filter((i) => activeQuote.unavailable.includes(i.variantId)) : [];
  const stockIssues = activeQuote ? activeQuote.farms.flatMap((f) => f.lines).filter((l) => l.quantity > l.stock) : [];
  const couponBlocking = !!couponCode && !!activeQuote?.couponError;
  const canPlace = !!activeQuote && fresh && !quoting && unavailableItems.length === 0 && stockIssues.length === 0 && !couponBlocking;
  const itemCount = items.reduce((a, i) => a + i.quantity, 0);
  const fallbackSubtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);

  function handlePlace() {
    if (!activeQuote) return;
    const nextErrors: Record<string, string | undefined> = {};
    let newAddress: ReturnType<typeof addressSchema.parse> | null = null;
    if (choice === NEW_ADDRESS) {
      const parsed = addressSchema.safeParse({ ...draft, label: "お届け先" });
      if (parsed.success) newAddress = parsed.data;
      else Object.assign(nextErrors, fieldErrorsOf(parsed.error));
    }
    const giftPayload = gift.wrapping ? { wrapping: true, noshi: (gift.noshi || undefined) as (typeof noshiOptions)[number] | undefined, message: gift.message.trim() || undefined } : null;
    if (giftPayload) {
      const g = giftSchema.safeParse(giftPayload);
      if (!g.success) for (const [k, v] of Object.entries(fieldErrorsOf(g.error))) nextErrors[`gift.${k}`] = v;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("入力内容を確認してください");
      document.getElementById("step-1")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    startPlace(async () => {
      const res = await placeOrder({
        lines,
        addressId: choice === NEW_ADDRESS ? null : choice,
        newAddress,
        saveAddress: choice === NEW_ADDRESS && saveNew,
        desiredDate,
        timeSlot,
        gift: giftPayload,
        note,
        couponCode: activeQuote.coupon ? couponCode : null,
      });
      if (!res.ok) {
        if (res.fieldErrors) {
          const mapped: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) mapped[k.replace(/^newAddress\./, "")] = v?.[0];
          setErrors(mapped);
        }
        toast.error(res.error);
        return;
      }
      if (res.data.redirectUrl) {
        setRedirecting("payment");
        window.location.assign(res.data.redirectUrl);
        return;
      }
      setRedirecting("complete");
      clearCart();
      router.push(`${routes.checkoutSuccess}?order=${res.data.orderId}`);
    });
  }

  const addressDone = choice !== NEW_ADDRESS || isPrefecture(draft.prefecture);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        {(unavailableItems.length > 0 || stockIssues.length > 0) && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>ご購入いただけない商品があります</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {unavailableItems.map((i) => (
                  <li key={i.variantId}>{i.productName}（{i.variantLabel}）は現在販売していません</li>
                ))}
                {stockIssues.map((l) => (
                  <li key={l.variantId}>{l.productName}（{l.variantLabel}）の在庫が不足しています（残り{l.stock}点）</li>
                ))}
              </ul>
              <Link href={routes.cart} className="mt-1 inline-flex items-center gap-1 font-medium underline underline-offset-4">
                <ArrowLeft className="size-3.5" />カートで数量を変更する
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {quoteError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{quoteError}</AlertDescription>
          </Alert>
        )}

        <StepSection step={1} title="お届け先" description="農家さんから直接この住所へ発送されます" done={addressDone && !errors.recipientName}>
          <AddressStep
            addresses={addresses}
            choice={choice}
            onChoice={(v) => {
              setChoice(v);
              setErrors({});
            }}
            draft={draft}
            onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            errors={errors}
            save={saveNew}
            onSave={setSaveNew}
          />
        </StepSection>

        <StepSection step={2} title="お届け日時" description="生産者ごとの出荷日から、全員がお届けできる日を指定できます" done={!!activeQuote}>
          <DeliveryStep
            quote={activeQuote}
            loading={quoting || (canQuote && !fresh)}
            desiredDate={desiredDate}
            onDesiredDate={setDesiredDate}
            timeSlot={timeSlot}
            onTimeSlot={setTimeSlot}
            error={errors.desiredDate}
          />
        </StepSection>

        <StepSection step={3} title="ギフト・ご要望" description="のし・メッセージカードに対応しています">
          <GiftStep gift={gift} onGift={(patch) => setGift((g) => ({ ...g, ...patch }))} note={note} onNote={setNote} errors={errors} />
        </StepSection>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <OrderSummary
          quote={activeQuote}
          fallbackSubtotal={fallbackSubtotal}
          itemCount={itemCount}
          loading={quoting || (canQuote && !fresh)}
          placing={placing}
          canPlace={canPlace}
          paymentMode={paymentMode}
          onPlace={handlePlace}
          coupon={
            <CouponField
              code={couponCode}
              onApply={setCouponCode}
              onRemove={() => setCouponCode(null)}
              applied={activeQuote?.coupon ?? null}
              error={couponCode ? (activeQuote?.couponError ?? null) : null}
              discount={activeQuote?.discountTotal ?? 0}
              loading={quoting}
            />
          }
        />
        <p className="text-muted-foreground mt-3 text-center text-xs">
          <Link href={routes.cart} className="hover:text-foreground underline-offset-4 hover:underline">カートに戻る</Link>
        </p>
      </aside>
    </div>
  );
}
