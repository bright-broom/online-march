import "server-only";
import { cacheLife } from "next/cache";

/**
 * sRGB equivalents of the globals.css tokens, for ImageResponse (Satori cannot read CSS variables / oklch).
 * Keep in sync with :root in src/app/globals.css.
 */
export const brandHex = {
  primary: "#b66c18",
  primaryForeground: "#fffbf4",
  leaf: "#478d4b",
  sea: "#18405f",
  seaForeground: "#f5f9fd",
  paper: "#fcfaf5",
  goldSoft: "#f3dab2",
  foreground: "#241b14",
} as const;

/** The onion mark (same geometry as <LogoMark>), for ImageResponse. */
export function OnionMarkSvg({ size, onDark = false }: { size: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M16 3c1.2 2.6 1.1 4.3 0 6" stroke={brandHex.leaf} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M16 9C9 9.5 5 14.5 5 19.5 5 25 10 29 16 29s11-4 11-9.5C27 14.5 23 9.5 16 9Z" fill={brandHex.primary} />
      <path
        d="M16 9c-3.5 2.2-5.5 6.2-5.5 10.5S12.5 27.2 16 29M16 9c3.5 2.2 5.5 6.2 5.5 10.5S19.5 27.2 16 29"
        stroke={onDark ? brandHex.seaForeground : brandHex.primaryForeground}
        strokeOpacity=".55"
        strokeWidth="1.3"
        fill="none"
      />
    </svg>
  );
}

/**
 * Subset of Shippori Mincho containing only `text`, base64-encoded (cache-serializable).
 * Returns null when Google Fonts is unreachable — ImageResponse then falls back to its default font.
 */
export async function loadMinchoSubset(text: string, weight = 700): Promise<string | null> {
  "use cache";
  cacheLife("max");
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      // An old Safari UA makes Google Fonts return TTF (Satori cannot read WOFF2).
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
    }).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}
