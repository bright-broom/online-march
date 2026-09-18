import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { feeConfig } from "@/config/fees";
import { db } from "@/db";
import type { Database } from "@/db/client";
import { platformSettings } from "@/db/schema";
import { tags } from "@/lib/cache-tags";

/** Admin-editable platform settings with config defaults. Keys are typed here. */
export type PlatformSettings = {
  commissionRateBps: number;
  maintenanceMode: boolean;
};

const defaults: PlatformSettings = {
  commissionRateBps: feeConfig.defaultCommissionRateBps,
  maintenanceMode: false,
};

/** `exec` lets callers read inside a transaction (required on single-connection PGlite). */
export async function readSettingsUncached(exec: Pick<Database, "select"> = db): Promise<PlatformSettings> {
  const rows = await exec.select().from(platformSettings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...defaults, ...map } as PlatformSettings;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  "use cache";
  cacheTag(tags.settings);
  cacheLife("hours");
  return readSettingsUncached();
}
