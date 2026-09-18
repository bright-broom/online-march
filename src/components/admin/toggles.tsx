"use client";
import { Switch } from "@/components/ui/switch";
import { setAnnouncementPublished, setCouponActive } from "@/server/actions/admin-content";
import { setFarmFeatured } from "@/server/actions/admin-farms";
import { setProductFeatured } from "@/server/actions/admin-catalog";
import { setReviewPublished } from "@/server/actions/reviews";
import { useRunAction } from "./use-admin-action";

/** Small optimistic-free switches bound to admin actions (the page re-renders via refresh()). */
function ActionSwitch({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: (next: boolean) => void }) {
  return <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />;
}

export function ReviewPublishSwitch({ reviewId, published }: { reviewId: string; published: boolean }) {
  const [pending, run] = useRunAction();
  return (
    <span className={pending ? "opacity-60" : undefined}>
      <ActionSwitch checked={published} label="レビューを公開" onToggle={(v) => run(() => setReviewPublished({ reviewId, published: v }))} />
    </span>
  );
}

export function FarmFeaturedSwitch({ farmId, featured }: { farmId: string; featured: boolean }) {
  const [pending, run] = useRunAction();
  return (
    <span className={pending ? "opacity-60" : undefined}>
      <ActionSwitch checked={featured} label="おすすめ生産者" onToggle={(v) => run(() => setFarmFeatured({ farmId, featured: v }))} />
    </span>
  );
}

export function ProductFeaturedSwitch({ productId, featured }: { productId: string; featured: boolean }) {
  const [pending, run] = useRunAction();
  return (
    <span className={pending ? "opacity-60" : undefined}>
      <ActionSwitch checked={featured} label="特集に掲載" onToggle={(v) => run(() => setProductFeatured({ productId, featured: v }))} />
    </span>
  );
}

export function CouponActiveSwitch({ id, active }: { id: string; active: boolean }) {
  const [pending, run] = useRunAction();
  return (
    <span className={pending ? "opacity-60" : undefined}>
      <ActionSwitch checked={active} label="クーポンを有効化" onToggle={(v) => run(() => setCouponActive({ id, active: v }))} />
    </span>
  );
}

export function AnnouncementPublishedSwitch({ id, published }: { id: string; published: boolean }) {
  const [pending, run] = useRunAction();
  return (
    <span className={pending ? "opacity-60" : undefined}>
      <ActionSwitch checked={published} label="お知らせを公開" onToggle={(v) => run(() => setAnnouncementPublished({ id, published: v }))} />
    </span>
  );
}
