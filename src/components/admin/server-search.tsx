import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 運営の一覧の検索（#21）。GET のフォームで `?q=` を付けてページを読み直し、サーバー側で全件から探す。
 * タブなどの絞り込み（`keep`）はそのまま引き継ぐ。一覧表の中の絞り込みは、出ている結果の中で効く。
 */
export function ServerSearch({ action, q, placeholder, keep = {} }: { action: string; q?: string; placeholder: string; keep?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" role="search" className="flex max-w-md gap-2">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} maxLength={100} />
      <Button type="submit" variant="outline">
        <Search />
        検索
      </Button>
    </form>
  );
}
