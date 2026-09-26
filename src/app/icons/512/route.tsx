import { brandIcon } from "@/components/shop/brand-icon";

/** PWA（manifest.ts）用の 512px アイコン（#21）。中身は固定なのでビルド時に作られる */
export function GET() {
  return brandIcon(512, { fullBleed: true });
}
