/** All navigation trees. Layout components render these; pages never define their own nav. */
import {
  BadgePercent,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  CircleUserRound,
  ClipboardList,
  Heart,
  HelpCircle,
  Home,
  LayoutDashboard,
  Leaf,
  MapPin,
  Megaphone,
  MessageCircle,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Tractor,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  /** key for live badge counts (see server/queries/badges.ts) */
  badge?: "newOrders" | "toShip" | "unreadMessages" | "pendingFarms" | "unreadNotifications";
};
export type NavGroup = { title: string; items: NavItem[] };

export const routes = {
  home: "/",
  products: "/products",
  product: (slug: string) => `/products/${slug}`,
  farms: "/farms",
  farm: (slug: string) => `/farms/${slug}`,
  cart: "/cart",
  checkout: "/checkout",
  checkoutSuccess: "/checkout/success",
  about: "/about",
  guide: "/guide",
  faq: "/faq",
  join: "/join",
  login: "/login",
  signup: "/signup",
  legal: { tokushoho: "/legal/tokushoho", terms: "/legal/terms", privacy: "/legal/privacy" },
  mypage: {
    root: "/mypage",
    orders: "/mypage/orders",
    order: (id: string) => `/mypage/orders/${id}`,
    receipt: (id: string) => `/mypage/orders/${id}/receipt`,
    favorites: "/mypage/favorites",
    addresses: "/mypage/addresses",
    reviews: "/mypage/reviews",
    messages: "/mypage/messages",
    notifications: "/mypage/notifications",
    settings: "/mypage/settings",
  },
  farmer: {
    root: "/farmer",
    products: "/farmer/products",
    newProduct: "/farmer/products/new",
    product: (id: string) => `/farmer/products/${id}`,
    orders: "/farmer/orders",
    order: (id: string) => `/farmer/orders/${id}`,
    shipping: "/farmer/shipping",
    slip: (id: string) => `/farmer/orders/${id}/slip`,
    reviews: "/farmer/reviews",
    messages: "/farmer/messages",
    payouts: "/farmer/payouts",
    shop: "/farmer/shop",
    settings: "/farmer/settings",
  },
  admin: {
    root: "/admin",
    farms: "/admin/farms",
    farm: (id: string) => `/admin/farms/${id}`,
    products: "/admin/products",
    orders: "/admin/orders",
    order: (id: string) => `/admin/orders/${id}`,
    users: "/admin/users",
    payouts: "/admin/payouts",
    coupons: "/admin/coupons",
    announcements: "/admin/announcements",
    automation: "/admin/automation",
    settings: "/admin/settings",
  },
} as const;

/** Where each role lands after login. */
export const roleHome = {
  customer: routes.mypage.root,
  farmer: routes.farmer.root,
  admin: routes.admin.root,
} as const;

export const shopNav: NavItem[] = [
  { title: "商品をさがす", href: routes.products, icon: ShoppingBag },
  { title: "生産者", href: routes.farms, icon: Tractor },
  { title: "淡路島たまねぎとは", href: routes.about, icon: Leaf },
  { title: "ご利用ガイド", href: routes.guide, icon: HelpCircle },
];

export const footerNav: NavGroup[] = [
  {
    title: "お買い物",
    items: [
      { title: "すべての商品", href: routes.products },
      { title: "新玉ねぎ", href: `${routes.products}?category=new_onion` },
      { title: "セット・ギフト", href: `${routes.products}?category=set` },
      { title: "生産者一覧", href: routes.farms },
    ],
  },
  {
    title: "サポート",
    items: [
      { title: "ご利用ガイド", href: routes.guide },
      { title: "よくある質問", href: routes.faq },
      { title: "マイページ", href: routes.mypage.root },
    ],
  },
  {
    title: "生産者のみなさまへ",
    items: [
      { title: "出店のご案内", href: routes.join },
      { title: "生産者ログイン", href: `${routes.login}?next=${routes.farmer.root}` },
    ],
  },
  {
    title: "運営について",
    items: [
      { title: "特定商取引法に基づく表記", href: routes.legal.tokushoho },
      { title: "利用規約", href: routes.legal.terms },
      { title: "プライバシーポリシー", href: routes.legal.privacy },
    ],
  },
];

export const mypageNav: NavGroup[] = [
  {
    title: "マイページ",
    items: [
      { title: "ホーム", href: routes.mypage.root, icon: Home },
      { title: "注文履歴", href: routes.mypage.orders, icon: Package },
      { title: "お気に入り", href: routes.mypage.favorites, icon: Heart },
      { title: "メッセージ", href: routes.mypage.messages, icon: MessageCircle, badge: "unreadMessages" },
      { title: "レビュー", href: routes.mypage.reviews, icon: Star },
      { title: "お知らせ", href: routes.mypage.notifications, icon: Bell, badge: "unreadNotifications" },
    ],
  },
  {
    title: "設定",
    items: [
      { title: "お届け先", href: routes.mypage.addresses, icon: MapPin },
      { title: "アカウント", href: routes.mypage.settings, icon: CircleUserRound },
    ],
  },
];

export const farmerNav: NavGroup[] = [
  {
    title: "ダッシュボード",
    items: [{ title: "概要", href: routes.farmer.root, icon: LayoutDashboard }],
  },
  {
    title: "販売",
    items: [
      { title: "受注管理", href: routes.farmer.orders, icon: ClipboardList, badge: "newOrders" },
      { title: "出荷センター", href: routes.farmer.shipping, icon: Truck, badge: "toShip" },
      { title: "商品管理", href: routes.farmer.products, icon: Boxes },
      { title: "メッセージ", href: routes.farmer.messages, icon: MessageCircle, badge: "unreadMessages" },
      { title: "レビュー", href: routes.farmer.reviews, icon: Star },
    ],
  },
  {
    title: "お金とお店",
    items: [
      { title: "売上・精算", href: routes.farmer.payouts, icon: Wallet },
      { title: "ショップページ", href: routes.farmer.shop, icon: Store },
      { title: "出荷・配送設定", href: routes.farmer.settings, icon: Settings },
    ],
  },
];

export const adminNav: NavGroup[] = [
  {
    title: "概要",
    items: [{ title: "ダッシュボード", href: routes.admin.root, icon: BarChart3 }],
  },
  {
    title: "マーケットプレイス",
    items: [
      { title: "生産者", href: routes.admin.farms, icon: Tractor, badge: "pendingFarms" },
      { title: "商品", href: routes.admin.products, icon: Boxes },
      { title: "注文", href: routes.admin.orders, icon: ClipboardList },
      { title: "ユーザー", href: routes.admin.users, icon: Users },
    ],
  },
  {
    title: "運営",
    items: [
      { title: "精算・振込", href: routes.admin.payouts, icon: Wallet },
      { title: "クーポン", href: routes.admin.coupons, icon: BadgePercent },
      { title: "お知らせ", href: routes.admin.announcements, icon: Megaphone },
      { title: "配送自動化", href: routes.admin.automation, icon: Bot },
      { title: "プラットフォーム設定", href: routes.admin.settings, icon: Settings },
    ],
  },
];
