import { brandIcon } from "@/components/shop/brand-icon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon: the onion mark on warm paper. */
export default function Icon() {
  return brandIcon(size.width);
}
