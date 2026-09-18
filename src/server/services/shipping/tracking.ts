import "server-only";
import type { Carrier } from "@/db/schema";

export type TrackingStatus = { status: "in_transit" | "out_for_delivery" | "delivered" | "exception"; at: Date; location?: string };

/**
 * Carrier tracking adapter. Japanese carriers do not offer a public tracking API for small
 * shippers; plug a contracted API (e.g. ヤマト ビジネスメンバーズ / 送り状発行API) here.
 * Returning null makes the sync job fall back to shippingPolicy.autoDeliveredAfterDays.
 */
export async function fetchTrackingStatus(_carrier: Carrier, _trackingNumber: string): Promise<TrackingStatus | null> {
  return null;
}
