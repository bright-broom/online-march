"use client";
import { ArrowLeft, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; body: string; senderId: string; createdAt: Date | string; pending?: boolean };
export type ChatCounterpart = { name: string; avatar?: string | null; subtitle?: string | null; href?: string | null };
type SendResult = { ok: true; data: { id: string } } | { ok: false; error: string };

const dayKey = (d: Date | string) => formatDate(d);
const timeOf = (d: Date | string) => formatDateTime(d).slice(-5);

/**
 * Reusable 1:1 chat thread (messages + composer).
 * - Optimistic append via useOptimistic; confirmed messages are kept locally until the server list includes them.
 * - Refreshes server data periodically / on focus (router.refresh) so replies appear without a reload.
 */
export function ChatThread({
  viewerId, messages, counterpart, onSend, onSeen, backHref, emptyHint, maxLength = 2000,
}: {
  viewerId: string;
  messages: ChatMessage[];
  counterpart: ChatCounterpart;
  onSend: (body: string) => Promise<SendResult>;
  /** called when the thread is opened / new incoming messages arrive */
  onSeen?: () => void;
  backHref?: string;
  emptyHint?: string;
  maxLength?: number;
}) {
  const router = useRouter();
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const merged = [...messages, ...sent.filter((s) => !messages.some((m) => m.id === s.id))];
  const [optimistic, addOptimistic] = useOptimistic(merged, (list, m: ChatMessage) => [...list, m]);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const incoming = messages.filter((m) => m.senderId !== viewerId).length;

  useEffect(() => {
    onSeen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when incoming count changes
  }, [incoming]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [optimistic.length]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    if (body.length > maxLength) {
      toast.error(`${maxLength}文字以内で入力してください`);
      return;
    }
    setDraft("");
    start(async () => {
      addOptimistic({ id: `tmp-${optimistic.length}`, body, senderId: viewerId, createdAt: new Date(), pending: true });
      const res = await onSend(body);
      if (!res.ok) {
        toast.error(res.error);
        setDraft(body);
        return;
      }
      setSent((s) => [...s, { id: res.data.id, body, senderId: viewerId, createdAt: new Date() }]);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        {backHref && (
          <Button asChild variant="ghost" size="icon-sm" className="md:hidden" aria-label="一覧に戻る">
            <Link href={backHref}><ArrowLeft /></Link>
          </Button>
        )}
        <Avatar className="size-9">
          {counterpart.avatar && <AvatarImage src={counterpart.avatar} alt={counterpart.name} />}
          <AvatarFallback className="bg-primary/15 text-primary font-serif">{counterpart.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {counterpart.href ? (
            <Link href={counterpart.href} className="block truncate font-serif font-semibold hover:underline">{counterpart.name}</Link>
          ) : (
            <p className="truncate font-serif font-semibold">{counterpart.name}</p>
          )}
          {counterpart.subtitle && <p className="text-muted-foreground truncate text-xs">{counterpart.subtitle}</p>}
        </div>
      </header>

      <div className="bg-muted/20 min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
        {optimistic.length === 0 ? (
          <div className="text-muted-foreground mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 text-center text-sm">
            <p className="heading-display text-foreground text-base">{counterpart.name}へのメッセージ</p>
            <p>{emptyHint ?? "はじめてのメッセージを送ってみましょう。"}</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {optimistic.map((m, i) => {
              const mine = m.senderId === viewerId;
              const showDay = i === 0 || dayKey(optimistic[i - 1].createdAt) !== dayKey(m.createdAt);
              return (
                <li key={m.id}>
                  {showDay && (
                    <p className="text-muted-foreground my-4 text-center text-[11px]">
                      <span className="bg-background rounded-full border px-3 py-1">{dayKey(m.createdAt)}</span>
                    </p>
                  )}
                  <div className={cn("flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-sm",
                        mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card rounded-bl-md border",
                        m.pending && "opacity-60",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="text-muted-foreground num shrink-0 text-[10px]">{m.pending ? "送信中" : timeOf(m.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            aria-label="メッセージ"
            placeholder="メッセージを入力（Shift+Enterで改行）"
            rows={2}
            maxLength={maxLength}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-40 min-h-11"
          />
          <InputGroupAddon align="inline-end" className="self-end">
            <InputGroupButton type="submit" variant="default" size="icon-sm" aria-label="送信" disabled={!draft.trim()}>
              <SendHorizontal />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
