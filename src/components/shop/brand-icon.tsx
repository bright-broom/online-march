import { ImageResponse } from "next/og";
import { brandHex, OnionMarkSvg } from "@/components/shop/brand-image";

/**
 * サイトのアイコン（玉ねぎのマークを和紙色の地に）。ファビコン・Apple のホーム画面・PWA で同じ絵を大きさ違いで出す（#21）。
 * `fullBleed` は角を丸めず地を全面に塗る（iOS やランチャーが自分で角を丸める・切り抜くため）。
 */
export function brandIcon(px: number, { fullBleed = false }: { fullBleed?: boolean } = {}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brandHex.paper,
          borderRadius: fullBleed ? 0 : Math.round(px / 4),
        }}
      >
        <OnionMarkSvg size={Math.round(px * (fullBleed ? 0.66 : 0.84))} />
      </div>
    ),
    { width: px, height: px },
  );
}
