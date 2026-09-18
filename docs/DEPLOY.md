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
7. Region は `hnd1`（東京）に固定済み（vercel.json）。Neon も `aws-ap-northeast-1` を推奨。

## 本番前チェックリスト

- [ ] `config/site.ts` の運営者情報・特商法表記を実データに
- [ ] `config/content.ts` legal の規約・プライバシーポリシーを正式版に
- [ ] `config/shipping.ts` の運賃表を契約運賃に
- [ ] Stripe: 本番キー、Connect 有効化、Payment methods 設定
- [ ] Resend: ドメイン認証、`EMAIL_FROM`
- [ ] Cron: Pro プラン or スケジュール調整（docs/SHIPPING.md §4）
- [ ] デモアカウント削除 / `DEMO_MODE` 無効
