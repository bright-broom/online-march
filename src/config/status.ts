/**
 * Status vocabularies: label + badge tone + allowed transitions.
 * Use <StatusBadge kind="farmOrder" status={...} /> — never hardcode labels/colors.
 */
import type {
  FarmOrderStatus,
  FarmStatus,
  OrderStatus,
  PayoutStatus,
  ProductStatus,
  ShipmentEventType,
} from "@/db/schema/marketplace";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

type StatusMeta = { label: string; tone: Tone; description?: string };

export const orderStatusMeta: Record<OrderStatus, StatusMeta> = {
  pending_payment: { label: "お支払い待ち", tone: "warning" },
  paid: { label: "お支払い済み", tone: "success" },
  cancelled: { label: "キャンセル", tone: "neutral" },
  refunded: { label: "返金済み", tone: "danger" },
};

export const farmOrderStatusMeta: Record<FarmOrderStatus, StatusMeta & { step: number }> = {
  pending_payment: { label: "入金待ち", tone: "warning", step: 0, description: "決済の完了を待っています" },
  paid: { label: "新規受注", tone: "brand", step: 1, description: "ご注文を受け付けました" },
  preparing: { label: "出荷準備中", tone: "info", step: 2, description: "生産者が収穫・箱詰めしています" },
  shipped: { label: "発送済み", tone: "info", step: 3, description: "配送業者にお渡ししました" },
  delivered: { label: "配達完了", tone: "success", step: 4, description: "お届けが完了しました" },
  cancelled: { label: "キャンセル", tone: "neutral", step: -1 },
  refunded: { label: "返金済み", tone: "danger", step: -1 },
};

/** Customer-facing progress steps (mypage order tracker). */
export const fulfillmentSteps: FarmOrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

export const farmOrderTransitions: Record<FarmOrderStatus, FarmOrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "shipped", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const productStatusMeta: Record<ProductStatus, StatusMeta> = {
  draft: { label: "下書き", tone: "neutral" },
  active: { label: "販売中", tone: "success" },
  soldout: { label: "売り切れ", tone: "warning" },
  archived: { label: "アーカイブ", tone: "neutral" },
};

export const farmStatusMeta: Record<FarmStatus, StatusMeta> = {
  pending: { label: "審査中", tone: "warning" },
  active: { label: "公開中", tone: "success" },
  suspended: { label: "停止中", tone: "danger" },
};

export const payoutStatusMeta: Record<PayoutStatus, StatusMeta> = {
  pending: { label: "振込予定", tone: "warning" },
  processing: { label: "処理中", tone: "info" },
  paid: { label: "振込済み", tone: "success" },
};

export const shipmentEventMeta: Record<ShipmentEventType, { label: string; icon: string }> = {
  order_received: { label: "ご注文受付", icon: "ClipboardCheck" },
  label_created: { label: "送り状発行", icon: "Printer" },
  shipped: { label: "発送", icon: "Truck" },
  in_transit: { label: "輸送中", icon: "Route" },
  out_for_delivery: { label: "配達中", icon: "PackageOpen" },
  delivered: { label: "配達完了", icon: "PackageCheck" },
  exception: { label: "配送トラブル", icon: "TriangleAlert" },
  note: { label: "メモ", icon: "MessageSquare" },
};

/** Tailwind classes per tone — consumed only by components/common/status-badge.tsx */
export const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
  warning: "bg-amber-500/12 text-amber-800 border-amber-500/25 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  danger: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
  brand: "bg-primary/12 text-primary border-primary/25",
};
