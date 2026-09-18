import {
  Boxes, CalendarCheck, ClipboardCheck, Leaf, LineChart, MessageCircleHeart, MessageSquare, MessagesSquare,
  Package, PackageCheck, PackageOpen, Percent, Printer, Route, ShoppingBasket, Smartphone, Sprout, Sun,
  TriangleAlert, Truck, Wallet, type LucideIcon, type LucideProps,
} from "lucide-react";

/**
 * Icons referenced by *name* from config (content.ts / status.ts). Add here when config uses a new one.
 * (Keeps lucide tree-shakable — never import the whole icon set.)
 */
const icons = {
  Boxes, CalendarCheck, ClipboardCheck, Leaf, LineChart, MessageCircleHeart, MessageSquare, MessagesSquare,
  Package, PackageCheck, PackageOpen, Percent, Printer, Route, ShoppingBasket, Smartphone, Sprout, Sun,
  TriangleAlert, Truck, Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = icons[name as IconName] ?? Leaf;
  return <C {...props} />;
}
