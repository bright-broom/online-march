import { ImageResponse } from "next/og";
import { brandHex, loadMinchoSubset, OnionMarkSvg } from "@/components/shop/brand-image";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Site-wide OG image: 瀬戸内の藍 × 玉ねぎの金, mincho headline. */
export default async function OpengraphImage() {
  const texts = [siteConfig.name, siteConfig.tagline, siteConfig.shortName, siteConfig.region, "産地直送"];
  const font = await loadMinchoSubset(texts.join(""));
  const fonts = font ? [{ name: "Shippori Mincho", data: Buffer.from(font, "base64"), weight: 700 as const, style: "normal" as const }] : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: brandHex.sea,
          color: brandHex.seaForeground,
          fontFamily: font ? "Shippori Mincho" : undefined,
          overflow: "hidden",
        }}
      >
        {/* onion-skin glow */}
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -140,
            width: 620,
            height: 620,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${brandHex.primary} 0%, rgba(182,108,24,0.35) 45%, rgba(24,64,95,0) 70%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 120,
            top: 150,
            display: "flex",
            opacity: 0.95,
          }}
        >
          <OnionMarkSvg size={300} onDark />
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, letterSpacing: 8, opacity: 0.8 }}>
            <span>{siteConfig.shortName}</span>
            <span style={{ width: 48, height: 1, background: brandHex.seaForeground, opacity: 0.5 }} />
            <span style={{ letterSpacing: 2 }}>{siteConfig.region}から産地直送</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 }}>
            <div style={{ fontSize: 84, lineHeight: 1.15, fontWeight: 700 }}>{siteConfig.name}</div>
            <div style={{ fontSize: 38, lineHeight: 1.5, color: brandHex.goldSoft }}>{siteConfig.tagline}</div>
          </div>

          <div style={{ display: "flex", width: 120, height: 6, borderRadius: 3, background: brandHex.primary }} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
