"use server";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { addresses, user } from "@/db/schema";
import { isDemoEmail } from "@/config/demo";
import { addressFormSchema, profileSchema } from "@/lib/validators/account";
import { assertUser } from "@/server/auth/guards";
import { markThreadRead } from "@/server/queries/messages";
import { AccountCloseBlocked, closeCustomerAccount } from "@/server/services/account-closure";
import { cancelOrderByCustomer } from "@/server/services/orders";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

const idSchema = z.uuid("IDが正しくありません");

/* ───────────── addresses ───────────── */

/** Create or update a saved address (form action for useActionState). */
export async function saveAddress(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertUser();
    const { id, isDefault, ...data } = parseInput(addressFormSchema, formToObject(formData));
    const [{ n }] = await db.select({ n: count() }).from(addresses).where(eq(addresses.userId, me.id));
    const makeDefault = isDefault || n === 0;

    let rowId: string;
    if (id) {
      const [row] = await db
        .update(addresses)
        .set({ ...data, ...(makeDefault ? { isDefault: true } : {}) })
        .where(and(eq(addresses.id, id), eq(addresses.userId, me.id)))
        .returning({ id: addresses.id });
      if (!row) throw new ActionError("お届け先が見つかりません");
      rowId = row.id;
    } else {
      const [row] = await db.insert(addresses).values({ ...data, userId: me.id, isDefault: makeDefault }).returning({ id: addresses.id });
      rowId = row.id;
    }
    if (makeDefault) {
      await db.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, me.id), ne(addresses.id, rowId)));
    }
    return { id: rowId };
  }, "お届け先を保存しました");
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const addressId = parseInput(idSchema, id);
    const [row] = await db
      .update(addresses)
      .set({ isDefault: true })
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, me.id)))
      .returning({ id: addresses.id });
    if (!row) throw new ActionError("お届け先が見つかりません");
    await db.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, me.id), ne(addresses.id, addressId)));
  }, "いつものお届け先に設定しました");
}

export async function deleteAddress(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const addressId = parseInput(idSchema, id);
    const [row] = await db
      .delete(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, me.id)))
      .returning({ isDefault: addresses.isDefault });
    if (!row) throw new ActionError("お届け先が見つかりません");
    if (row.isDefault) {
      // promote the most recent remaining address
      const next = await db.query.addresses.findFirst({
        where: eq(addresses.userId, me.id),
        orderBy: (t, { desc }) => desc(t.createdAt),
      });
      if (next) await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  }, "お届け先を削除しました");
}

/* ───────────── orders ───────────── */

/** Customer cancels a whole order (only before shipment). Refunds are handled by the service. */
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const id = parseInput(idSchema, orderId);
    await cancelOrderByCustomer(id, me.id, new Date());
  }, "ご注文をキャンセルしました");
}

/* ───────────── messages ───────────── */

/** Mark the farm's messages in the customer's own thread as read. */
export async function markMessagesRead(farmId: string): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const id = parseInput(idSchema, farmId);
    await markThreadRead(id, me.id, "customer");
  });
}

/* ───────────── profile ───────────── */

export async function updateProfile(_prev: unknown, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(profileSchema, formToObject(formData));
    await db
      .update(user)
      .set({ name: data.name, phone: data.phone || null })
      .where(eq(user.id, me.id));
  }, "プロフィールを更新しました");
}

/* ───────────── account closure ───────────── */

const closeMessages: Record<string, string> = {
  live_orders: "配送中・お支払い待ちのご注文があるため退会できません。完了またはキャンセル後にお手続きください",
  not_customer: "このアカウントは退会できません。運営までお問い合わせください",
  already_closed: "このアカウントはすでに退会済みです",
};

/**
 * 退会。取り消せないので、確認のためメールアドレスを打ち直してもらう。
 * 実際に消す／残すものは `server/services/account-closure.ts` を参照。
 */
export async function closeAccount(input: { confirmEmail: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    if (isDemoEmail(me.email)) throw new ActionError("デモアカウントは退会できません");
    const typed = parseInput(z.string().trim().toLowerCase(), String(input.confirmEmail ?? ""));
    if (typed !== me.email.trim().toLowerCase()) throw new ActionError("メールアドレスが一致しません");
    try {
      await closeCustomerAccount(me.id);
    } catch (e) {
      if (e instanceof AccountCloseBlocked) throw new ActionError(closeMessages[e.reason] ?? closeMessages.not_customer);
      throw e;
    }
  }, "退会手続きが完了しました。ご利用ありがとうございました");
}
