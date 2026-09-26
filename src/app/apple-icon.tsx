import { brandIcon } from "@/components/shop/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone・iPad の「ホーム画面に追加」用（#21）。角は iOS が丸めるので地を全面に塗る */
export default function AppleIcon() {
  return brandIcon(size.width, { fullBleed: true });
}
