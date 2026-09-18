import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { catalogLimits } from "@/config/catalog";
import { features } from "@/lib/env";
import { randomCode } from "@/lib/ids";

const extOf = (type: string) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[type] ?? "bin";

/**
 * Store an uploaded image. Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise
 * public/uploads (local dev only — not persistent on Vercel).
 */
export async function storeImage(file: File, folder: "products" | "farms" | "reviews" = "products") {
  if (!(catalogLimits.acceptedImageTypes as readonly string[]).includes(file.type)) {
    throw new Error("対応していない画像形式です（JPEG / PNG / WebP / AVIF）");
  }
  if (file.size > catalogLimits.maxImageBytes) throw new Error("画像サイズが大きすぎます（8MBまで）");
  const name = `${folder}/${Date.now().toString(36)}-${randomCode(6).toLowerCase()}.${extOf(file.type)}`;

  if (features.blob) {
    const blob = await put(name, file, { access: "public", contentType: file.type, addRandomSuffix: false });
    return blob.url;
  }
  const dest = path.join(process.cwd(), "public", "uploads", name);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
