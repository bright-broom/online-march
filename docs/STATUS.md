# STATUS — 現況と引き継ぎ（2026-09-23 時点）

**このファイルは「いま何がどこまで出来ていて、次に何をすべきか」だけを書く。**
仕組みの説明は各 doc（Doc map は `AGENTS.md`）にあり、ここでは重複させない。
**作業したら、この doc の「未完」と「検証済み」を更新すること。**

## 1. 本番環境の事実

| 項目 | 値 |
| --- | --- |
| 公開 URL | https://awaji-marche.vercel.app |
| ホスティング | Vercel（プロジェクト `awaji-marche`、Functions リージョン `sin1` = シンガポール） |
| DB | Neon Postgres `ap-southeast-1`（シンガポール）。接続は Vercel の環境変数 `DATABASE_URL` |
| 画像 | Vercel Blob（公開ストア） |
| バックアップ | Vercel Blob の**非公開**ストア。毎日 cron `backup-db`、14日保持、書き戻し検証つき |
| 決済 | Stripe **サンドボックス「marché」**（`acct_1UHFtZQ28RjykPAq`）。まだ live キーではない |
| メール | Resend **未設定** → 送信されず `[email:demo]` としてサーバーログに出るだけ |
| デモモード | `DEMO_MODE` 有効（ログイン画面にデモアカウントが出る） |
| 環境変数のスコープ | 本番 DB・Stripe・認証・**バックアップ用 Blob** は Production のみ（2026-09-24 確認。バックアップ用トークンを Preview から外した）。Preview にあるのは画像用 Blob だけ |

関数とDBを同じリージョンに置いているのは、1ページで十数クエリ走るため（ADR #9）。
リージョンを動かすときは両方セットで動かす。手順は `docs/DEPLOY.md`。

## 2. 未完（ほぼオーナーの作業。コード側の準備は済んでいる）

運営画面 **/admin/settings →「本番公開チェック」** が env とデータと Stripe API から自動判定している。
**この画面が正である。** 以下はその写し（2026-09-23 時点）。

| 項目 | 状態 | 次の一手 |
| --- | --- | --- |
| Stripe 本番キー | テストキー | アカウント有効化 →`sk_live_…` を `STRIPE_SECRET_KEY` に。本番でも Webhook 3本を作り直す（`docs/DEPLOY.md`） |
| 決済手段 | サンドボックスでは カード・PayPay・コンビニ払い・Apple Pay・Google Pay が有効（2026-09-23 時点で✅） | **本番環境では有効化し直しが必要**（サンドボックスの設定は本番に引き継がれない）。[Stripe ダッシュボード → 決済手段](https://dashboard.stripe.com/settings/payment_methods) |
| メール送信 | 未設定 | `RESEND_API_KEY` と `EMAIL_FROM`（独自ドメイン）。**未設定のままだと注文確認メールが届かない** |
| デモモード | 有効 | `DEMO_MODE=false`。デモアカウントはログイン不可になる（`src/config/demo.ts`） |
| デモデータ | `@demo.awaji` のアカウントとシードデータが本番DBに入ったまま | 公開前に `npm run demo:purge`（`scripts/demo-purge.ts`）。運営アカウントは `npm run admin:promote` |
| 特商法・運営者情報 | 仮の値 | `src/config/site.ts` の 代表者名 / 問い合わせメール / 電話番号 / 郵便番号 / 住所 / 受付時間 |
| 利用規約・プライバシーポリシー | 下書き（`legalDraft = true`、【要確認】4か所: 再配送料の負担・運営者の責任上限・管轄裁判所 ほか） | 専門家に確認して `src/config/content.ts` を正式版に。本番公開チェックの「利用規約・プライバシーポリシー」が両方を見ている |
| **売主は誰か（特商法の表示）** | 利用規約は「売買契約は購入者と**各生産者**の間」、特商法表記の販売事業者は**運営事務局**で食い違っている | どちらのモデルにするか専門家と決める。生産者が売主なら生産者ごとに氏名・住所・電話の表示が要る（食べチョク等と同じ）。住所・電話は出店申請で集めているが農園ページには代表者名しか出していない。決まればコードで対応する |
| 運営アカウント | デモの `admin@demo.awaji` のみ | 本人のメールで会員登録 → `npm run admin:promote <メール>`。**デモ削除前にやらないと /admin に入れなくなる** |
| 検索エンジンへの公開 | 準備中のため `noindex`（自動） | デモモードを無効にし本番キーを入れると自動で公開される。作業不要 |
| Vercel Analytics | 未使用 | 使うなら `next.config.ts` の CSP `script-src` に `https://va.vercel-scripts.com` を追加 |

コード側でやり残していると分かっているものは**無い**。上の表が埋まれば公開できる状態。
チェック自体は「鍵があるか」ではなく「実際に動いているか」を見る（自動処理の最終成功・バックアップが48時間以内・
デモ以外の運営アカウント・公開URL）。`server/queries/go-live.ts`、回帰テスト `queries/__tests__/go-live.test.ts`。

## 3. 本番で実際に確認済みのこと

「テストが通った」ではなく、**本番URLで人が触って確かめた**もの。日付は最後に確認した日。

| 何を | いつ | 結果 |
| --- | --- | --- |
| コールドスタート（放置15分後の初回。`/api/health` で内訳） | 2026-09-24 | 1.76s（起動 0.46s ＋ DB 0.63s）。修正前は 5.9〜6.5s。/checkout 初回 3.0s（修正前 約9s） |
| カード決済の通し（注文→webhook→出荷→配達→月次締め→Connect送金） | 2026-09-20 | OK。webhook は本番ログで着信を確認（成功画面の保険ではないことまで確認） |
| PayPay 決済 | 2026-09-21 | OK。`payment_method='paypay'` を記録、マイページに「お支払い方法：PayPay」 |
| Stripe Connect 振込先登録（Accounts v2）と月次送金 | 2026-09-20 | OK。6農園中5つが登録済み（神代こだわり農園のみ未登録＝振込は運営が手動で行う扱い） |
| 退会（デモアカウントは拒否されること） | 2026-09-21 | OK。「デモアカウントは退会できません」 |
| レビューの編集・削除 | 2026-09-21 | OK（編集→元に戻すまで実施） |
| 売上明細CSV | 2026-09-21 | OK。2026年分127件・受取額909,746円、合計行と一致 |
| 受付の一時停止（お休み） | 2026-09-23 | OK。商品ページの表示・古いカートからの注文拒否・自動再開まで |
| コンビニ払い（支払い番号の発行 → 入金 → 確定） | 2026-09-23 | OK。番号発行時は注文を確定せず期限（3日後）を案内し、入金で `payment_method='konbini'` の確定・番号の消去・生産者への通知まで |
| バックアップからの復元 | 2026-09-19 | OK（使い捨て Neon ブランチに書き戻して件数一致を確認） |

本番で試したら**テストデータは必ず消す**（→ 5節）。

## 4. 作業の型（ここが引き継ぎの肝）

### 4.1 変更 → 本番までの順序

1. `npm run typecheck` / `npm run lint` / `npx vitest run` をローカルで通す
2. **スキーマを変えたら、先に本番DBへマイグレーションを当てる**（列追加は後方互換なので先に当てて安全）
   → 新しい列を読むコードが、列の無いDBに当たる事故を防ぐ
3. commit → push（`main` に push すると Vercel が本番デプロイ）
4. デプロイ完了後、**本番URLで実際に触って確認**
5. 作ったテストデータを消す（→ 5節）
6. この doc の3節を更新

### 4.2 テストは「壊して落ちること」まで確認する

通るテストを書くのは簡単で、**壊れたときに落ちないテスト**には価値がない。
新しい守りを入れたら、対象のコードをわざと壊して、テストが赤くなることを必ず見る（例: 所有者チェックを外す、
条件付き更新の条件を外す、日付の境界を1日ずらす）。確認したら元に戻す。

実際の例は `services/__tests__/`（`golden-route` / `stock-race` / `coupon-limit` / `refund-race` /
`farm-pause` / `account-closure` / `sales-csv` / `deferred-payment`）。

> **注意**: 元に戻すときに `git checkout -- <file>` を使わないこと。未コミットの変更ごと消える（実際に一度消した）。
> `cp <file> "$TMPDIR/x.bak"` を取ってから壊し、`cp` で戻す。

### 4.3 テストの書き方

- テスト名は日本語で「何が守られているか」を書く（`受付の一時停止 > 止めている間は注文できない`）
- DB を使うテストは PGlite（`memory://`）で、シード済みデータをそのまま使う
- ファイルごとに独立した DB が立つので、ユーザーや農園を作って壊して構わない
- 認可は `src/server/actions/__tests__/authorization.test.ts` に1ケース足す（アクションを追加したら必ず）

## 5. 本番のテストデータを消す

`.deploy/`（**gitignore 済み・秘密情報を含む**）に使い捨てスクリプトを置いている。テンプレは
`.deploy/cleanup-golden-route.mjs`。注文コードを書き換えて `--apply` なしで内容を確認 → `--apply` で削除する。
在庫と `sold_count` を戻し、関連通知も消す。最後に `.deploy/verify-cleanup.mjs` で
「注文件数・在庫・孤児レコード」を確認する（**基準値: 注文389件 / ターザン5kgの在庫120 / sold_count 101 / 孤児0**）。

### 気になっている点（未着手）

- **/checkout の初回表示が遅い** → 2026-09-24 に改善を確認。原因は関数のコールドスタート（5〜6s、Neon の起床は 0.4s 程度）。
  PGlite のバイナリ約17MB を本番関数から外した結果、放置15分後の初回リクエストは **5.9〜6.5s → 1.76s**
  （内訳: 起動 0.46s ＋ DB 0.63s）、/checkout の初回は **約9s → 3.0s**。詳細は `docs/PERFORMANCE.md` §4。
  残り: /checkout 初回の 3.0s はまだ縮められる余地がある（ページ関数の起動・見積もりとヘッダー先読みの同時実行）。

## 6. この環境（AI エージェント）でハマる点

| 症状 | 理由と回避 |
| --- | --- |
| Neon に接続できない（`fetch failed` / TLS エラー） | サンドボックスから本番DBへ出られない。**Desktop Commander の `start_process`** かユーザーのターミナル経由で実行する |
| `git push` が proxy 認証で失敗 | 同上。push も sandbox 外（Desktop Commander）から実行する |
| `npm run build` が Google Fonts の取得で失敗 | サンドボックスのネットワーク制限。**ローカル build は通らなくて正常**。Vercel 側のビルドで確認する（完了条件は typecheck / lint / vitest） |
| 本番の env を読みたい | `.deploy/env.sg` に `DATABASE_URL` がある。`set -a && source .deploy/env.sg && set +a` で読み込む（`source` だけでは export されない） |
| `STRIPE_SECRET_KEY` を手元で使いたい | **取得できない**（Vercel で Sensitive 指定のため pull できない）。Stripe API を叩く確認は、本番に置いた運営画面（/admin/settings の決済手段）経由で行う |
| push したのに本番が古いまま | Vercel の Git 連携がデプロイを作らないことがある（2026-09-24 に `22a066a` で発生）。`npx vercel list awaji-marche --scope brightbroom-projects` で確認し、無ければ `npx vercel deploy --prod --scope brightbroom-projects`。旧プロジェクト `online-march`（2026-09-19 作成・一度も成功せず・本番級の秘密情報を保持）は 2026-09-24 に削除済み |
| 商品ページに「今日」を埋め込みたい | ページはキャッシュされるので、サーバーで固めた日付は古くなる。**日付比較はクライアントで**（例 `components/shop/farm-paused-notice.tsx`） |

## 7. 直近で入れた機能（どこを見れば分かるか）

| 機能 | 実装 | 回帰テスト |
| --- | --- | --- |
| 決済手段（PayPay / コンビニ払い / ウォレット） | `config/payments.ts`, `services/payments/stripe.ts` | `deferred-payment.test.ts` |
| 決済の通し（ゴールデンルート） | — | `golden-route.test.ts` |
| 退会（匿名化） | `services/account-closure.ts` | `account-closure.test.ts` |
| レビューの編集・削除 | `actions/reviews.ts` | `review-edit.test.ts` |
| 売上明細CSV | `services/sales-csv.ts`, `queries/farmer.ts#getSalesRows` | `sales-csv.test.ts` |
| 受付の一時停止（お休み） | `farms.pausedUntil`, `services/orders.ts#quoteCart` | `farm-pause.test.ts` |
| 生産者アカウント画面 | `app/farmer/account/` | — |
| 本番公開チェック | `queries/go-live.ts` | `go-live.test.ts` |
| 運用アラート / バックアップ | `services/ops-alerts.ts`, `services/backup.ts` | `jobs.test.ts`, `backup.test.ts`, `restore.test.ts` |
| ドキュメントのリンク・画像・目次の切れ検知（アイコンは `docs/icons/` に同梱） | `test/docs.test.ts` | 同左 |
| 稼働確認とコールドスタートの内訳 | `app/api/health`, `services/health.ts` | `health.test.ts`, `test/next-config.test.ts` |
| Preview ビルドでは DB マイグレーションしない | `scripts/migrate-policy.ts`, `scripts/db-migrate.ts` | `test/migrate-policy.test.ts` |
