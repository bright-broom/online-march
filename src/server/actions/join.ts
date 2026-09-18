"use server";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms, user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { randomCode, slugify } from "@/lib/ids";
import { farmApplicationSchema } from "@/lib/validators/join";
import { assertRole } from "@/server/auth/guards";
import { notifyMany } from "@/server/services/notify";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * 出店申請: customer が農園情報を送信 → farms.status = pending → 運営へ通知。
 * 承認（status=active & role=farmer）は admin 側の action が行う。
 */
export async function submitFarmApplication(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ farmName: string }>> {
  return runAction(async () => {
    const me = await assertRole("customer");
    const input = parseInput(farmApplicationSchema, formToObject(formData));

    const existing = await db.query.farms.findFirst({ where: eq(farms.ownerId, me.id), columns: { id: true } });
    if (existing) throw new ActionError("すでに出店申請を受け付けています。審査結果をお待ちください");

    const slug = `${slugify(input.farmName)}-${randomCode(4).toLowerCase()}`;
    const inserted = await db
      .insert(farms)
      .values({
        ownerId: me.id,
        slug,
        name: input.farmName,
        representative: input.representative,
        phone: input.phone,
        postalCode: input.postalCode,
        prefecture: input.prefecture,
        city: input.city,
        addressLine: input.addressLine,
        tagline: input.tagline,
        story: input.story,
        cultivationMethods: input.cultivationMethods,
        status: "pending",
      })
      .onConflictDoNothing({ target: farms.ownerId })
      .returning({ id: farms.id });
    if (!inserted.length) throw new ActionError("すでに出店申請を受け付けています。審査結果をお待ちください");

    const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
    await notifyMany(
      admins.map((a) => ({
        userId: a.id,
        type: "system" as const,
        title: "新しい出店申請が届きました",
        body: `${input.farmName}（${input.representative}）から出店申請がありました。内容を確認してください。`,
        href: routes.admin.farms,
      })),
    );

    updateTag(tags.farms);
    return { farmName: input.farmName };
  }, "出店申請を受け付けました。運営からのご連絡をお待ちください");
}
