import "server-only";
import { siteUrl } from "@/lib/env";

/** Absolute URL on the canonical origin (JSON-LD, sitemap, robots). */
export const absUrl = (path: string) => new URL(path, siteUrl).toString();
