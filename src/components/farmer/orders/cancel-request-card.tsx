"use client";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { orderCancelCopy, orderCancelPolicy } from "@/config/order-cancel";
import { formatDateTime } from "@/lib/format";
import { answerCancel } from "@/server/actions/farmer-orders";

const copy = orderCancelCopy.farmer;

/** お客さまからのキャンセルの依頼（#18）。回答するまで発送済みにできない。回答できるのはキャンセルの権限がある人だけ（サーバーでも断る） */
export function CancelRequestCard({ id, reason, requestedAt, allowAnswer }: { id: string; reason: string; requestedAt: Date; allowAnswer: boolean }) {
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState<"approve" | "decline" | null>(null);

  const submit = (approve: boolean) =>
    start(async () => {
      const res = await answerCancel({ id, approve, reply: approve ? undefined : reply });
      if (res.ok) {
        toast.success(res.message);
        setOpen(null);
      } else toast.error(res.error);
    });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquareWarning className="text-destructive size-4" />{copy.requestTitle}</CardTitle>
        <CardDescription>{copy.requestHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <blockquote className="bg-muted/50 rounded-lg border-l-4 p-3 text-sm leading-relaxed whitespace-pre-wrap">{reason}</blockquote>
        <p className="text-muted-foreground text-xs">{formatDateTime(requestedAt)} に依頼</p>
        {allowAnswer ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <AlertDialog open={open === "approve"} onOpenChange={(o) => setOpen(o ? "approve" : null)}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={pending}><Check />{copy.approve}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.approve}</AlertDialogTitle>
                  <AlertDialogDescription>{copy.approveConfirm}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>やめる</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={pending} onClick={(e) => { e.preventDefault(); submit(true); }}>
                    {pending ? <Spinner /> : <Check />}{copy.approve}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={open === "decline"} onOpenChange={(o) => setOpen(o ? "decline" : null)}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={pending}><X />{copy.decline}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.decline}</AlertDialogTitle>
                  <AlertDialogDescription>お客さまにお知らせし、このまま発送します。</AlertDialogDescription>
                </AlertDialogHeader>
                <Field>
                  <FieldLabel htmlFor="cancel-reply">{copy.declineReplyLabel}</FieldLabel>
                  <Textarea id="cancel-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={orderCancelPolicy.replyMaxLength} placeholder="例：すでに収穫して箱詰めが済んでいるため、このままお届けします" />
                </Field>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>やめる</AlertDialogCancel>
                  <AlertDialogAction disabled={pending} onClick={(e) => { e.preventDefault(); submit(false); }}>
                    {pending ? <Spinner /> : <X />}{copy.decline}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{copy.viewOnly}</p>
        )}
      </CardContent>
    </Card>
  );
}
