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
| `STRIPE_SECRET_KEY` | 本番 | 未設定ならデモ決済。まずテストキー（sk_test_）で検証 |
| `STRIPE_WEBHOOK_SECRET` | 本番 | 送信先①「自分のアカウント」: `checkout.session.{completed,async_payment_succeeded,expired,async_payment_failed}` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | 本番 | 送信先②「連結アカウント」: `account.updated`。URL はどちらも `https://<domain>/api/webhooks/stripe` |
| `STRIPE_ACCOUNTS_WEBHOOK_SECRET` | 推奨 | 送信先③「自分のアカウント」・ペイロード thin: `v2.core.account[configuration.recipient].capability_status_updated`, `v2.core.account[requirements].updated`。URL `https://<domain>/api/webhooks/stripe/accounts` |
| `RESEND_API_KEY` / `EMAIL_FROM` | 本番 | 送信ドメインを Resend で認証 |
| `BLOB_READ_WRITE_TOKEN` | ✅ | 画像アップロード（公開ストア） |
| `BACKUP_BLOB_READ_WRITE_TOKEN` | 推奨 | **非公開**ストアの RW トークン。`backup-db` が毎日 JSON(gzip) を保存（14日保持）。顧客データを含むため公開ストアとは必ず分ける |
| `DEMO_MODE` | 任意 | `true` でデモアカウント表示・デモ決済を許可 |

5. Deploy。`npm run build` が `db:migrate` を先に実行（DATABASE_URL がある場合）。
6. 初回のみデモデータ: ローカルで `DATABASE_URL=... npm run db:seed`（本番運用では不要）。
7. **Region は DB と同じ場所に置く**（vercel.json `regions`）。現在は Neon `ap-southeast-1`（シンガポール）+ 関数 `sin1`。
   静的シェルは CDN（東京エッジ）から配信され、動的部分のみ sin1 往復。2026-09 の実測（日本から）:
   関数のみ 220ms → 145ms、関数+DB 360ms → 155ms（移設前は us-east-1 / iad1）。Neon は Tokyo 非対応のため sin1 が最短。
8. デプロイ補助: `bash scripts/deploy-vercel.sh` — 環境変数/Neon/Blob の確認・作成、seed、push、ビルドログ取得、
   スモークテストまで実行し、結果を `.deploy/run.log`・`.deploy/build.log` に保存する。

## セキュリティヘッダー / CSP

`next.config.ts` の `securityHeaders` が全レスポンスに付く。HSTS は Vercel 側が付与する。

| ヘッダー | 値 |
| --- | --- |
| `Content-Security-Policy` | **本番のみ**。`default-src 'self'` を土台に、画像は Unsplash と Blob、`frame-ancestors`/`object-src` は none、`form-action`/`base-uri` は self |
| `X-Frame-Options` | `DENY`（`frame-ancestors` の旧ブラウザ向け） |
| `X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy` | nosniff / strict-origin-when-cross-origin / カメラ・マイク・位置情報を無効 |

- **nonce は使わない**。リクエストごとに nonce を振ると全ページが事前生成から外れて遅くなる（cacheComponents）。
  そのため `script-src` は `'self' 'unsafe-inline'`。インラインは許すが**外部スクリプトの読み込みは不可**で、
  `connect-src 'self'` により持ち出し先も塞ぐ。
- **開発では CSP を付けない**。React の開発ビルドは `eval` を使い、計測スクリプトも外部から読むため。
- 外部ドメインを増やすとき（決済の埋め込み、フォント、計測）は `csp` の該当ディレクティブに追記し、
  `src/lib/__tests__/security-headers.test.ts` を更新する。
- **Vercel Web Analytics / Speed Insights は現在プロジェクト側で無効**（本番でスクリプトが読み込まれていない）。
  有効化したあとブラウザのコンソールに CSP 違反が出た場合は、`script-src` に `https://va.vercel-scripts.com` を追加する。

## Runbook: バックアップからの復元

`backup-db`（docs/SHIPPING.md §4）が非公開 Blob に置いた dump を書き戻す。**全テーブルを置き換える破壊的操作**。

```bash
# 1. 影響範囲の確認（--yes なしは表示だけ）
DATABASE_URL=… npm run db:restore -- --blob latest
# 2. 本番を止めてから実行（/admin/settings のメンテナンスモード）
DATABASE_URL=… npm run db:restore -- --blob latest --yes
# ローカルに落とした dump から戻す場合
DATABASE_URL=… npm run db:restore -- --file ./backup.json.gz --yes
```

- 復元は1トランザクション。途中で失敗したら**何も変わらない**（壊れた dump で現状を失わない）。
- 行は外部キーの依存順に入る。順序はスキーマから毎回導出するので、テーブルを足しても手を入れる必要はない。
- **年に1回は避難訓練をする**。Neon のブランチに対して実施すれば本番に触れずに確認できる:
  `neon branches create --name restore-drill` → そのブランチへ復元 → 件数と代表行を本番と突き合わせ → `neon branches delete restore-drill`。
  2026-09-20 実施: 22テーブル・3,440行・配列列・jsonb 列まで一致を確認。

## Runbook: DB のリージョン移設（実施済み・再実施の手順）

Neon の Vercel 連携ではリージョンを選べないことがある。その場合は Neon コンソールで作る。
1. console.neon.tech → New project → Region に目的のリージョン（Tokyo は提供なし。日本向けは Singapore）。
   Services は Postgres のみ（Object storage / Functions / AI gateway / Neon Auth は不要）。
2. 接続文字列（**pooled**）を取得し、ローカルの `.deploy/env.sg` に `DATABASE_URL='…'` として保存（引用符必須：`&` を含むため）。
   Neon CLI なら `neon connection-string production --project-id <id> --pooled`。
3. `set -a; . .deploy/env.sg; set +a; npm run db:migrate && npm run db:seed`
4. Stripe 連結アカウントを引き継ぐ: `node .deploy/carry-stripe-links.mjs`（確認）→ `--apply`（反映）。
   seed を流し直すと farms の `stripe_account_id` が消えるため、農家の再オンボードを避けるにはこれが必要。
5. 件数確認: `node .deploy/db-compare.mjs`（新旧のテーブル別行数）。
6. 切り替え（ここから数分ダウン）:
   - `vercel integration resource disconnect awaji-marche-db awaji-marche --yes`（旧 DB の env を外す）
   - `vercel env add DATABASE_URL production < <接続文字列のみのファイル>`
   - `vercel.json` の `regions` を新リージョンに変更して push（デプロイで反映）
7. 確認: トップ/商品一覧、ログイン、生産者の売上・精算（Stripe 連携の表示）、/admin/settings。
8. 旧 Neon プロジェクトは確認後に削除（無料プランはプロジェクト数に上限）。
9. 画像保存（Vercel Blob）も同じリージョンへ: `vercel blob create-store <name> --access public --region sin1 --environment production`。
   同名は不可、`BLOB_READ_WRITE_TOKEN` が既にあると接続が 409 になるため、**先にダッシュボードで旧ストアの
   Remove Project Connection** → 新ストアを Connect to Project（Prefix は BLOB のまま）→ 再デプロイ。
   ストアの削除・切断は CLI がエージェントに対して拒否するので、ダッシュボードで人が行う。
   デモ画像は外部 URL 参照のため移送不要。実運用では旧ストアのファイルを新ストアへコピーし、
   DB 内の URL（`product_images.url` など）も新ホスト名へ置換する。

## 本番前チェックリスト

運営画面 **/admin/settings →「本番公開チェック」** が env とデータから自動判定する（`server/queries/go-live.ts`）。
「要対応」が 0 件になるまで公開しない。以下は画面に出る項目の補足と、画面では判定できない作業。

### 1. Stripe を本番（live）に切り替える

1. Stripe ダッシュボードで**アカウントを有効化**（事業情報・代表者・銀行口座の審査）。
2. **Connect のプラットフォームプロフィール**を本番でも入力（ビジネスモデル=マーケットプレイス、損失負担=プラットフォーム、
   手数料負担=プラットフォーム）。テスト環境の設定は本番に引き継がれない。
3. 本番の **API キー**（`sk_live_…`）を `STRIPE_SECRET_KEY` に設定。
4. 本番で **Webhook の送信先を3つ**作る（テスト環境と同じ構成）。URL・イベント・環境変数は下表。
5. 本番の [**決済手段**](https://dashboard.stripe.com/settings/payment_methods) で使うものを有効化する
   （**PayPay** / コンビニ払い / Apple Pay / Google Pay など）。アプリ側は `payment_method_types` を
   固定していないので、ここで ON にすれば次の決済から Checkout に出る（デプロイ不要）。
   テスト環境（サンドボックス）でも同じページで有効化して、`4242…` のカードと合わせて動作確認できる。
   PayPay はテスト環境では「PayPay のテスト画面」で支払い成功/失敗を選べる。
6. Accounts v1 support は有効化しない（アプリは Accounts v2 で連結アカウントを作る。docs/PAYMENTS.md）。

| 送信先 | イベントの送信元 | ペイロード | URL | 環境変数 |
| --- | --- | --- | --- | --- |
| 決済 | 自分のアカウント | スナップショット | `/api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| 連結アカウント | 連結アカウント | スナップショット | `/api/webhooks/stripe` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Accounts v2 | 自分のアカウント | thin（軽量） | `/api/webhooks/stripe/accounts` | `STRIPE_ACCOUNTS_WEBHOOK_SECRET` |

イベント: 決済 = `checkout.session.{completed,async_payment_succeeded,expired,async_payment_failed}` /
連結 = `account.updated` / v2 = `v2.core.account[configuration.recipient].capability_status_updated`,
`v2.core.account[requirements].updated`。**環境変数を入れたら再デプロイする**（反映は再デプロイ時）。

### 2. ログイン試行の制限（実装済み・確認事項）

Better Auth のレートリミットを `rate_limit` テーブル（Postgres）で有効化済み。サーバーレスはインスタンスごとに
メモリが分かれるため、DB ストレージでないと意味がない。既定は IP+パスごと。

| エンドポイント | 制限 |
| --- | --- |
| `/sign-in/email` | 5分で10回 |
| `/sign-up/email` / `/forget-password` / `/reset-password` | 1時間で5回 |
| その他の auth API | 1分で120回 |

超過すると 429（`X-Retry-After` 秒）。カウンターは `rate_limit` に入るので、公開前にマイグレーション
（`0004_rate_limit`）が本番に当たっていることを確認する。

### 3. デモを閉じる

1. `DEMO_MODE=false`（ログイン画面のデモアカウント表示が消える）。
2. デモ／説明用ドメイン（`@demo.awaji` と RFC 2606 の `example.jp` など。`src/config/demo.ts`）のアカウントは
   **サーバー側でログインを拒否**する（`server/auth/auth.ts` の before フック。パスワードがリポジトリにあるため
   画面を隠すだけでは不十分）。
3. デモデータを消す。実データが入ったあとに実行しないよう、デモ以外のアカウントが1件でもあれば中止する:

```bash
DATABASE_URL=… npm run demo:purge          # 何を消すか表示するだけ
DATABASE_URL=… npm run demo:purge -- --yes # 実行（--force でデモ以外があっても強行）
```

4. 最初の運営アカウントを作る。サイトで新規登録したあと、役割だけを付与する（パスワードは扱わない）:

```bash
DATABASE_URL=… npm run admin:promote -- --email owner@example.jp
```

5. 運営画面 /admin/settings の「本番公開チェック」が「準備完了」になることを確認。

### 4. その他

- [ ] `config/site.ts` の運営者情報・特商法表記を実データに（代表者名・問い合わせ先・電話番号）
- [ ] `config/content.ts` legal の規約・プライバシーポリシーを正式版に
- [ ] `config/shipping.ts` の運賃表を契約運賃に
- [ ] Resend: ドメイン認証、`EMAIL_FROM` を認証済みアドレスに
- [ ] `BETTER_AUTH_SECRET`（`openssl rand -base64 32`）と `CRON_SECRET` を本番用の値に
- [ ] Cron: Pro プラン or スケジュール調整（docs/SHIPPING.md §4）

## Neon のリージョン移設（公開前に一度だけ）

Neon は Tokyo を提供していないため **Singapore (`ap-southeast-1`) + Vercel `sin1`** に置く（日本から往復 70〜90ms。
米国東部だと 200ms 前後）。移設の手順:

1. Neon で `aws-ap-northeast-1`（東京）または `ap-southeast-1` に**新しいプロジェクト**を作る。
2. `vercel.json` の `regions` を `["hnd1"]`（東京）に変更。**関数と DB のリージョンは必ず揃える**。
3. データを移す。デモデータなら移さず `npm run db:migrate && npm run db:seed` で作り直すのが速い。
   実データがあるときは `pg_dump`/`pg_restore`（メンテナンスモードを ON にしてから）。
4. Vercel の `DATABASE_URL`（と Neon 連携が作る `POSTGRES_*`）を新プロジェクトの値に差し替えて再デプロイ。
5. /admin/settings で接続状況、/admin/automation で Cron の手動実行を確認。

移設はダウンタイムを伴うため、注文が動いていない時間帯に行い、メンテナンスモード（/admin/settings）を使う。
