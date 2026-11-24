import { r2Bucket } from "@/server/services/cloudflare";
import { uploadFolders } from "@/server/services/storage";
import { features } from "@/lib/env";

/**
 * アップロードされた画像の配信（Cloudflare R2 の UPLOADS バケット）。
 * 手元の開発では public/uploads のファイルが先に返るので、ここには来ない。
 * 置き場として許したフォルダ（storage.ts#uploadFolders）の中の、決まった形の名前だけを返す。
 */
const keyPattern = /^[a-z0-9]+-[a-z0-9]+\.(jpg|png|webp|avif)$/;

export async function GET(_req: Request, ctx: RouteContext<"/uploads/[...key]">) {
  const { key } = await ctx.params;
  if (!features.r2 || key.length !== 2 || !Object.hasOwn(uploadFolders, key[0]) || !keyPattern.test(key[1])) {
    return new Response("Not found", { status: 404 });
  }
  const obj = await (await r2Bucket("UPLOADS")).get(key.join("/"));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body as unknown as ReadableStream, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}
