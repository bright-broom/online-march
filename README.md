# あわじ玉ねぎマルシェ（Awaji Onion Marché）

兵庫県南あわじ市の玉ねぎ農家さんが、畑から直接全国へ届ける産直マーケットプレイス。
食べチョク / ポケットマルシェ型のマルチ出品者モデル、販売手数料 10%。

## できること

| 利用者 | 主な機能 |
| --- | --- |
| お客さま | 商品検索・絞り込み / 農家ページ / カート（農家別送料・最短お届け日を即時計算）/ お届け日時・のし指定 / Stripe 決済 / 注文追跡タイムライン / レビュー / お気に入り・フォロー / 農家とのメッセージ / 領収書 |
| 生産者 | 売上ダッシュボード（グラフ）/ 商品登録（写真・規格・在庫）/ 受注管理 / **出荷センター**（送り状CSV: B2クラウド・ゆうプリR・e飛伝、追跡番号一括取込、納品書印刷）/ レビュー返信 / メッセージ / 精算・振込（Stripe Connect）/ ショップページ編集 / 出荷設定 |
| 運営 | KPI・GMV・手数料分析 / 出店審査 / 商品・レビュー管理 / 注文・返金 / ユーザー / 精算 / クーポン / お知らせ / **配送自動化**（Cron ジョブ監視・手動実行）/ 手数料率設定 |

**配送の自動化**: 決済完了 → 農家へ受注通知・出荷期限算出 → 送り状CSV → 追跡番号登録で発送メール →
配達完了の自動反映 → レビュー依頼 → 月次精算・送金、までを Vercel Cron で自動実行。

## Quick start

```bash
npm install
npm run dev
```

DB は自動（組込み Postgres = PGlite）。デモアカウント（パスワード `awaji-demo-2026`）:
`customer@demo.awaji` / `farmer@demo.awaji` / `admin@demo.awaji`

## Stack

Next.js 16 (App Router, Cache Components/PPR) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · lucide-react ·
Recharts · Drizzle ORM · Neon Postgres / PGlite · Better Auth · Stripe Checkout + Connect · Resend · Vercel Blob · Vercel Cron · zod · zustand · nuqs · Vitest

## CI / 本番

- GitHub Actions（`.github/workflows/ci.yml`）: typecheck・lint・test・migration 整合・本番ビルド
- 本番: https://awaji-marche.vercel.app （main への push で自動デプロイ）

## Docs

開発ガイドは [`AGENTS.md`](AGENTS.md) から。設計詳細は [`docs/`](docs)（ARCHITECTURE / DESIGN / DATA_MODEL / SHIPPING / PAYMENTS / PERFORMANCE / CONVENTIONS / DEPLOY）。

## Scripts

| Script | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | migrate（DATABASE_URL時）+ 本番ビルド |
| `npm test` | Vitest（純関数 + 注文ライフサイクル・返金・自動化ジョブの統合テスト） |
| `npm run typecheck` / `lint` | 型・Lint |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:reset` | DB |
