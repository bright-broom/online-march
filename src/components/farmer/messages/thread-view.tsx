"use client";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/server/actions/messages";

type Msg = { id: string; body: string; senderId: string; senderName: string | null; createdAt: Date | string; readAt: Date | string | null };

/** よく使う返信（タップで入力欄に挿入） */
const quickReplies = [
  "ご注文ありがとうございます。収穫したてをお届けできるよう準備いたします。",
  "本日発送いたしました。到着まで今しばらくお待ちください。",
  "お問い合わせありがとうございます。確認して改めてご連絡いたします。",
];

/**
 * 農園側（オーナー・スタッフ）のスレッド。お客さま以外が送ったものは「農園から」として右に並べ、送った人の名前を添える（#24）。
 * お客さまの画面（components/messages/customer-thread.tsx）には送った人の名前を出さない。
 */
export function ThreadView({ farmId, customerId, messages }: { farmId: string; customerId: string; messages: Msg[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const res = await sendMessage({ farmId, customerId, body });
      if (res.ok) {
        setBody("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground py-10 text-center text-sm">まだメッセージはありません。最初のひとことを送ってみましょう。</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId !== customerId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] space-y-1", mine && "items-end text-right")}>
                <p
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed whitespace-pre-wrap",
                    mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md",
                  )}
                >
                  {m.body}
                </p>
                <p className="text-muted-foreground px-1 text-[10px] tabular-nums">
                  {mine && m.senderName && `${m.senderName}・`}
                  {formatDateTime(m.createdAt)}
                  {mine && m.readAt && "・既読"}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBody((b) => (b ? `${b}\n${q}` : q))}
              className="bg-muted hover:bg-muted/70 shrink-0 rounded-full px-3 py-1 text-xs"
            >
              {q.slice(0, 14)}…
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="メッセージを入力"
            aria-label="メッセージ"
            className="min-h-11 flex-1 resize-none"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={pending || !body.trim()} aria-label="送信">
            {pending ? <Spinner /> : <Send />}
          </Button>
        </div>
        <p className="text-muted-foreground hidden text-[10px] sm:block"><Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> で送信</p>
      </form>
    </div>
  );
}
