"use server";
import { refresh } from "next/cache";
import { farmStaffCopy } from "@/config/farm-staff";
import { rateLimits } from "@/config/rate-limits";
import { staffAccessSchema, staffInviteSchema, staffInviteTokenSchema, staffMemberSchema } from "@/lib/validators/farmer";
import { assertFarm, assertUser } from "@/server/auth/guards";
import { acceptFarmInvite, inviteFarmStaff, leaveFarm, removeFarmStaff, resendFarmInvite, setFarmStaffAccess } from "@/server/services/farm-staff";
import { consumeRateLimit } from "@/server/services/rate-limit";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * 農園スタッフ（#24）。招待・再送・権限の変更・外すはオーナーだけ（capability "staff"）。
 * 参加は招待されたアドレスのアカウントで（services/farm-staff.ts#acceptFarmInvite）。抜けるのはスタッフ本人。
 */

export async function inviteStaff(_prev: unknown, formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("staff");
    const data = parseInput(staffInviteSchema, formToObject(formData));
    if (!(await consumeRateLimit("staffInvite", user.id))) throw new ActionError(rateLimits.staffInvite.message);
    const { url } = await inviteFarmStaff({ farm, owner: user, email: data.email, access: data.access, now: new Date() });
    refresh();
    return { url };
  }, "招待メールを送りました");
}

export async function resendStaffInvite(input: { memberId: string }): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("staff");
    const { memberId } = parseInput(staffMemberSchema, input);
    if (!(await consumeRateLimit("staffInvite", user.id))) throw new ActionError(rateLimits.staffInvite.message);
    const out = await resendFarmInvite({ farm, owner: user, memberId, now: new Date() });
    refresh();
    return out;
  }, "招待メールを送り直しました");
}

export async function changeStaffAccess(input: { memberId: string; access: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm("staff");
    const data = parseInput(staffAccessSchema, input);
    await setFarmStaffAccess({ farmId: farm.id, memberId: data.memberId, access: data.access });
    refresh();
  }, "権限を変更しました");
}

export async function removeStaff(input: { memberId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm("staff");
    const { memberId } = parseInput(staffMemberSchema, input);
    await removeFarmStaff({ farmId: farm.id, memberId });
    refresh();
  }, "スタッフから外しました");
}

export async function acceptStaffInvite(input: { token: string }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertUser();
    const { token } = parseInput(staffInviteTokenSchema, input);
    await acceptFarmInvite({ user: me, token, now: new Date() });
  }, "スタッフとして参加しました");
}

export async function leaveStaff(): Promise<ActionResult> {
  return runAction(async () => {
    const { user, access } = await assertFarm("member");
    if (access === "owner") throw new ActionError(farmStaffCopy.errors.ownerCannotLeave);
    await leaveFarm(user.id);
  }, "スタッフを抜けました");
}
