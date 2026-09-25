import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { catalogLimits } from "@/config/catalog";
import { features } from "@/lib/env";
import { randomCode } from "@/lib/ids";
import type { UserRole } from "@/db/schema";

type ImageType = (typeof catalogLimits.acceptedImageTypes)[number];
const extOf: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/**
 * アップロード先のフォルダと、置いてよいロール。ここに無いフォルダ・ロールは受け付けない（#3）。
 * 以前は folder を無検証でパスに使っていたため、ログインしていれば任意の場所に書けた（ローカルでは ../ で外にも）。
 * お客さまがアップロードする画面は今は無い（レビュー写真は未実装）。
 */
export const uploadFolders = { products: ["farmer", "admin"], farms: ["farmer", "admin"] } as const satisfies Record<string, readonly UserRole[]>;
export type UploadFolder = keyof typeof uploadFolders;

export function uploadFolderFor(role: UserRole, folder: unknown): UploadFolder | null {
  if (typeof folder !== "string" || !Object.hasOwn(uploadFolders, folder)) return null;
  const f = folder as UploadFolder;
  return (uploadFolders[f] as readonly UserRole[]).includes(role) ? f : null;
}

/** 中身の先頭バイトで画像形式を判定する。ブラウザが申告する MIME（file.type）は信用しない */
export function sniffImageType(head: Uint8Array): ImageType | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, j) => head[i + j] === b);
  const ascii = (i: number, text: string) => at(i, [...text].map((c) => c.charCodeAt(0)));
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "image/avif";
  return null;
}

/**
 * Store an uploaded image. Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise
 * public/uploads (local dev only — not persistent on Vercel). The folder must come from uploadFolderFor().
 */
export async function storeImage(file: File, folder: UploadFolder) {
  if (file.size > catalogLimits.maxImageBytes) throw new Error("画像サイズが大きすぎます（8MBまで）");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes.subarray(0, 16));
  if (!type) throw new Error("対応していない画像形式です（JPEG / PNG / WebP / AVIF）");
  const name = `${folder}/${Date.now().toString(36)}-${randomCode(6).toLowerCase()}.${extOf[type]}`;

  if (features.blob) {
    const blob = await put(name, Buffer.from(bytes), { access: "public", contentType: type, addRandomSuffix: false });
    return blob.url;
  }
  const dest = path.join(process.cwd(), "public", "uploads", name);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  return `/uploads/${name}`;
}
