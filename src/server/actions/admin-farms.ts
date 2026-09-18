"use server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/nav";
import { farmStatusMeta } from "@/config/status";
import { db } from "@/db";
import { farms, user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { farmCommissionSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { emailTemplates } from "@/server/services/email/templates";
import { notify } from "@/server/services/notify";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

const statusInput = z.object({
  farmId: z.uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(300, "300文字以内で入力してください").optional(),
});

function expireFarm(farmId: string) {
  expireTags(tags.farms, tags.farm(farmId), tags.farmProducts(farmId), tags.products, tags.analytics);
}

/**
 * 承認 / 再開 (→ active) and 却下 / 停止 (→ suspended).
 * Suspended farms' products disappear from the catalog automatically (catalog filters by farm status).
 */
export async function setFarmStatus(input: z.input<typeof statusInput>): Promise<ActionResult<{ status: "active" | "suspended" }>> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(statusInput, input);
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, data.farmId), with: { owner: true } });
    if (!farm) throw new ActionError("生産者が見つかりません");
    if (farm.status === data.status) throw new ActionError(`すでに「${farmStatusMeta[data.status].label}」です`);
    const now = new Date();
    const firstApproval = data.status === "active" && !farm.approvedAt;

    await db.transaction(async (tx) => {
      await tx
        .update(farms)
        .set({ status: data.status, ...(data.status === "active" && !farm.approvedAt ? { approvedAt: now } : {}) })
        .where(eq(farms.id, farm.id));
      // Promote the applicant to farmer on approval (never demote an admin).
      if (data.status === "active" && farm.owner.role === "customer") {
        await tx.update(user).set({ role: "farmer" }).where(eq(user.id, farm.ownerId));
      }
    });

    // side effects after commit
    if (data.status === "active") {
      await notify({
        userId: farm.ownerId,
        type: "system",
        title: firstApproval ? "出店申請が承認されました" : "ショップの公開を再開しました",
        body: farm.name,
        href: routes.farmer.root,
        email: firstApproval ? emailTemplates.farmApproved({ to: farm.owner.email, farmName: farm.name }) : undefined,
      });
    } else {
      await notify({
        userId: farm.ownerId,
        type: "system",
        title: farm.status === "pending" ? "出店申請について" : "ショップを一時停止しました",
        body: data.reason || (farm.status === "pending" ? "今回は出店を見送らせていただきました。詳しくは運営までお問い合わせください。" : "運営までお問い合わせください。"),
      });
    }
    expireFarm(farm.id);
    refresh();
    return { status: data.status };
  }, input.status === "active" ? "生産者を公開しました" : "生産者を停止しました");
}

const featureInput = z.object({ farmId: z.uuid(), featured: z.boolean() });

export async function setFarmFeatured(input: z.input<typeof featureInput>): Promise<ActionResult> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(featureInput, input);
    const [row] = await db.update(farms).set({ isFeatured: data.featured }).where(eq(farms.id, data.farmId)).returning({ id: farms.id });
    if (!row) throw new ActionError("生産者が見つかりません");
    expireFarm(row.id);
    refresh();
  }, input.featured ? "おすすめ生産者に設定しました" : "おすすめを解除しました");
}

/** Per-farm commission override. Empty = platform default. Past orders keep their stored rate. */
export async function setFarmCommission(_prev: unknown, formData: FormData): Promise<ActionResult<{ bps: number | null }>> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(farmCommissionSchema, formToObject(formData));
    const [row] = await db.update(farms).set({ commissionRateBps: data.ratePercent }).where(eq(farms.id, data.farmId)).returning({ id: farms.id });
    if (!row) throw new ActionError("生産者が見つかりません");
    expireFarm(row.id);
    refresh();
    return { bps: data.ratePercent };
  }, "手数料率を更新しました");
}
