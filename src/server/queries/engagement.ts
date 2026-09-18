import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { farmFollows, favorites } from "@/db/schema";

/** Request-time (user-specific). Returns id sets for "is favorited / followed" UI state. */
export async function getFavoriteProductIds(userId: string) {
  const rows = await db.select({ id: favorites.productId }).from(favorites).where(eq(favorites.userId, userId));
  return rows.map((r) => r.id);
}

export async function getFollowedFarmIds(userId: string) {
  const rows = await db.select({ id: farmFollows.farmId }).from(farmFollows).where(eq(farmFollows.userId, userId));
  return rows.map((r) => r.id);
}
