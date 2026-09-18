import { ImageResponse } from "next/og";
import { brandHex, OnionMarkSvg } from "@/components/shop/brand-image";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon: the onion mark on warm paper. */
export default function Icon() {
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
          borderRadius: 16,
        }}
      >
        <OnionMarkSvg size={54} />
      </div>
    ),
    size,
  );
}
