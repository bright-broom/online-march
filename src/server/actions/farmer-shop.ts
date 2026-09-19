"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { shippingSettingsSchema, shopFormSchema } from "@/lib/validators/farmer";
import { assertFarm } from "@/server/auth/guards";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/** ショップページ編集 (public farm profile). */
export async function saveShop(_prev: unknown, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm();
    const data = parseInput(shopFormSchema, formToObject(formData));
    await db.update(farms).set(data).where(eq(farms.id, farm.id));
    updateTag(tags.farm(farm.id));
    updateTag(tags.farms);
    refresh();
  }, "ショップページを更新しました");
}

/** 出荷・配送設定. */
export async function saveShippingSettings(_prev: unknown, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm();
    const data = parseInput(shippingSettingsSchema, formToObject(formData));
    await db
      .update(farms)
      .set({
        defaultCarrier: data.defaultCarrier,
        leadTimeDays: data.leadTimeDays,
        shipWeekdays: [...new Set(data.shipWeekdays)].sort((a, b) => a - b),
        freeShippingThreshold: data.freeShippingEnabled ? data.freeShippingThreshold : null,
      })
      .where(eq(farms.id, farm.id));
    // shipping settings affect product pages (送料・お届け日の目安)
    updateTag(tags.farm(farm.id));
    updateTag(tags.farmProducts(farm.id));
    refresh();
  }, "出荷・配送設定を保存しました");
}

/** Stripe Connect onboarding → redirects to Stripe (only when Stripe is configured). */
export async function startStripeOnboarding(): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { user, farm } = await assertFarm();
    if (!features.stripe) throw new ActionError("現在はオンライン振込先登録を利用できません。運営からの銀行振込でお支払いします");
    const { createConnectOnboardingLink } = await import("@/server/services/payments/stripe");
    const link = await createConnectOnboardingLink({
      farmId: farm.id,
      accountId: farm.stripeAccountId,
      onboarded: farm.stripeOnboarded,
      email: user.email,
      farmName: farm.name,
    });
    if (link.accountId !== farm.stripeAccountId) {
      await db.update(farms).set({ stripeAccountId: link.accountId }).where(eq(farms.id, farm.id));
    }
    return link.url;
  });
  if (result.ok) redirect(result.data);
  return result;
}
