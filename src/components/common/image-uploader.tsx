"use client";
/**
 * Image uploader: drag & drop / file picker / camera capture (mobile), client-side resize to ≤2000px WebP,
 * upload progress, preview, reorder (drag or arrows), remove. First image = cover.
 * Heavy-ish: import lazily with next/dynamic where used.
 */
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Star, TriangleAlert, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { catalogLimits } from "@/config/catalog";
import { cn } from "@/lib/utils";

const UPLOAD_ENDPOINT = "/api/upload";

type Pending = { key: string; preview: string; progress: number; error: string | null };

export type ImageUploaderProps = {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  folder?: "products" | "farms" | "reviews";
  /** longest edge after client-side resize */
  maxDimension?: number;
  /** tile aspect ratio */
  aspect?: "square" | "wide";
  /** label of the first tile (e.g. "カバー"); false to hide */
  coverLabel?: string | false;
  altText?: string;
  className?: string;
  disabled?: boolean;
};

/** Decode → scale → encode WebP (JPEG fallback when the browser can't encode WebP). */
async function compressImage(file: File, maxDim: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!(catalogLimits.acceptedImageTypes as readonly string[]).includes(file.type)) {
      throw new Error("この形式の画像は読み込めませんでした（JPEG / PNG / WebP を選んでください）");
    }
    return file;
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  return jpeg ?? file;
}

function uploadBlob(blob: Blob, folder: string, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    const fd = new FormData();
    fd.append("file", new File([blob], `photo.${ext}`, { type: blob.type || "image/jpeg" }));
    fd.append("folder", folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_ENDPOINT);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const res = xhr.response as { url?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && res?.url) resolve(res.url);
      else reject(new Error(res?.error ?? "アップロードに失敗しました"));
    };
    xhr.onerror = () => reject(new Error("通信エラーが発生しました。電波の良い場所で再度お試しください"));
    xhr.send(fd);
  });
}

export default function ImageUploader({
  value, onChange, max = catalogLimits.maxImagesPerProduct, folder = "products", maxDimension = 2000,
  aspect = "square", coverLabel = "カバー", altText = "アップロード画像", className, disabled,
}: ImageUploaderProps) {
  const inputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  const remaining = max - value.length - pending.filter((p) => !p.error).length;
  const canAdd = !disabled && remaining > 0;
  const commit = (next: string[]) => {
    latest.current = next;
    onChange(next);
  };

  async function handleFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "").slice(0, Math.max(0, remaining));
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      const key = preview; // object URLs are unique per file
      setPending((p) => [...p, { key, preview, progress: 0, error: null }]);
      const patch = (x: Partial<Pending>) => setPending((p) => p.map((it) => (it.key === key ? { ...it, ...x } : it)));
      try {
        const blob = await compressImage(file, maxDimension);
        if (blob.size > catalogLimits.maxImageBytes) throw new Error("画像サイズが大きすぎます（8MBまで）");
        const url = await uploadBlob(blob, folder, (progress) => patch({ progress }));
        commit(max === 1 ? [url] : [...latest.current, url].slice(0, max));
        setPending((p) => p.filter((it) => it.key !== key));
        URL.revokeObjectURL(preview);
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "アップロードに失敗しました" });
      }
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    commit(next);
  };
  const remove = (i: number) => commit(value.filter((_, idx) => idx !== i));
  const dismiss = (key: string) =>
    setPending((p) => {
      const it = p.find((x) => x.key === key);
      if (it) URL.revokeObjectURL(it.preview);
      return p.filter((x) => x.key !== key);
    });

  const tileAspect = aspect === "wide" ? "aspect-[16/9]" : "aspect-square";
  const single = max === 1;
  const grid = single ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-4";

  return (
    <div
      className={cn("space-y-3", className)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className={cn("grid gap-3", grid)}>
        {value.map((url, i) => (
          <div
            key={url}
            draggable={!single && !disabled}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => dragIndex != null && e.preventDefault()}
            onDrop={(e) => {
              if (dragIndex != null) {
                e.preventDefault();
                e.stopPropagation();
                move(dragIndex, i);
                setDragIndex(null);
              }
            }}
            className={cn(
              "group bg-muted relative overflow-hidden rounded-xl border",
              tileAspect,
              dragIndex === i && "opacity-50",
              !single && "cursor-grab active:cursor-grabbing",
            )}
          >
            <Image src={url} alt={`${altText} ${i + 1}`} fill sizes={single ? "(min-width: 768px) 480px, 100vw" : "160px"} className="object-cover" />
            {i === 0 && coverLabel && !single && (
              <Badge className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 gap-1 rounded-full text-[10px]">
                <Star className="size-3 fill-current" />
                {coverLabel}
              </Badge>
            )}
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-1.5 right-1.5 size-7 rounded-full shadow-sm"
              onClick={() => remove(i)}
              disabled={disabled}
              aria-label="この写真を削除"
            >
              <X className="size-3.5" />
            </Button>
            {!single && value.length > 1 && (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <Button type="button" size="icon" variant="secondary" className="size-7 rounded-full" onClick={() => move(i, i - 1)} disabled={i === 0 || disabled} aria-label="前へ移動">
                  <ArrowLeft className="size-3.5" />
                </Button>
                {i !== 0 && (
                  <Button type="button" size="sm" variant="secondary" className="h-7 rounded-full px-2 text-[10px]" onClick={() => move(i, 0)} disabled={disabled}>
                    <Star className="size-3" />
                    カバーに
                  </Button>
                )}
                <Button type="button" size="icon" variant="secondary" className="size-7 rounded-full" onClick={() => move(i, i + 1)} disabled={i === value.length - 1 || disabled} aria-label="後ろへ移動">
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.key} className={cn("bg-muted relative overflow-hidden rounded-xl border", tileAspect)}>
            <Image src={p.preview} alt="アップロード中の画像" fill unoptimized sizes="160px" className={cn("object-cover", !p.error && "opacity-60")} />
            <div className="bg-background/70 absolute inset-x-0 bottom-0 space-y-1 p-2 backdrop-blur-sm">
              {p.error ? (
                <div className="flex items-start gap-1.5">
                  <TriangleAlert className="text-destructive mt-0.5 size-3.5 shrink-0" />
                  <p className="text-destructive line-clamp-2 flex-1 text-[10px] leading-snug">{p.error}</p>
                  <button type="button" onClick={() => dismiss(p.key)} className="text-muted-foreground hover:text-foreground" aria-label="閉じる">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground text-[10px]">{p.progress < 100 ? `アップロード中 ${p.progress}%` : "保存中…"}</p>
                  <Progress value={p.progress} className="h-1" />
                </>
              )}
            </div>
          </div>
        ))}

        {canAdd && (!single || value.length === 0) && (
          <label
            htmlFor={inputId}
            className={cn(
              "border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center transition-colors",
              tileAspect,
              dragOver && "border-primary bg-primary/5 text-primary",
            )}
          >
            <ImagePlus className="size-6" />
            <span className="text-xs font-medium">写真を追加</span>
            <span className="hidden text-[10px] sm:block">ドラッグ&ドロップでもOK</span>
          </label>
        )}
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple={!single}
        className="sr-only"
        disabled={!canAdd}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={!canAdd}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {single ? "1枚" : `${value.length} / ${max}枚`}・長辺{maxDimension}pxに自動で縮小して保存します
          {!single && value.length > 1 && "・ドラッグまたは矢印で並べ替え"}
        </p>
        {canAdd && (
          <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={() => cameraRef.current?.click()}>
            <Camera />
            カメラで撮影
          </Button>
        )}
      </div>
    </div>
  );
}
