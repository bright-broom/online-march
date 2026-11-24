import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { features } from "@/lib/env";
import { r2Bucket } from "./cloudflare";
import { uploadFolders } from "./storage";

/**
 * 旧 Vercel Blob（公開ストア）に置いた画像を Cloudflare R2 の UPLOADS へコピーし、DB の URL を `/uploads/<key>` に書き換える。
 * 何度実行しても同じ結果になる（R2 に既にあればコピーしない・書き換え済みの行は対象にならない）。
 * 公開 URL から読むので Blob のトークンは要らない。対象の列はこのファイルの `columns` だけ。
 */
const blobUrl = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/([a-z]+)\/([a-z0-9]+-[a-z0-9]+\.(?:jpg|png|webp|avif))$/;

/** 画像の URL を持つ列（text）。jsonb の配列（reviews.images）は別に扱う */
const columns = [
  { table: "user", column: "image" },
  { table: "farms", column: "hero_image" },
  { table: "farms", column: "avatar_image" },
  { table: "product_images", column: "url" },
  { table: "order_items", column: "image_url" },
] as const;

/** Blob の URL → R2 のキー（置き場として許したフォルダ・決まった形の名前だけ）。それ以外は null */
export function blobKey(url: string): string | null {
  const m = blobUrl.exec(url);
  if (!m || !Object.hasOwn(uploadFolders, m[1])) return null;
  return `${m[1]}/${m[2]}`;
}

export type ImageMigrationResult = { copied: number; skipped: number; rowsUpdated: number; unknown: number };

export async function migrateBlobImages(fetchImpl: typeof fetch = fetch): Promise<ImageMigrationResult> {
  if (!features.r2) throw new Error("R2 がつながっていません（STORAGE_BACKEND=r2 の環境で実行してください）");
  const bucket = await r2Bucket("UPLOADS");

  const urls = new Set<string>();
  for (const { table, column } of columns) {
    const rows = await db.execute<{ url: string }>(
      sql`select distinct ${sql.identifier(column)} as url from ${sql.identifier(table)} where ${sql.identifier(column)} like 'https://%.public.blob.vercel-storage.com/%'`,
    );
    for (const r of rows.rows) urls.add(r.url);
  }
  const reviewRows = await db.execute<{ url: string }>(
    sql`select distinct jsonb_array_elements_text(images) as url from reviews where images::text like '%.public.blob.vercel-storage.com/%'`,
  );
  for (const r of reviewRows.rows) if (r.url.includes(".public.blob.vercel-storage.com/")) urls.add(r.url);

  let copied = 0;
  let skipped = 0;
  let unknown = 0;
  let rowsUpdated = 0;
  for (const url of urls) {
    const key = blobKey(url);
    if (!key) {
      unknown++; // 形の違う URL は触らない（手で確認する）
      continue;
    }
    if (await bucket.head(key)) {
      skipped++;
    } else {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`${url} を読めませんでした（${res.status}）`);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      await bucket.put(key, await res.arrayBuffer(), { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
      copied++;
    }
    const next = `/uploads/${key}`;
    for (const { table, column } of columns) {
      const r = await db.execute(sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${next} where ${sql.identifier(column)} = ${url}`);
      rowsUpdated += r.rowCount ?? 0;
    }
    const r = await db.execute(
      sql`update reviews set images = (select jsonb_agg(case when e = ${url} then ${next} else e end) from jsonb_array_elements_text(images) e) where images ? ${url}`,
    );
    rowsUpdated += r.rowCount ?? 0;
  }
  return { copied, skipped, rowsUpdated, unknown };
}
