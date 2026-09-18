import { getSessionUser } from "@/server/auth/session";
import { getFavoriteProductIds, getFollowedFarmIds } from "@/server/queries/engagement";
import { EngagementSync } from "./engagement";

/** Request-time: render inside <Suspense fallback={null}>. Streams favorite/follow ids to the client store. */
export async function EngagementHydrator() {
  const user = await getSessionUser();
  if (!user) return <EngagementSync signedIn={false} favorites={[]} follows={[]} />;
  const [favorites, follows] = await Promise.all([getFavoriteProductIds(user.id), getFollowedFarmIds(user.id)]);
  return <EngagementSync signedIn favorites={favorites} follows={follows} />;
}
