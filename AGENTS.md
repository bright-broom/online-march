<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — あわじ玉ねぎマルシェ

南あわじ市の玉ねぎ農家が直販する産直マルシェ（食べチョク / ポケマル型）。
**このファイルは入口。詳細は必要な doc だけ読むこと（トークン節約）。**

## Doc map（読む順・必要な時だけ）

| 目的 | 読む doc |
| --- | --- |
| 全体構成・ディレクトリ・レイヤ責務 | `docs/ARCHITECTURE.md` |
| UI / デザイントークン / コピーのトーン | `docs/DESIGN.md` |
| テーブル / 型 / 状態遷移 | `docs/DATA_MODEL.md` |
| 配送料・出荷自動化・Cron | `docs/SHIPPING.md` |
| 決済・手数料・精算 | `docs/PAYMENTS.md` |
| キャッシュ / 遅延読込 / Cache Components 規約 | `docs/PERFORMANCE.md` |
| コーディング規約・命名・Server Action 型 | `docs/CONVENTIONS.md` |
| ローカル起動 / Vercel デプロイ / 環境変数 | `docs/DEPLOY.md` |

## Stack（2026-09 時点の最新）

Next.js 16 (App Router, **Cache Components 有効**, Turbopack) / React 19 / TypeScript strict /
Tailwind CSS v4 / shadcn/ui (radix-nova) / lucide-react / Recharts (shadcn chart) /
Drizzle ORM + Postgres（本番 Neon、ローカル PGlite 自動起動）/ Better Auth /
Stripe (Checkout + Connect) / Resend / Vercel Blob / Vercel Cron / zod v4 / zustand / nuqs

## 絶対ルール（違反 = バグ）

1. **ハードコード禁止**: 文言・金額・率・ナビ・ステータス名・配送設定は `src/config/*` から参照。
   ページに日本語ラベルを直書きしてよいのは、そのページ固有の見出し・説明文のみ。
2. **DB アクセスはサーバー層のみ**: `src/server/queries/*`（読取, `"use cache"` + `cacheTag`）と
   `src/server/actions/*`（書込, `"use server"`, zod 検証, 権限チェック, `updateTag`）。
   コンポーネントから `db` を直接 import しない。
3. **認可は必ずサーバーで**: `requireUser/requireRole/requireFarm`（ページ）・`assertUser/assertRole/assertFarm`（Action）— `src/server/auth/guards.ts`。
4. **Cache Components 規約**: cookies/headers/searchParams/`Date.now()` を読む部分は `<Suspense>` 内へ。
   詳細 `docs/PERFORMANCE.md`。
5. **金額は整数（円）**、日時は `timestamptz`、表示は `src/lib/format.ts` 経由。
6. **UI は shadcn/ui + lucide を使う**。新規プリミティブを自作する前に `src/components/ui` を確認。
   shadcn 追加は `node scripts/shadcn-add.mjs <name>`（CLI はサンドボックスで動かないため）。
7. 外部サービス（Stripe/Resend/Blob/配送API）は `src/server/services/*` のアダプタ越しに呼ぶ。
   キー未設定時は **デモモード** で動作すること（`src/lib/env.ts` の `features`）。

## Commands

```bash
npm run dev          # PGlite を .data/pglite に自動作成・migrate・seed して起動
npm run typecheck    # tsc --noEmit（並行作業中はこれを使う。build は統合担当のみ）
npm run lint
npm run build        # DATABASE_URL 未設定時は in-memory PGlite で prerender
npm run db:generate  # schema.ts 変更後にマイグレーション SQL 生成（必須）
npm run db:migrate   # DATABASE_URL の DB へ適用
npm run db:seed      # デモデータ投入
npm run deps:verify  # 依存を変更したら必須: CI と同じ npm で lockfile を検証
```

**依存の変更は npm 11.6.2（package.json#packageManager）で行う。** npm 10 と 11 で optional な wasm 依存の
lockfile 表現が異なり、CI の `npm ci` が落ちる。変更後は必ず `npm run deps:verify`。

## Roles

`customer`（購入者）/ `farmer`（出品農家）/ `admin`（運営）。1ユーザー1ロール。
デモアカウントは `src/config/demo.ts`。

## 作業の進め方

- 変更前に該当 doc の該当節だけ読む。大きな設計変更は doc も同時に更新する。
- 新しい設定値は `src/config` に追加し、doc の該当表も更新。
- 完了条件: `npm run typecheck` と `npm run lint` が通ること。
