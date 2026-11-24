"use server";
import { z } from "zod";
import { assertUser } from "@/server/auth/guards";
import { lookupPostalCode, type PostalAddress } from "@/server/services/postal-code";
import { parseInput, runAction, type ActionResult } from "./_utils";

const schema = z.object({ postalCode: z.string().max(10) });

/** 郵便番号から住所を引く（お届け先の入力を助ける）。ログインしている人だけ。見つからなければ data: null */
export async function findAddressByPostalCode(input: { postalCode: string }): Promise<ActionResult<PostalAddress | null>> {
  return runAction(async () => {
    await assertUser();
    const { postalCode } = parseInput(schema, input);
    return lookupPostalCode(postalCode);
  });
}
