import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * レビューの写真（#21）。小さく並べ、押すと元の大きさで開く。サーバー・クライアントのどちらからも使える。
 * 写真に問題があるときは、運営がレビューごと非公開にする（写真だけを消す操作はない）。
 */
export function ReviewPhotos({ images, alt, size = 80, className }: { images: string[]; alt: string; size?: number; className?: string }) {
  if (!images.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="お客さまの写真">
      {images.map((src, i) => (
        <li key={src}>
          <a href={src} target="_blank" rel="noopener noreferrer" className="bg-muted relative block overflow-hidden rounded-lg border" style={{ width: size, height: size }}>
            <Image src={src} alt={`${alt}（写真${i + 1}）`} fill sizes={`${size}px`} className="object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}
