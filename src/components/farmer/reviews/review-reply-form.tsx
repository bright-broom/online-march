"use client";
import { MessageSquareReply, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { replyToReview } from "@/server/actions/reviews";

/** Inline reply (or edit) for a review. Published immediately on the product page. */
export function ReviewReplyForm({ reviewId, initial, customerName }: { reviewId: string; initial: string | null; customerName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initial);
  const [text, setText] = useState(initial ?? "");
  const [pending, start] = useTransition();

  if (!editing && initial) {
    return (
      <div className="bg-muted/50 rounded-lg border-l-4 border-primary/50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium">生産者からの返信</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="size-3" />編集
          </Button>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{initial}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await replyToReview({ reviewId, reply: text });
          if (res.ok) {
            toast.success(res.message ?? "返信を公開しました");
            setEditing(false);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        placeholder={`${customerName}さんへのお礼や、おすすめの食べ方などをひとこと`}
        aria-label="レビューへの返信"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">返信は商品ページに公開されます・<span className="num">{text.length}</span>/1000</span>
        <div className="flex gap-2">
          {initial && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setText(initial); setEditing(false); }}>
              やめる
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
            {pending ? <Spinner /> : <MessageSquareReply />}
            返信する
          </Button>
        </div>
      </div>
    </form>
  );
}
