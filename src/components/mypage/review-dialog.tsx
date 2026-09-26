"use client";
import { PenLine } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { catalogLimits } from "@/config/catalog";
import { createReview, updateReview } from "@/server/actions/reviews";
import { StarPicker } from "./star-picker";

// 写真を付けるときだけ読み込む（圧縮・アップロードの処理が重いため）
const ImageUploader = dynamic(() => import("@/components/common/image-uploader"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[4/1] min-h-24 w-full rounded-xl" />,
});

type ReviewResult = Awaited<ReturnType<typeof createReview>> | Awaited<ReturnType<typeof updateReview>>;

/** `review` を渡すと編集、渡さなければ新規投稿。 */
export function ReviewDialog({
  productId, farmOrderId, productName, variantLabel, imageUrl, trigger, review,
}: {
  productId: string;
  /** 新規投稿のときだけ必要（どの注文の商品かを結びつける） */
  farmOrderId?: string;
  productName: string;
  variantLabel?: string;
  imageUrl?: string | null;
  trigger?: React.ReactNode;
  review?: { id: string; rating: number; title: string; body: string; images?: string[] };
}) {
  const router = useRouter();
  const editing = Boolean(review);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [body, setBody] = useState(review?.body ?? "");
  const [photos, setPhotos] = useState<string[]>(review?.images ?? []);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction] = useActionState<ReviewResult | null, FormData>(async (prev, fd) => {
    const res = review ? await updateReview(prev, fd) : await createReview(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? "レビューを投稿しました");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="rounded-full">
            <PenLine />{editing ? "編集" : "レビューを書く"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // 開いた直後は1つ目の星にフォーカスが入る。星は「フォーカス中の数」をプレビュー表示するので、
          // 5つ星で投稿したレビューを編集しようとすると★1に見えてしまう。編集では本文へフォーカスする。
          if (!editing) return;
          e.preventDefault();
          bodyRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "レビューを編集" : "レビューを書く"}</DialogTitle>
          <DialogDescription>味や大きさ、料理に使った感想など、次に選ぶ方の参考になることを教えてください。</DialogDescription>
        </DialogHeader>
        <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-3">
          <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
            {imageUrl && <Image src={imageUrl} alt={productName} fill sizes="48px" className="object-cover" />}
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{productName}</p>
            {variantLabel && <p className="text-muted-foreground text-xs">{variantLabel}</p>}
          </div>
        </div>
        <form action={formAction} className="space-y-5">
          {review ? (
            <input type="hidden" name="reviewId" value={review.id} />
          ) : (
            <>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="farmOrderId" value={farmOrderId} />
            </>
          )}
          <FieldGroup className="gap-4">
            <Field data-invalid={!!fe?.rating}>
              <FieldLabel>評価</FieldLabel>
              <StarPicker name="rating" value={rating} onChange={setRating} invalid={!!fe?.rating} />
              {fe?.rating && <FieldError>{fe.rating[0]}</FieldError>}
            </Field>
            <Field data-invalid={!!fe?.title}>
              <FieldLabel htmlFor={`rv-title-${productId}`}>タイトル（任意）</FieldLabel>
              <Input id={`rv-title-${productId}`} name="title" maxLength={60} defaultValue={review?.title} placeholder="甘くてサラダにぴったり" />
              {fe?.title && <FieldError>{fe.title[0]}</FieldError>}
            </Field>
            <Field data-invalid={!!fe?.body}>
              <FieldLabel htmlFor={`rv-body-${productId}`}>本文</FieldLabel>
              <Textarea
                ref={bodyRef}
                id={`rv-body-${productId}`}
                name="body"
                rows={5}
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="スライスして水にさらさずに食べても辛くなく…"
                aria-invalid={!!fe?.body || undefined}
              />
              <FieldDescription className="text-right">{body.length}/2000（10文字以上）</FieldDescription>
              {fe?.body && <FieldError>{fe.body[0]}</FieldError>}
            </Field>
            <Field data-invalid={!!fe?.images}>
              <FieldLabel>写真（任意・{catalogLimits.maxReviewImages}枚まで）</FieldLabel>
              <input type="hidden" name="images" value={JSON.stringify(photos)} />
              {open && (
                <ImageUploader value={photos} onChange={setPhotos} max={catalogLimits.maxReviewImages} folder="reviews" maxDimension={1600} coverLabel={false} altText={`${productName}の写真`} />
              )}
              <FieldDescription>届いた玉ねぎや、作った料理の写真など。商品ページに公開されます。</FieldDescription>
              {fe?.images && <FieldError>{fe.images[0]}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
            <SubmitButton className="rounded-full" disabled={!rating}>{editing ? "保存する" : "投稿する"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
