"use client";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { varieties } from "@/config/catalog";
import { cn } from "@/lib/utils";

/** Variety picker: choose from config `varieties` or type a free-text variety. */
export function VarietyCombobox({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim();
  const custom = q && !(varieties as readonly string[]).includes(q);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "品種を選ぶ・入力する"}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="品種名で検索・入力" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>候補がありません</CommandEmpty>
            {custom && (
              <CommandGroup heading="入力した品種">
                <CommandItem
                  value={`custom:${q}`}
                  onSelect={() => {
                    onChange(q.slice(0, 40));
                    setOpen(false);
                  }}
                >
                  <Plus />「{q}」を使う
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="南あわじの主な品種">
              {varieties.map((v) => (
                <CommandItem
                  key={v}
                  value={v}
                  onSelect={() => {
                    onChange(v === value ? "" : v);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(v === value ? "opacity-100" : "opacity-0")} />
                  {v}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
