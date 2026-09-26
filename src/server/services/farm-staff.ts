import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { farmAccessMeta, farmStaffCopy, farmStaffPolicy } from "@/config/farm-staff";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmMembers, farms, user, type Farm, type FarmMemberAccess } from "@/db/schema";
import { siteUrl } from "@/lib/env";
import { ActionError } from "@/server/actions/_utils";
import { sendEmail } from "@/server/services/email";
import { emailTemplates } from "@/server/services/email/templates";
import { notify } from "@/server/services/notify";
import { getFarmInvite, hashInviteToken } from "@/server/queries/farmer";

/**
 * 農園のスタッフ（#24）。招待 → 招待されたアドレスのアカウントで参加 → 権限の変更・外す・自分から抜ける。
 * 招待リンクのトークンは sha256 だけを DB に持つ（DB が漏れてもリンクは作れない）。平文はメールと、招待した直後のオーナーの画面にだけ出る。
 * 権限の判定そのものは server/auth/guards.ts#farmAccessOf。
 */

const E = farmStaffCopy.errors;
const DAY = 86_400_000;

const newToken = () => randomBytes(32).toString("base64url");
const inviteUrl = (token: string) => new URL(routes.staffInvite(token), siteUrl).toString();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

type Owner = { id: string; name: string; email: string };

async function sendInvite(farm: Farm, owner: Owner, email: string, access: FarmMemberAccess, token: string) {
  await sendEmail(
    emailTemplates.farmStaffInvite({
      to: email,
      farmName: farm.name,
      inviterName: owner.name,
      accessLabel: farmAccessMeta[access].label,
      url: inviteUrl(token),
      expiresDays: farmStaffPolicy.inviteTtlDays,
    }),
  );
}

/** オーナーが招待する。人数の上限は招待中を含めて数える。戻り値の url はオーナーの画面に出す（メールが届かないときに手で渡せるように） */
export async function inviteFarmStaff(p: { farm: Farm; owner: Owner; email: string; access: FarmMemberAccess; now: Date }) {
  const email = normalizeEmail(p.email);
  if (email === normalizeEmail(p.owner.email)) throw new ActionError(E.self);
  const token = newToken();
  const row = await db.transaction(async (tx) => {
    // 同じ農園の招待を同時に送っても上限を超えないよう、農園の行をロックしてから数える
    await tx.select({ id: farms.id }).from(farms).where(eq(farms.id, p.farm.id)).for("update");
    const [{ n }] = await tx.select({ n: count() }).from(farmMembers).where(eq(farmMembers.farmId, p.farm.id));
    if (n >= farmStaffPolicy.maxMembers) throw new ActionError(E.limit);
    const dup = await tx.query.farmMembers.findFirst({ where: and(eq(farmMembers.farmId, p.farm.id), eq(farmMembers.email, email)), columns: { id: true } });
    if (dup) throw new ActionError(E.duplicate);
    const [created] = await tx
      .insert(farmMembers)
      .values({
        farmId: p.farm.id,
        email,
        access: p.access,
        tokenHash: hashInviteToken(token),
        invitedBy: p.owner.id,
        invitedAt: p.now,
        expiresAt: new Date(p.now.getTime() + farmStaffPolicy.inviteTtlDays * DAY),
      })
      .returning();
    return created;
  });
  await sendInvite(p.farm, p.owner, email, p.access, token);
  return { id: row.id, url: inviteUrl(token) };
}

/** 招待中（未参加）のメンバーに新しいリンクを送り直す。前のリンクは使えなくなる */
export async function resendFarmInvite(p: { farm: Farm; owner: Owner; memberId: string; now: Date }) {
  const token = newToken();
  const [row] = await db
    .update(farmMembers)
    .set({ tokenHash: hashInviteToken(token), invitedAt: p.now, expiresAt: new Date(p.now.getTime() + farmStaffPolicy.inviteTtlDays * DAY) })
    .where(and(eq(farmMembers.id, p.memberId), eq(farmMembers.farmId, p.farm.id), isNull(farmMembers.acceptedAt)))
    .returning();
  if (!row) throw new ActionError(E.notFound);
  await sendInvite(p.farm, p.owner, row.email, row.access, token);
  return { url: inviteUrl(token) };
}

/**
 * 招待を受ける。条件: リンクが有効・招待されたアドレスのアカウント・購入者のアカウント・どこの農園にも所属していない・出店申請していない。
 * 参加したらトークンを消す（同じリンクは二度と使えない）。
 */
export async function acceptFarmInvite(p: { user: { id: string; email: string; role: string; name: string }; token: string; now: Date }) {
  const found = await getFarmInvite(p.token, p.now);
  if (!found.invite) throw new ActionError(found.error ?? E.invalidInvite);
  const inv = found.invite;
  if (normalizeEmail(p.user.email) !== inv.email) throw new ActionError(E.wrongAccount);
  if (p.user.role !== "customer") throw new ActionError(E.notCustomerAccount);
  const [ownFarm] = await db.select({ id: farms.id }).from(farms).where(eq(farms.ownerId, p.user.id)).limit(1);
  if (ownFarm) throw new ActionError(E.hasApplication);
  const other = await db.query.farmMembers.findFirst({ where: eq(farmMembers.userId, p.user.id), columns: { id: true } });
  if (other) throw new ActionError(E.alreadyMember);

  const [joined] = await db
    .update(farmMembers)
    .set({ userId: p.user.id, acceptedAt: p.now, tokenHash: null })
    // 同じリンクを同時に2回押しても1回だけ通る（tokenHash が残っている行だけ）
    .where(and(eq(farmMembers.id, inv.id), eq(farmMembers.tokenHash, hashInviteToken(p.token)), isNull(farmMembers.acceptedAt)))
    .returning();
  if (!joined) throw new ActionError(E.invalidInvite);

  const farm = await db.query.farms.findFirst({ where: eq(farms.id, joined.farmId) });
  if (farm) {
    await notify({ userId: farm.ownerId, type: "system", title: `${p.user.name}さんがスタッフに参加しました`, body: `権限：${farmAccessMeta[joined.access].label}`, href: routes.farmer.staff });
  }
  return { farmId: joined.farmId, access: joined.access };
}

export async function setFarmStaffAccess(p: { farmId: string; memberId: string; access: FarmMemberAccess }) {
  const [row] = await db
    .update(farmMembers)
    .set({ access: p.access })
    .where(and(eq(farmMembers.id, p.memberId), eq(farmMembers.farmId, p.farmId)))
    .returning({ id: farmMembers.id });
  if (!row) throw new ActionError(E.notFound);
}

/** 外す（招待中なら取り消し）。ガードは毎回 DB を見るので、次のリクエストから生産者画面に入れない */
export async function removeFarmStaff(p: { farmId: string; memberId: string }) {
  const [row] = await db
    .delete(farmMembers)
    .where(and(eq(farmMembers.id, p.memberId), eq(farmMembers.farmId, p.farmId)))
    .returning({ id: farmMembers.id, userId: farmMembers.userId });
  if (!row) throw new ActionError(E.notFound);
  return row;
}

/** スタッフが自分から抜ける */
export async function leaveFarm(userId: string) {
  const [row] = await db.delete(farmMembers).where(eq(farmMembers.userId, userId)).returning({ farmId: farmMembers.farmId });
  if (!row) throw new ActionError(E.notFound);
  const farm = await db.query.farms.findFirst({ where: eq(farms.id, row.farmId) });
  const me = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true } });
  if (farm && me) await notify({ userId: farm.ownerId, type: "system", title: `${me.name}さんがスタッフを抜けました`, body: "", href: routes.farmer.staff });
}
