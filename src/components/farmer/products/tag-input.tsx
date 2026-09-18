"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/** Chips input: Enter / 読点 / comma adds a tag; Backspace on empty removes the last. */
export function TagInput({
  id, value, onChange, max = 8, maxLength = 30, placeholder, invalid,
}: { id?: string; value: string[]; onChange: (v: string[]) => void; max?: number; maxLength?: number; placeholder?: string; invalid?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().slice(0, maxLength);
    if (!t || value.includes(t) || value.length >= max) return;
    onChange([...value, t]);
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <li key={t}>
              <Badge variant="secondary" className="h-7 gap-1 rounded-full pr-1 pl-2.5 text-xs">
                {t}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="hover:bg-foreground/10 rounded-full p-0.5" aria-label={`${t}を削除`}>
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        aria-invalid={invalid || undefined}
        disabled={value.length >= max}
        placeholder={value.length >= max ? `タグは${max}個までです` : placeholder}
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value;
          if (/[,、，]$/.test(v)) {
            add(v.slice(0, -1));
            setDraft("");
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
      />
    </div>
  );
}
