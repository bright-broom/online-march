"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { farmFollows, favorites } from "@/db/schema";
import { assertUser } from "@/server/auth/guards";
import { runAction, type ActionResult } from "./_utils";

/** Toggle a product favorite. Returns the new state. */
export async function toggleFavorite(productId: string): Promise<ActionResult<{ favorited: boolean }>> {
  return runAction(async () => {
    const me = await assertUser();
    const where = and(eq(favorites.userId, me.id), eq(favorites.productId, productId));
    const existing = await db.query.favorites.findFirst({ where });
    if (existing) {
      await db.delete(favorites).where(where);
      return { favorited: false };
    }
    await db.insert(favorites).values({ userId: me.id, productId });
    return { favorited: true };
  });
}

/** Toggle following a farm. Returns the new state. */
export async function toggleFollow(farmId: string): Promise<ActionResult<{ following: boolean }>> {
  return runAction(async () => {
    const me = await assertUser();
    const where = and(eq(farmFollows.userId, me.id), eq(farmFollows.farmId, farmId));
    const existing = await db.query.farmFollows.findFirst({ where });
    if (existing) {
      await db.delete(farmFollows).where(where);
      return { following: false };
    }
    await db.insert(farmFollows).values({ userId: me.id, farmId });
    return { following: true };
  });
}
