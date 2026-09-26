"use server";
import { readSettingsUncached } from "@/server/queries/settings";
import { and, count, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import type { DeliveryTimeSlot } from "@/config/shipping";
import { db } from "@/db";
import { addresses, orders, type AddressSnapshot, type Carrier } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { abandonCheckoutSchema, checkoutQuoteSchema, confirmCheckoutSchema, placeOrderSchema, type CheckoutQuoteInput, type PlaceOrderInput } from "@/lib/validators/checkout";
import { rateLimits } from "@/config/rate-limits";
import { assertUser } from "@/server/auth/guards";
import { consumeRateLimit, isRateLimited } from "@/server/services/rate-limit";
import { abandonCheckout, createOrder, expireUnpaidOrder, markOrderPaid, quoteCart, type AbandonedCheckout, type CartQuote } from "@/server/services/orders";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/* ───────────── DTO (client-safe: no owner ids / commission) ───────────── */

export type CheckoutQuote = {
  farms: {
    farmId: string;
    farmName: string;
    farmSlug: string;
    lines: {
      variantId: string;
      productSlug: string;
      productName: string;
      variantLabel: string;
      imageUrl: string | null;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      stock: number;
    }[];
    subtotal: number;
    discount: number;
    shippingFee: number;
    isFreeShipping: boolean;
    freeShippingThreshold: number | null;
    carrier: Carrier;
    boxSize: number;
    boxCount: number;
    zoneLabel: string;
    shipByDate: string;
    estimatedDeliveryDate: string;
  }[];
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  unavailable: string[];
  /** そのうち「農園がお休み中」で買えないもの（待てばまた買えることを伝えるため） */
  pausedFarms: { name: string; until: string }[];
  earliestDeliveryDate: string;
  latestSelectableDate: string;
};

function toDto(q: CartQuote): CheckoutQuote {
  return {
    farms: q.farms.map((g) => ({
      farmId: g.farm.id,
      farmName: g.farm.name,
      farmSlug: g.farm.slug,
      lines: g.lines.map((l) => ({
        variantId: l.variantId,
        productSlug: l.productSlug,
        productName: l.productName,
        variantLabel: l.variantLabel,
        imageUrl: l.imageUrl,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
        stock: l.stock,
      })),
      subtotal: g.subtotal,
      discount: g.discount,
      shippingFee: g.shipping.fee,
      isFreeShipping: g.shipping.isFree,
      freeShippingThreshold: g.farm.freeShippingThreshold,
      carrier: g.shipping.carrier,
      boxSize: g.shipping.boxSize,
      boxCount: g.shipping.boxCount,
      zoneLabel: g.shipping.zoneLabel,
      shipByDate: g.schedule.shipByDate,
      estimatedDeliveryDate: g.schedule.estimatedDeliveryDate,
    })),
    subtotal: q.subtotal,
    shippingTotal: q.shippingTotal,
    discountTotal: q.discountTotal,
    total: q.total,
    coupon: q.coupon ? { code: q.coupon.code, description: q.coupon.description } : null,
    couponError: q.couponError,
    unavailable: q.unavailable,
    pausedFarms: q.pausedFarms,
    earliestDeliveryDate: q.earliestDeliveryDate,
    latestSelectableDate: q.latestSelectableDate,
  };
}

/** Authoritative re-quote of the client cart (prices, stock, shipping, schedule, coupon). */
export async function getCheckoutQuote(input: CheckoutQuoteInput): Promise<ActionResult<CheckoutQuote>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(checkoutQuoteSchema, input);
    // クーポンコードの総当たり対策（#21）: 使えないコードの入力を数え、上限を超えたらコードを見ずに断る（見積もり自体は返す）
    const couponCode = data.couponCode || null;
    const blocked = couponCode ? await isRateLimited("couponMiss", me.id) : false;
    const quote = await quoteCart({
      lines: data.lines,
      prefecture: data.prefecture,
      desiredDate: data.desiredDate ?? null,
      couponCode: blocked ? null : couponCode,
      now: new Date(),
    });
    if (blocked) return { ...toDto(quote), couponError: rateLimits.couponMiss.message };
    if (couponCode && quote.couponError) await consumeRateLimit("couponMiss", me.id);
    return toDto(quote);
  });
}

/**
 * Creates the order (atomic stock reservation) and starts payment.
 * - Stripe: returns `{ redirectUrl }` to Stripe Checkout.
 * - Demo:   marks the order paid immediately and returns `{ orderId }`.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<ActionResult<{ orderId: string; redirectUrl?: string }>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(placeOrderSchema, input);
    const now = new Date();
    if ((await readSettingsUncached()).maintenanceMode) {
      throw new ActionError("ただいまメンテナンス中のため、ご注文を受け付けていません。しばらくしてから再度お試しください。");
    }

    // 1. resolve address (saved addresses are scoped to the user)
    let address: AddressSnapshot;
    if (data.addressId) {
      const saved = await db.query.addresses.findFirst({ where: and(eq(addresses.id, data.addressId), eq(addresses.userId, me.id)) });
      if (!saved) throw new ActionError("お届け先が見つかりません。選び直してください。");
      address = {
        recipientName: saved.recipientName,
        recipientKana: saved.recipientKana,
        postalCode: saved.postalCode,
        prefecture: saved.prefecture,
        city: saved.city,
        line1: saved.line1,
        line2: saved.line2,
        phone: saved.phone,
      };
    } else {
      const a = data.newAddress!;
      address = {
        recipientName: a.recipientName,
        recipientKana: a.recipientKana,
        postalCode: a.postalCode,
        prefecture: a.prefecture,
        city: a.city,
        line1: a.line1,
        line2: a.line2,
        phone: a.phone,
      };
    }

    // 2. validate desired date against the current delivery window
    if (data.desiredDate) {
      const pre = await quoteCart({ lines: data.lines, prefecture: address.prefecture, now });
      if (data.desiredDate < pre.earliestDeliveryDate || data.desiredDate > pre.latestSelectableDate) {
        throw new ActionError("お届け希望日が指定できる期間外です。日付を選び直してください。", { desiredDate: ["指定できる期間外です"] });
      }
    }

    // 3. create order (throws ActionError on stock / coupon problems)
    const gift = data.gift && (data.gift.wrapping || data.gift.noshi || data.gift.message) ? data.gift : null;
    const { order, quote } = await createOrder({
      userId: me.id,
      email: me.email,
      lines: data.lines,
      address,
      desiredDeliveryDate: data.desiredDate ?? null,
      deliveryTimeSlot: data.timeSlot as DeliveryTimeSlot,
      gift,
      note: data.note,
      couponCode: data.couponCode || null,
      paymentProvider: features.stripe ? "stripe" : "demo",
      now,
    });

    // 4. optionally remember the new address
    if (!data.addressId && data.saveAddress && data.newAddress) {
      const [{ n }] = await db.select({ n: count() }).from(addresses).where(eq(addresses.userId, me.id));
      await db.insert(addresses).values({ ...data.newAddress, userId: me.id, isDefault: n === 0 });
    }

    // stock changed → refresh catalog entries of purchased products
    for (const g of quote.farms) for (const l of g.lines) updateTag(tags.product(l.productId));

    // 5. payment
    if (features.stripe) {
      const { createCheckoutSession } = await import("@/server/services/payments/stripe");
      try {
        const session = await createCheckoutSession({
          orderId: order.id,
          orderCode: order.code,
          email: me.email,
          lines: quote.farms.flatMap((g) =>
            g.lines.map((l) => ({
              name: `${l.productName}（${l.variantLabel}）`,
              description: g.farm.name,
              unitAmount: l.unitPrice,
              quantity: l.quantity,
              image: l.imageUrl,
            })),
          ),
          shippingTotal: quote.shippingTotal,
          discountTotal: quote.discountTotal,
        });
        await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, order.id));
        if (!session.url) throw new Error("Stripe session has no url");
        return { orderId: order.id, redirectUrl: session.url };
      } catch (err) {
        console.error("[placeOrder] stripe", err);
        await expireUnpaidOrder(order.id, new Date()); // release reserved stock
        throw new ActionError("決済ページを開けませんでした。時間をおいて再度お試しください。");
      }
    }

    await markOrderPaid(order.id, { now });
    return { orderId: order.id };
  });
}

/**
 * Called from /checkout/success after returning from Stripe (webhook may lag).
 * Verifies the Checkout Session belongs to the user's order, then marks it paid (idempotent).
 */
export async function confirmStripeCheckout(input: { orderId: string; sessionId: string }): Promise<ActionResult<{ paid: boolean }>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(confirmCheckoutSchema, input);
    const order = await db.query.orders.findFirst({ where: and(eq(orders.id, data.orderId), eq(orders.userId, me.id)) });
    if (!order) throw new ActionError("注文が見つかりません");
    if (order.status !== "pending_payment") return { paid: order.status === "paid" };
    if (!features.stripe) return { paid: false };
    const { getStripe } = await import("@/server/services/payments/stripe");
    const session = await getStripe().checkout.sessions.retrieve(data.sessionId);
    const matches = session.metadata?.orderId === order.id || session.client_reference_id === order.id;
    if (!matches) throw new ActionError("決済情報を確認できませんでした");
    if (session.payment_status !== "paid") return { paid: false };
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
    await markOrderPaid(order.id, { sessionId: session.id, paymentIntentId, now: new Date() });
    return { paid: true };
  });
}

/**
 * Called from /cart when the customer comes back from Stripe Checkout with「戻る」(#17).
 * Cancels the unpaid order right away so its stock and coupon are not held for the full payment window.
 */
export async function cancelAbandonedCheckout(input: { orderId: string }): Promise<ActionResult<AbandonedCheckout>> {
  return runAction(async () => {
    const me = await assertUser();
    const { orderId } = parseInput(abandonCheckoutSchema, input);
    const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, me.id)) });
    if (!order) throw new ActionError("注文が見つかりません");
    const stripe = features.stripe ? await import("@/server/services/payments/stripe") : null;
    return abandonCheckout(order, new Date(), stripe && stripe.resolveStaleCheckout);
  });
}
