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
- **運営だけが使う Action（`assertRole("admin")`。多くは `actions/admin-*.ts`）は、成功したら `services/audit.ts#recordAudit(me, …)` で操作記録を残す**（#19）。
  `action` は `config/audit.ts#auditActions` に足す。失敗した操作は記録しない（ガードや `ActionError` の後で呼ぶ）。
  記録を書かない運営 Action を足すと `test/admin-audit-coverage.test.ts` が落ちる。
- Action の想定外のエラーは `runAction` が運営に通知する（#12）。利用者向けの失敗は `ActionError` で投げる。
- 連打や総当たりの的になる入力（投稿・送信・アップロード・コードの入力）には回数制限を付ける（#21）:
  `services/rate-limit.ts#consumeRateLimit(name, me.id)` が false なら `ActionError(rateLimits[name].message)`。
  上限は `config/rate-limits.ts`。失敗したときだけ数えるもの（使えないクーポン）は `isRateLimited` で先に見て、失敗時に数える。
  認証まわり（ログイン・登録・再設定・メール変更）は Better Auth 側の `rateLimit.customRules`。

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

- 純関数（lib/shipping, lib/dates, fees）はユニットテスト対象（vitest）。
- services は PGlite(`memory://`) で統合テスト。ファイルごとに独立DBが立つので、シードデータを壊してよい。
- テスト名は日本語で「何が守られているか」を書く（例: `受付の一時停止 > 止めている間は注文できない`）。
- **お金・在庫・個人情報に関わる守りを足したら、そのコードをわざと壊してテストが落ちることまで確認する。**
  壊す前に `cp <file> "$TMPDIR/x.bak"` を取る（`git checkout --` は未コミットの変更ごと消える）。詳細は `docs/STATUS.md` §4.2。
- 外部サービス（Stripe など）を叩く箇所はアダプタごと差し替える。ただし **Webhook の署名検証は本物のまま**にする
  （`services/__tests__/deferred-payment.test.ts` のように `importActual` で必要な関数だけ差し替える）。

## 認可（ガード + 所有者チェック）

`assertUser/assertRole/assertFarm` は **誰が呼んだか** しか決めない。ID を受け取るアクションは、その行が呼び出し元の
ものであることを **クエリの where で** 確かめる（`eq(products.farmId, farm.id)` / `eq(orders.userId, me.id)` など）。
入力に含まれる**他テーブルの ID**（`farmOrderId` のような参照）も、今は画面に出していなくても検証する。

回帰テストは `src/server/actions/__tests__/authorization.test.ts`。セッションだけを差し替えて実アクションを呼び、
他人の商品・注文・住所・レビュー・メッセージを対象にして「失敗すること」と「データが変わらないこと」を確認する。
アクションを追加したら、ここにも1ケース足す。
