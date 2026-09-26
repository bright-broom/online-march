import "server-only";
import type { Carrier } from "@/db/schema";

export type TrackingStatus = { status: "in_transit" | "out_for_delivery" | "delivered" | "exception"; at: Date; location?: string; detail?: string };

/**
 * 配送業者の追跡 API のつなぎ込み（#25）。業者ごとに1つ。
 * オーナーの決定: 契約は運営がまとめて行い、接続情報は環境変数（lib/env.ts）に置く。生産者は何もしない。
 * 業者と契約したら、ここにその業者のアダプタを足す（手順は docs/SHIPPING.md「配送業者の追跡 API」）。
 * 登録の無い業者（今はすべて）は "unsupported" になり、お届け予定日のルールで配達完了にする（services/shipping/delivery.ts）。
 */
export type TrackingAdapter = {
  /** 荷物が見つからない（まだ業者のシステムに載っていない）ときは null */
  fetch(trackingNumber: string): Promise<TrackingStatus | null>;
};

export const trackingAdapters: Partial<Record<Carrier, TrackingAdapter>> = {};

export type TrackingResult =
  | { kind: "unsupported" }
  | { kind: "ok"; status: TrackingStatus | null }
  | { kind: "error"; error: string };

export async function fetchTrackingStatus(carrier: Carrier, trackingNumber: string): Promise<TrackingResult> {
  const adapter = trackingAdapters[carrier];
  if (!adapter) return { kind: "unsupported" };
  try {
    return { kind: "ok", status: await adapter.fetch(trackingNumber) };
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
