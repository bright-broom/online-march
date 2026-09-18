# CONVENTIONS — コーディング規約

## 命名・ファイル

- ファイル名 kebab-case、コンポーネント PascalCase、hooks `use-*.ts`。1ファイル1責務、~300行を目安に分割。
- `app/**/page.tsx` は「データ取得 + レイアウト組立」のみ。UI 部品は `components/<area>/`。
- Server 専用モジュールは先頭に `import "server-only";`。
- import は `@/` エイリアス。相対 import は同ディレクトリ内のみ。

## クエリ（server/queries/*.ts）

```ts
import "server-only";
export async function getProductBySlug(slug: string) {
  "use cache";
  cacheLife("catalog");
  cacheTag(tags.products);
  const p = await db.query.products.findFirst({ where: eq(products.slug, slug), with: { variants: true } });
  if (p) cacheTag(tags.product(p.id));
  return p;
}
```

- 返り値は画面が必要な形に整形（DTO）。パスワード等の機微情報を返さない。
- 型は `Awaited<ReturnType<typeof fn>>` で UI 側に渡す。

## Server Actions（server/actions/*.ts）

```ts
"use server";
export async function updateProduct(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { farm } = await assertFarm();                 // 1. 認可
    const input = parseInput(productSchema, formToObject(formData)); // 2. 検証 (zod: lib/validators)
    const row = await ...;                                // 3. 実行（状態遷移は services）
    updateTag(tags.product(row.id));                      // 4. キャッシュ無効化
    return { id: row.id };
  }, "商品を保存しました");                               // 5. トースト文言
}
```

- 返り値は常に `ActionResult<T>`。例外で UI を落とさない（`ActionError` を throw → `{ok:false}`）。
- クライアントは `useActionState` + `toast`、または `useTransition` で直接呼ぶ。
- `redirect()` は runAction の外 or 内で可（unstable_rethrow 済み）。

## トランザクション

- `db.transaction(async (tx) => …)` の中では **必ず `tx` だけ** を使う（ヘルパーには `exec` 引数で tx を渡す）。
  グローバル `db` を呼ぶと、ローカルの PGlite（単一接続）ではデッドロック、本番では Tx 外読み取りになる。
- 通知・メール等の副作用は Tx の **外**（コミット後）で行う。

## バリデーション

- zod v4 スキーマは `src/lib/validators/*.ts`（client/server 共用）。メッセージは日本語。
- 数値は `z.coerce.number().int()`、円は `min(0)`。

## UI

- shadcn/ui + lucide のみ。色は トークン（docs/DESIGN.md）。状態は `StatusBadge`。
- 文言・ラベル・リンクは config から。ページ固有の説明文のみ JSX に書いてよい。
- ループ中のリンクは `routes.*()` で生成。
- 日付・金額は `lib/format.ts`。業務日付計算は `lib/dates.ts`（JST）。

## テスト観点（追加時）

- 純関数（lib/shipping, lib/dates, fees）はユニットテスト対象（vitest 推奨）。
- services は PGlite(memory://) で統合テスト可能（`seed()` を使う）。
