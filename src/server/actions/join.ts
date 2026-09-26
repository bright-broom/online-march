"use server";
import { and, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { joinContent } from "@/config/content";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmMembers, farms, user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { isRejectedApplication } from "@/lib/farms";
import { randomCode, slugify } from "@/lib/ids";
import { farmApplicationSchema } from "@/lib/validators/join";
import { assertRole } from "@/server/auth/guards";
import { notifyMany } from "@/server/services/notify";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * 出店申請: customer が農園情報を送信 → farms.status = pending → 運営へ通知。
 * 見送られた（却下された）申請は、内容を直して出し直せる（#15）。
 * 承認（status=active & role=farmer）は admin 側の action が行う。
 */
export async function submitFarmApplication(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ farmName: string }>> {
  return runAction(async () => {
    const me = await assertRole("customer");
    // 1人1農園（#24）: よその農園のスタッフのままでは出店できない（承認でロールが farmer になると、所属が黙って効かなくなる）
    const membership = await db.query.farmMembers.findFirst({ where: eq(farmMembers.userId, me.id), columns: { id: true } });
    if (membership) throw new ActionError(joinContent.staffMember);
    const input = parseInput(farmApplicationSchema, formToObject(formData));

    const existing = await db.query.farms.findFirst({ where: eq(farms.ownerId, me.id), columns: { id: true, status: true, approvedAt: true } });
    if (existing && !isRejectedApplication(existing)) throw new ActionError("すでに出店申請を受け付けています。審査結果をお待ちください");

    const application = {
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
      status: "pending" as const,
    };
    let resubmitted = false;
    if (existing) {
      // 見送られた申請の出し直し（#15）: farms.ownerId は一意なので同じ行を書き換えて審査に戻す。
      // createdAt は /join と運営画面で「申請日」として出しているので出し直した日にする
      const [updated] = await db
        .update(farms)
        .set({ ...application, createdAt: new Date() })
        .where(and(eq(farms.id, existing.id), eq(farms.status, "suspended"), isNull(farms.approvedAt)))
        .returning({ id: farms.id });
      if (!updated) throw new ActionError("すでに出店申請を受け付けています。審査結果をお待ちください");
      resubmitted = true;
    } else {
      const slug = `${slugify(input.farmName)}-${randomCode(4).toLowerCase()}`;
      const inserted = await db
        .insert(farms)
        .values({ ...application, ownerId: me.id, slug })
        .onConflictDoNothing({ target: farms.ownerId })
        .returning({ id: farms.id });
      if (!inserted.length) throw new ActionError("すでに出店申請を受け付けています。審査結果をお待ちください");
    }

    const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
    await notifyMany(
      admins.map((a) => ({
        userId: a.id,
        type: "system" as const,
        title: resubmitted ? "出店申請が再提出されました" : "新しい出店申請が届きました",
        body: `${input.farmName}（${input.representative}）から出店申請${resubmitted ? "の再提出" : ""}がありました。内容を確認してください。`,
        href: routes.admin.farms,
      })),
    );

    updateTag(tags.farms);
    return { farmName: input.farmName };
  }, "出店申請を受け付けました。運営からのご連絡をお待ちください");
}
