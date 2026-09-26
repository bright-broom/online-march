import { z } from "zod";
import { deliveryTimeSlots, noshiOptions, type DeliveryTimeSlot } from "@/config/shipping";

/** Re-exported for existing imports; source of truth is config/shipping.ts */
export { noshiOptions };
import { addressSchema, prefectureSchema } from "./account";



export const giftLimits = { messageMax: 200, noteMax: 500 } as const;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");

export const cartLinesSchema = z
  .array(z.object({ variantId: z.uuid(), quantity: z.coerce.number().int().min(1).max(99) }))
  .min(1, "カートが空です")
  .max(50, "一度にご注文いただける商品数を超えています");

export const couponCodeSchema = z.string().trim().max(32, "クーポンコードが長すぎます");

export const checkoutQuoteSchema = z.object({
  lines: cartLinesSchema,
  prefecture: prefectureSchema,
  desiredDate: ymd.nullish(),
  couponCode: couponCodeSchema.nullish(),
});
export type CheckoutQuoteInput = z.input<typeof checkoutQuoteSchema>;

const timeSlotKeys = Object.keys(deliveryTimeSlots) as [DeliveryTimeSlot, ...DeliveryTimeSlot[]];

export const giftSchema = z.object({
  wrapping: z.boolean(),
  noshi: z.enum(noshiOptions).optional(),
  message: z.string().trim().max(giftLimits.messageMax, `メッセージは${giftLimits.messageMax}文字以内で入力してください`).optional(),
});

export const placeOrderSchema = z.object({
  lines: cartLinesSchema,
  /** either a saved address id, or a new address */
  addressId: z.uuid().nullish(),
  newAddress: addressSchema.nullish(),
  saveAddress: z.boolean().default(false),
  desiredDate: ymd.nullish(),
  timeSlot: z.enum(timeSlotKeys).default("none"),
  gift: giftSchema.nullish(),
  note: z.string().trim().max(giftLimits.noteMax, `備考は${giftLimits.noteMax}文字以内で入力してください`).default(""),
  couponCode: couponCodeSchema.nullish(),
}).refine((v) => v.addressId || v.newAddress, { path: ["address"], message: "お届け先を選択してください" });
export type PlaceOrderInput = z.input<typeof placeOrderSchema>;

export const abandonCheckoutSchema = z.object({ orderId: z.uuid() });

export const confirmCheckoutSchema = z.object({
  orderId: z.uuid(),
  sessionId: z.string().min(1).max(255),
});
