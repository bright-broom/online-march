# PERFORMANCE — キャッシュ・ストリーミング・遅延読込

`cacheComponents: true`（next.config.ts）。**静的シェルを最大化し、動的部分だけ Suspense でストリーム** する。

## 1. ルール（ビルドエラー回避）

1. `cookies()/headers()/searchParams/params(未生成)` や `getSessionUser()` を読むコンポーネントは **`<Suspense>` の内側**。
   ページ単位なら同階層の `loading.tsx` が Suspense になる。**layout のトップレベルで await しない。**
2. `new Date()` / `Date.now()` / `Math.random()` / `crypto.randomUUID()` をレンダー中に使う場合は
   先に `await connection()`（next/server）を呼ぶか、`"use cache"` 関数内で使う。Server Action / Route Handler 内は自由。
3. DB 読み取りは `server/queries/*` の `"use cache"` 関数経由。引数はシリアライズ可能な値のみ（userId, farmId, filters）。
4. `"use cache"` 内で cookies/headers を読まない（ユーザー依存は ID を引数で渡す）。

## 2. キャッシュ戦略

| データ | 指定 | 無効化 |
| --- | --- | --- |
| 商品一覧/詳細・農家ページ | `cacheLife("catalog")` + `cacheTag(tags.products / tags.product(id) / tags.farm(id))` | 商品/農家更新 action → `updateTag` |
| レビュー | `tags.productReviews(id)` | レビュー投稿・返信 |
| 設定 | `cacheLife("hours")` + `tags.settings` | admin 設定保存 |
| ダッシュボード集計 | `cacheLife("dashboard")` + `tags.analytics` / `tags.farmAnalytics(id)` | 注文状態変化（services が expire） |
| ユーザー固有（注文履歴等） | キャッシュしない（Suspense でストリーム） | — |

タグは **`src/lib/cache-tags.ts` のみ** から生成。services では `expireTags()`（server/cache.ts）、
Server Action では `updateTag()` も可。

## 3. 読み込み最適化

- **Eager**: ファーストビュー画像は `<Image priority>`（Hero・商品詳細メイン）。フォントは `display: swap`、和文は preload しない。
- **Lazy**:
  - グラフは `@/components/charts`（next/dynamic, ssr:false, 高さ固定スケルトン）。
  - 重いダイアログ/エディタ（画像アップローダ、CSV 取込、地図等）は `dynamic()`。
  - スクロール下部のセクション（レビュー、関連商品）は個別 `<Suspense>` でストリーム。
  - 画像は next/image 既定の lazy + `sizes` 指定、AVIF/WebP。
- **Prefetch**: `next/link` 既定（viewport 内で prefetch）。静的シェルのおかげで即時遷移。
- **Streaming**: 各ルートに `loading.tsx`（レイアウトと同じ骨格のスケルトン）を置き CLS を防ぐ。
- クライアント JS 最小化: `"use client"` は葉のコンポーネントに限定（カートボタン、フォーム、フィルタ）。
- 一覧のフィルタは URL（nuqs, `shallow: false`）で状態管理 → サーバーで絞り込み、共有可能な URL。

## 4. 計測

Vercel Speed Insights / Analytics を有効化推奨（`@vercel/speed-insights` を layout に追加するだけ）。
目標: LCP < 2.0s（4G）、CLS < 0.05、INP < 200ms。
