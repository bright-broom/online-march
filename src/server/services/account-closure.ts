import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { addresses, farmFollows, farmOrders, favorites, messages, notifications, orders, session, account as authAccount, user } from "@/db/schema";

/**
 * 退会（アカウントの削除）。
 *
 * user 行そのものは消せない。注文は `onDelete: "cascade"` でぶら下がっているため、行を消すと
 * **売上・精算の記録ごと消える**（生産者の帳簿と月次精算が壊れる）。そこで個人情報だけを消し、
 * 取引記録は残す = 匿名化する。
 *  - 消す: 氏名・メール・電話・アドレス帳・お気に入り・フォロー・お知らせ・生産者とのメッセージ・ログイン情報
 *  - 残す: 注文（金額・明細・お届け先スナップショット。帳簿と配送記録として必要）とレビュー本文
 *    （公開済みの評価。投稿者名は「退会したお客さま」になる）
 *
 * docs/DATA_MODEL.md §退会
 */
export const CLOSED_ACCOUNT_NAME = "退会したお客さま";

/** 退会できない理由。配送や返金の途中で連絡が取れなくなるのを防ぐ */
export type CloseBlockedReason = "live_orders" | "not_customer" | "already_closed";

export class AccountCloseBlocked extends Error {
  constructor(readonly reason: CloseBlockedReason) {
    super(reason);
  }
}

/**
 * 進行中の注文（未決済・入金待ち・準備中・配送中）があるか。
 * 判定は farm_orders 側で行う: orders.status は配達が終わっても "paid" のままなので、
 * そちらを見ると「完了した注文がある人は永久に退会できない」ことになる。
 */
export async function hasLiveOrders(userId: string) {
  const live = await db
    .select({ id: farmOrders.id })
    .from(farmOrders)
    .innerJoin(orders, eq(orders.id, farmOrders.orderId))
    .where(and(eq(orders.userId, userId), inArray(farmOrders.status, ["pending_payment", "paid", "preparing", "shipped"])))
    .limit(1);
  return live.length > 0;
}

/** 匿名化したあとも user.email は unique なので、二度と衝突しない値に置き換える */
const closedEmail = (userId: string) => `deleted+${userId}@users.invalid`;

export async function closeCustomerAccount(userId: string, now = new Date()) {
  const me = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!me) throw new AccountCloseBlocked("not_customer");
  if (me.role !== "customer") throw new AccountCloseBlocked("not_customer"); // 生産者・運営は運営側で対応する
  if (me.deletedAt) throw new AccountCloseBlocked("already_closed");
  if (await hasLiveOrders(userId)) throw new AccountCloseBlocked("live_orders");

  await db.transaction(async (tx) => {
    // 個人情報そのもの
    await tx.delete(addresses).where(eq(addresses.userId, userId));
    await tx.delete(favorites).where(eq(favorites.userId, userId));
    await tx.delete(farmFollows).where(eq(farmFollows.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    // 生産者との1対1のやり取り。相手側からも読めなくなる
    await tx.delete(messages).where(or(eq(messages.customerId, userId), eq(messages.senderId, userId)));
    // ログイン手段（パスワード）とログイン中の端末
    await tx.delete(authAccount).where(eq(authAccount.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await tx
      .update(user)
      .set({ name: CLOSED_ACCOUNT_NAME, email: closedEmail(userId), emailVerified: false, phone: null, image: null, deletedAt: now })
      .where(eq(user.id, userId));
  });
  return { closedAt: now };
}
