# DEPLOY — ローカル起動と Vercel デプロイ

## ローカル（ゼロ設定）

```bash
npm install
npm run dev        # http://localhost:3000
```

- DB: `DATABASE_URL` 未設定 → PGlite が `.data/pglite` に自動作成・migrate・デモデータ投入。
- リセット: `rm -rf .data/pglite` して再起動、または `npm run db:reset`。
- デモアカウント（パスワード共通 `awaji-demo-2026`、/login に表示）
  - 購入者 `customer@demo.awaji` / 生産者 `farmer@demo.awaji` / 運営 `admin@demo.awaji`
- 決済・メール・画像保存はキー未設定ならデモモード（コンソール出力 / public/uploads）。

## Vercel

1. GitHub に push → Vercel で Import（Framework: Next.js、Build Command は既定の `npm run build`）。
2. **Storage → Neon (Postgres)** を追加 → `DATABASE_URL` が自動設定。
3. **Storage → Blob** を追加 → `BLOB_READ_WRITE_TOKEN` が自動設定。
4. Environment Variables:

| Key | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Neon（pooled） |
| `BETTER_AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_SITE_URL` | ✅ | 本番URL（https://…） |
| `CRON_SECRET` | ✅ | 任意の長い文字列（Vercel Cron が送信） |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 本番 | Webhook: `https://<domain>/api/webhooks/stripe`（checkout.session.*, account.updated） |
| `RESEND_API_KEY` / `EMAIL_FROM` | 本番 | 送信ドメインを Resend で認証 |
| `BLOB_READ_WRITE_TOKEN` | ✅ | 画像アップロード |
| `DEMO_MODE` | 任意 | `true` でデモアカウント表示・デモ決済を許可 |

5. Deploy。`npm run build` が `db:migrate` を先に実行（DATABASE_URL がある場合）。
6. 初回のみデモデータ: ローカルで `DATABASE_URL=... npm run db:seed`（本番運用では不要）。
7. **Region は DB と同じ場所に置く**（vercel.json `regions`）。現在 Neon が `us-east-1` のため関数は `iad1`。
   静的シェルは CDN（東京エッジ）から配信されるので、日本からの初期表示は速い。動的部分のみ iad1 往復。
   → 本番運用前に Neon を `aws-ap-southeast-1`（シンガポール）で作り直し、`regions: ["sin1"]` にするのが次の一手
   （Neon の Vercel 連携は東京リージョン非対応のため sin1 が最短）。
8. デプロイ補助: `bash scripts/deploy-vercel.sh` — 環境変数/Neon/Blob の確認・作成、seed、push、ビルドログ取得、
   スモークテストまで実行し、結果を `.deploy/run.log`・`.deploy/build.log` に保存する。

## Runbook: DB をシンガポールへ移す（本番データ投入前に推奨）

日本からの動的レスポンスを約半分にする。Neon の Vercel 連携は東京非対応のため sin1 が最短。
1. `vercel integration add neon --name awaji-marche-db-sg -m region=sin1 --prefix SG_`（SG_DATABASE_URL が追加される）
2. `DATABASE_URL=<SG_DATABASE_URL> npm run db:seed`（migrate + seed。実データがある場合は pg_dump/pg_restore で移送）
3. Dashboard → Settings → Environment Variables で `DATABASE_URL` を SG の値に差し替え（Production/Preview）
4. `vercel.json` の `regions` を `["sin1"]`、Blob も `--region sin1` で作り直す場合は同様に差し替え
5. push → デプロイ → `bash scripts/deploy-vercel.sh` のスモークテストで確認 → 旧 Neon を削除

## 注意: ローカル開発で本番DBを使わない

`vercel integration add` / `vercel env pull` は `.env.local` に本番（Neon）の `DATABASE_URL` を書き込み、
Next.js はそれを自動で読むため **ローカル開発が本番DBに書き込む状態** になる。
ローカルは PGlite を使う（`.env.local` に `DATABASE_URL` を置かない）。Neon を使う検証は
`set -a; . <pulled-env>; set +a` で明示的に一時注入する。

## 本番前チェックリスト

- [ ] `config/site.ts` の運営者情報・特商法表記を実データに
- [ ] `config/content.ts` legal の規約・プライバシーポリシーを正式版に
- [ ] `config/shipping.ts` の運賃表を契約運賃に
- [ ] Stripe: 本番キー、Connect 有効化、Payment methods 設定
- [ ] Resend: ドメイン認証、`EMAIL_FROM`
- [ ] Cron: Pro プラン or スケジュール調整（docs/SHIPPING.md §4）
- [ ] デモアカウント削除 / `DEMO_MODE` 無効
