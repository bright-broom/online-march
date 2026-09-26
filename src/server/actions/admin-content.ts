"use server";
import { and, eq, ne } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { announcements, coupons } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { addDays, fromYmd } from "@/lib/dates";
import { announcementSchema, couponSchema, idSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { recordAudit } from "@/server/services/audit";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/* ───────── Coupons ───────── */

export async function saveCoupon(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(couponSchema, formToObject(formData));
    const dup = await db.query.coupons.findFirst({
      where: data.id ? and(eq(coupons.code, data.code), ne(coupons.id, data.id)) : eq(coupons.code, data.code),
      columns: { id: true },
    });
    if (dup) throw new ActionError("入力内容を確認してください", { code: ["このコードはすでに使われています"] });
    const values = {
      code: data.code,
      description: data.description,
      type: data.type,
      value: data.value,
      minSubtotal: data.minSubtotal,
      maxUses: data.maxUses,
      oncePerUser: data.oncePerUser,
      // business dates are JST: starts at 00:00, ends at 23:59:59.999 of the chosen day
      startsAt: data.startsAt ? fromYmd(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(fromYmd(addDays(data.endsAt, 1)).getTime() - 1) : null,
      isActive: data.isActive,
    };
    let id = data.id;
    if (id) {
      const [row] = await db.update(coupons).set(values).where(eq(coupons.id, id)).returning({ id: coupons.id });
      if (!row) throw new ActionError("クーポンが見つかりません");
    } else {
      [{ id }] = await db.insert(coupons).values(values).returning({ id: coupons.id });
    }
    await recordAudit(me, {
      action: "coupon.save", target: { type: "coupon", id: id! },
      summary: `クーポン ${data.code} を${data.id ? "編集" : "作成"}`,
      detail: { type: data.type, value: data.value, minSubtotal: data.minSubtotal, maxUses: data.maxUses, oncePerUser: data.oncePerUser, isActive: data.isActive },
    });
    updateTag(tags.coupons);
    refresh();
    return { id: id! };
  }, "クーポンを保存しました");
}

export async function setCouponActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(z.object({ id: z.uuid(), active: z.boolean() }), input);
    const [row] = await db.update(coupons).set({ isActive: data.active }).where(eq(coupons.id, data.id)).returning({ id: coupons.id, code: coupons.code });
    if (!row) throw new ActionError("クーポンが見つかりません");
    await recordAudit(me, { action: "coupon.active", target: { type: "coupon", id: row.id }, summary: `クーポン ${row.code} を${data.active ? "有効" : "停止"}に`, detail: { active: data.active } });
    updateTag(tags.coupons);
    refresh();
  }, input.active ? "クーポンを有効にしました" : "クーポンを停止しました");
}

export async function deleteCoupon(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { id } = parseInput(idSchema, input);
    const [row] = await db.delete(coupons).where(eq(coupons.id, id)).returning({ id: coupons.id, code: coupons.code, usedCount: coupons.usedCount });
    if (!row) throw new ActionError("クーポンが見つかりません");
    await recordAudit(me, { action: "coupon.delete", target: { type: "coupon", id: row.id }, summary: `クーポン ${row.code} を削除`, detail: { usedCount: row.usedCount } });
    updateTag(tags.coupons);
    refresh();
  }, "クーポンを削除しました");
}

/* ───────── Announcements ───────── */

export async function saveAnnouncement(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(announcementSchema, formToObject(formData));
    const values = {
      title: data.title,
      body: data.body,
      audience: data.audience,
      isPublished: data.isPublished,
      publishedAt: new Date(`${data.publishedAt}:00+09:00`),
    };
    let id = data.id;
    if (id) {
      const [row] = await db.update(announcements).set(values).where(eq(announcements.id, id)).returning({ id: announcements.id });
      if (!row) throw new ActionError("お知らせが見つかりません");
    } else {
      [{ id }] = await db.insert(announcements).values(values).returning({ id: announcements.id });
    }
    await recordAudit(me, {
      action: "announcement.save", target: { type: "announcement", id: id! },
      summary: `お知らせ「${data.title}」を${data.id ? "編集" : "作成"}`, detail: { audience: data.audience, isPublished: data.isPublished },
    });
    updateTag(tags.announcements);
    refresh();
    return { id: id! };
  }, "お知らせを保存しました");
}

export async function setAnnouncementPublished(input: { id: string; published: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(z.object({ id: z.uuid(), published: z.boolean() }), input);
    const [row] = await db.update(announcements).set({ isPublished: data.published }).where(eq(announcements.id, data.id)).returning({ id: announcements.id, title: announcements.title });
    if (!row) throw new ActionError("お知らせが見つかりません");
    await recordAudit(me, { action: "announcement.published", target: { type: "announcement", id: row.id }, summary: `お知らせ「${row.title}」を${data.published ? "公開" : "非公開に"}`, detail: { published: data.published } });
    updateTag(tags.announcements);
    refresh();
  }, input.published ? "お知らせを公開しました" : "お知らせを非公開にしました");
}

export async function deleteAnnouncement(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { id } = parseInput(idSchema, input);
    const [row] = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id, title: announcements.title });
    if (!row) throw new ActionError("お知らせが見つかりません");
    await recordAudit(me, { action: "announcement.delete", target: { type: "announcement", id: row.id }, summary: `お知らせ「${row.title}」を削除` });
    updateTag(tags.announcements);
    refresh();
  }, "お知らせを削除しました");
}
