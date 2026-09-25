<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — あわじ玉ねぎマルシェ

南あわじ市の玉ねぎ農家が直販する産直マルシェ（食べチョク / ポケマル型）。
**このファイルは入口。詳細は必要な doc だけ読むこと（トークン節約）。**
（`CLAUDE.md`・`GEMINI.md`・`.github/copilot-instructions.md` はこのファイルを指すだけ。内容はここに一本化する）
どの AI・どの人が引き継いでも同じ手順で進められるよう、判断の根拠と作業の型はすべてリポジトリ内の文書に置く
（会話の記憶やツール固有のメモに頼らない）。気づいたことは該当の doc に書き足してから作業を終える。

## 引き継いだら最初にやること

1. `docs/STATUS.md` の 1節（本番環境の事実）と 2節（未完）を読む
2. 残作業を見る: `gh issue list --label P0` → `P1`（非公開リポジトリなのでログイン済みの `gh` が必要。→ STATUS 6節）
   - `owner-decision` の Issue は**オーナーの決定待ち**。勝手に決めて実装しない
3. `npm ci` → `npm run typecheck` / `npm run lint` / `npx vitest run` が通ることを確かめてから変更を始める
4. 着手する Issue を選んだら、関連する doc の該当節だけ読む（下の Doc map）

## Doc map（読む順・必要な時だけ）

| 目的 | 読む doc |
| --- | --- |
| **いまどこまで出来ていて、次に何をするか**（引き継ぎはまずここ） | `docs/STATUS.md`（残作業の一覧は GitHub Issues。`gh issue list --label P0`） |
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
Stripe (Checkout + Connect Accounts v2 / カード・PayPay・コンビニ払い) / Resend / Vercel Blob /
Vercel Cron / zod v4 / zustand / nuqs / vitest（PGlite 統合テスト）

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
8. **お客さまへの返金は `services/refunds.ts#refundOrder` だけ**（運営・生産者・お客さまのキャンセルとも）。Stripe を直接呼ばない。
   二重返金の防止・返金額の記録・返金メールがそこにまとまっている（`docs/PAYMENTS.md`）。
9. **運営の操作は二段階認証が前提**: ページ・Action はガード（`requireUser` / `assertUser`）を通すこと。
   ガードを通らない Route Handler を足すときは `needsTwoFactorSetup` を自分で確認する（例: `app/api/upload/route.ts`）。
10. **スキーマの変更は「足す」だけ**（列・テーブル・enum 値）。消す・改名は2段階で（`docs/STATUS.md` §4.1）。

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

## オーナーの承認なしにやってはいけないこと

取り消せない・外に出る操作は、実行するコマンドを示してオーナーの「はい」を待つ。

- 本番DBへの書き込み・削除（マイグレーションはビルドが当てるので通常は不要。テストデータの削除も内容を見せてから）
- Vercel・Stripe・Resend・Neon の設定変更（環境変数・Webhook・プロジェクトの作成や削除）、手動の本番デプロイ
- `main` 以外への force push、履歴の書き換え、Issue やリポジトリ設定の削除
- 実在のお客さま・生産者へのメール送信、本番での決済（テストカード以外）
- `owner-decision` ラベルの論点（売主の定義、規約の文言、税・価格表示のルールなど）を決めること

## コミットと Issue

- メッセージは `type(scope): 英語の要約`（`feat` / `fix` / `perf` / `docs` / `test` / `chore`）。本文に**なぜ**と、
  守りを足したなら**どう壊して確かめたか**を書く（例: `git log --grep "Verified red"`）
- Issue を解決するコミットには `Closes #番号` を入れる（push で自動的に閉じる）
- 見つけたが今やらない問題は Issue にする。ラベル: `P0` 公開前に必須 / `P1` 公開後すぐ / `P2` バックログ /
  `owner-decision` 判断待ち / `legal` `security` `payments` `ops` `admin` `feature` `bug`
- 本文には根拠のファイルと行、完了条件（どのテストで確かめるか）を書く
- 作業が終わったら `docs/STATUS.md` の 3節（本番で確かめたこと）と 7節（入れた機能と回帰テスト）を更新する

## 作業の進め方

- 変更前に該当 doc の該当節だけ読む。大きな設計変更は doc も同時に更新する。
- 新しい設定値は `src/config` に追加し、doc の該当表も更新。
- 完了条件: `npm run typecheck` / `npm run lint` / `npx vitest run` が通ること。
  （`npm run build` はサンドボックスだとフォント取得で落ちる。ビルドの確認は Vercel 側で行う）
- テストの置き場所・モックの書き方・落とし穴は `docs/STATUS.md` §4.3
- **守りを追加したらテストを書き、そのコードをわざと壊して落ちることまで確認する**（`docs/STATUS.md` §4.2）。
- スキーマを変えたら **本番DBへのマイグレーションを push より先に** 当てる（`docs/STATUS.md` §4.1）。
- 本番で動作確認したら、作ったテストデータは必ず消す（`docs/STATUS.md` §5）。
