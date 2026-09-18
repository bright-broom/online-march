"use client";
import { BadgePercent, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { formatYenJa } from "@/lib/format";

export function CouponField({
  code, onApply, onRemove, applied, error, discount, loading,
}: {
  code: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  applied: { code: string; description: string } | null;
  error: string | null;
  discount: number;
  loading: boolean;
}) {
  const [input, setInput] = useState(code ?? "");
  if (applied) {
    return (
      <div className="border-leaf/40 bg-leaf/10 flex items-start gap-3 rounded-xl border p-3">
        <BadgePercent className="text-leaf mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">
            <span className="font-mono">{applied.code}</span> を適用しました（−{formatYenJa(discount)}）
          </p>
          {applied.description && <p className="text-muted-foreground text-xs">{applied.description}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="クーポンを外す" onClick={onRemove}>
          <X />
        </Button>
      </div>
    );
  }
  const pendingThis = loading && !!code;
  return (
    <Field data-invalid={!!error}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const v = input.trim().toUpperCase();
          if (v) onApply(v);
        }}
      >
        <InputGroup className="h-10">
          <InputGroupAddon>
            <BadgePercent />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="クーポンコード"
            placeholder="クーポンコード"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoCapitalize="characters"
            className="font-mono uppercase"
            aria-invalid={!!error}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" variant="secondary" size="sm" disabled={!input.trim() || pendingThis}>
              {pendingThis && <Spinner />}適用
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
