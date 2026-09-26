# STATUS — 現況と引き継ぎ（2026-09-26 時点）

**このファイルは「いま何がどこまで出来ていて、次に何をすべきか」だけを書く。**
仕組みの説明は各 doc（Doc map は `AGENTS.md`）にあり、ここでは重複させない。
**作業したら、この doc の「未完」と「検証済み」を更新すること。**

## 1. 本番環境の事実

| 項目 | 値 |
| --- | --- |
| 公開 URL | https://awaji-marche.vercel.app |
| リポジトリ | GitHub `bright-broom/online-march`（**非公開**。2026-09-24 に `online-march-` から改名。旧URLは転送される）。`main` への push が本番デプロイ |
| CI | GitHub Actions `.github/workflows/ci.yml`（typecheck・lint・vitest・マイグレーション整合・本番ビルド）。非公開なので未ログインの API からは見えない → `gh run list` |
| 残作業の管理 | GitHub Issues（→ 2節）。`gh issue list --label P0` |
| ホスティング | Vercel（チーム `brightbroom-projects`、プロジェクト `awaji-marche`、Functions リージョン `sin1` = シンガポール）。このリポジトリにつながる Vercel プロジェクトはこれだけ |
| DB | Neon Postgres `ap-southeast-1`（シンガポール）。プロジェクト `awaji-marche-sg`（`wild-surf-10919519`）、ブランチ `production`（`br-shy-dust-azqn91zm`）。接続は Vercel の環境変数 `DATABASE_URL`。停止まで5分（無料枠の既定）、起動は 0.3〜0.5s |
| 画像 | Vercel Blob（公開ストア） |
| バックアップ | Vercel Blob の**非公開**ストア。毎日 cron `backup-db`、14日保持、書き戻し検証つき |
| 決済 | Stripe **サンドボックス「marché」**（`acct_1UHFtZQ28RjykPAq`）。まだ live キーではない |
| メール | Resend **未設定** → 送信されず `[email:demo]` としてサーバーログに出るだけ |
| デモモード | `DEMO_MODE` 有効（ログイン画面にデモアカウントが出る） |
| 環境変数のスコープ | 本番 DB・Stripe・認証・**バックアップ用 Blob** は Production のみ（2026-09-24 確認。バックアップ用トークンを Preview から外した）。Preview にあるのは画像用 Blob だけ |

関数とDBを同じリージョンに置いているのは、1ページで十数クエリ走るため（ADR #9）。
リージョンを動かすときは両方セットで動かす。手順は `docs/DEPLOY.md`。

## 2. 未完（ほぼオーナーの作業。コード側の準備は済んでいる）

**残作業の一覧は GitHub Issues が正**（2026-09-25 の全体監査から起票。ラベル: `P0` 公開前に必須 / `P1` 公開後すぐ / `P2` バックログ /
`owner-decision` オーナー・専門家の判断待ち）。コードで直せる P0（#1〜#5）は対応済み。この節はオーナー作業の写し。

運営画面 **/admin/settings →「本番公開チェック」** が env とデータと Stripe API から自動判定している。
**この画面が正である。** 以下はその写し（2026-09-26 時点）。

| 項目 | 状態 | 次の一手 |
| --- | --- | --- |
| Stripe 本番キー | テストキー | アカウント有効化 →`sk_live_…` を `STRIPE_SECRET_KEY` に。本番でも Webhook 3本を作り直す（`docs/DEPLOY.md`） |
| 決済手段 | サンドボックスでは カード・PayPay・コンビニ払い・Apple Pay・Google Pay が有効（2026-09-23 時点で✅） | **本番環境では有効化し直しが必要**（サンドボックスの設定は本番に引き継がれない）。[Stripe ダッシュボード → 決済手段](https://dashboard.stripe.com/settings/payment_methods) |
| メール送信 | 未設定（**公開をブロック**） | `RESEND_API_KEY` と `EMAIL_FROM`（独自ドメイン）。未設定のままだと注文確認・返金のお知らせ・**パスワード再設定**のメールが届かない。パスワードを忘れたお客さまが自力で戻れなくなるので、2026-09-24 から本番公開チェックで blocker 扱い |
| デモモード | 有効 | `DEMO_MODE=false`。デモアカウントはログイン不可になる（`src/config/demo.ts`） |
| デモデータ | `@demo.awaji` のアカウントとシードデータが本番DBに入ったまま | 公開前に `npm run demo:purge`（`scripts/demo-purge.ts`）。運営アカウントは `npm run admin:promote -- --email <メール>` |
| 特商法・運営者情報 | 仮の値 | `src/config/site.ts` の 代表者名 / 問い合わせメール / 電話番号 / 郵便番号 / 住所 / 受付時間 |
| 利用規約・プライバシーポリシー | 下書き（`legalDraft = true`、【要確認】4か所: 再配送料の負担・運営者の責任上限・管轄裁判所 ほか） | 専門家に確認して `src/config/content.ts` を正式版に。本番公開チェックの「利用規約・プライバシーポリシー」が両方を見ている |
| **売主は誰か（特商法の表示）** | 利用規約は「売買契約は購入者と**各生産者**の間」、特商法表記の販売事業者は**運営事務局**で食い違っている | どちらのモデルにするか専門家と決める。生産者が売主なら生産者ごとに氏名・住所・電話の表示が要る（食べチョク等と同じ）。住所・電話は出店申請で集めているが農園ページには代表者名しか出していない。決まればコードで対応する |
| 運営アカウント | デモの `admin@demo.awaji` のみ | 本人のメールで会員登録 → `npm run admin:promote -- --email <メール>` → ログインすると**二段階認証の設定画面**へ（運営は必須。バックアップコードは必ず保管）。**デモ削除前にやらないと /admin に入れなくなる** |
| 検索エンジンへの公開 | 準備中のため `noindex`（自動） | デモモードを無効にし本番キーを入れると自動で公開される。作業不要 |
| Vercel Analytics / Speed Insights | コンポーネントは `src/app/layout.tsx` に組み込み済み（本番は同一オリジン配信なので CSP 変更不要）。Vercel ダッシュボード側で有効化されているかは未確認 | 使うならダッシュボードで有効化 |

コード側の残りは GitHub Issues の `P1`（公開後すぐ: エラー監視 #12、精算 #13・#14、出店審査 #15 ほか）と `P2`。
公開の可否を決めるのは上の表（オーナー作業）と Issues の `P0`。
チェック自体は「鍵があるか」ではなく「実際に動いているか」を見る（自動処理の最終成功・バックアップが48時間以内・
デモ以外の運営アカウント・公開URL）。`server/queries/go-live.ts`、回帰テスト `queries/__tests__/go-live.test.ts`。

## 3. 本番で実際に確認済みのこと

「テストが通った」ではなく、**本番URLで人が触って確かめた**もの。日付は最後に確認した日。

| 何を | いつ | 結果 |
| --- | --- | --- |
| P0 の修正 #1〜#5（最終確認画面の表示・在庫の差分反映・アップロード検証・領収書・新商品のお知らせ） | 2026-09-26 | CI 成功・本番デプロイ Ready（`8cc8eaa`）、マイグレーション 0009 をビルドで適用、Issue は自動で閉じた。**画面の目視はログインが要るため未実施**（テストで確認） |
| パスワード再設定・二段階認証の画面（`/forgot-password` `/reset-password` `/two-factor` `/two-factor/setup`） | 2026-09-24 | 表示のみ OK（200）。マイグレーション 0008 がビルドで適用されたことをログで確認。**メールの到達は Resend 未設定のため未確認** |
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

1. `npm run typecheck` / `npm run lint -- --max-warnings 0` / `npx vitest run` をローカルで通す
   （スキーマを変えたら `npm run db:generate` し、`npx drizzle-kit generate --name ci-check` で差分が出ないこと＝CI と同じ確認）
2. **スキーマの変更は「足す」だけにする**（列・テーブル・enum 値の追加）。本番ビルドが `db:migrate` を先に実行するので
   （`VERCEL_ENV=production` のときだけ。Preview ビルドは当てない — `scripts/migrate-policy.ts`）、新しいコードが動き出す前に
   本番DBに反映される。**消す・名前を変える変更**は、古いコードが動いている間に壊れるので、「足す → コードを切り替える → 次のデプロイで消す」の2段階にする。
   手元から本番に当てられる環境なら、従来どおり push より先に `npm run db:migrate` してもよい
3. commit（書き方は `AGENTS.md`）→ push（`main` に push すると Vercel が本番デプロイ。コミットの `Closes #n` で Issue が閉じる）
4. **デプロイを確認する**: `npx vercel list awaji-marche --scope brightbroom-projects` で Ready を見る（作られていなければ 6節）。
   ビルドログは `npx vercel inspect <URL> --logs --scope brightbroom-projects`（`[db:migrate] done` が出ているか）。CI は `gh run list`
5. **本番URLで実際に触って確認**（`/api/health` でも稼働と DB の往復を見られる）
6. 作ったテストデータを消す（→ 5節）
7. この doc の3節・7節を更新

### 4.2 テストは「壊して落ちること」まで確認する

通るテストを書くのは簡単で、**壊れたときに落ちないテスト**には価値がない。
新しい守りを入れたら、対象のコードをわざと壊して、テストが赤くなることを必ず見る（例: 所有者チェックを外す、
条件付き更新の条件を外す、日付の境界を1日ずらす）。確認したら元に戻す。

実際の例は `services/__tests__/`（`golden-route` / `stock-race` / `coupon-limit` / `refund-race` /
`farm-pause` / `account-closure` / `sales-csv` / `deferred-payment`）。

> **注意**: 元に戻すときに `git checkout -- <file>` を使わないこと。未コミットの変更ごと消える（実際に一度消した）。
> `cp <file> "$TMPDIR/x.bak"` を取ってから壊し、`cp` で戻す。戻したら `cmp` で元と同じことを確かめる。

壊し方の実例（2026-09-24〜25 に実施）: 返金の一本化で「生産者キャンセルで返金しない」「農園の絞り込みを外す」、
二段階認証で「ページのガードを外す」「Action のガードを外す」「デモの除外を外す」、在庫で「上書きに戻す」「0未満の切り捨てを外す」。
1つの変更で複数の守りがあるなら、**守りごとに**壊して、それぞれ別のテストが赤くなることを見る。

- 複数のテストファイルを渡すとき、zsh は `$T` を空白で分割しない。`T=(a.test.ts b.test.ts); npx vitest run "${T[@]}"` と配列にする
  （分割されないとテストが1本も走らず、何を壊しても「赤くならない」ように見える）
- 置き換えは `sed` より Python の `str.replace` が確実（BSD sed は GNU と文法が違い、黙って何も変えないことがある）。
  置き換えの前に「その文字列が本当にあるか」を assert する

### 4.3 テストの書き方

- テスト名は日本語で「何が守られているか」を書く（`受付の一時停止 > 止めている間は注文できない`）
- DB を使うテストは PGlite（`memory://`）で、シード済みデータをそのまま使う
- ファイルごとに独立した DB が立つので、ユーザーや農園を作って壊して構わない
- 認可は `src/server/actions/__tests__/authorization.test.ts` に1ケース足す（アクションを追加したら必ず）
- 置き場所: `src/**/*.test.ts`・`src/**/*.test.tsx`・`test/**/*.test.ts`（`vitest.config.mts#include`）。リポジトリ全体に関わるもの（docs・next.config・スクリプト）は `test/`

よく使うモック（既存テストに実例がある）:

| 目的 | 書き方 | 実例 |
| --- | --- | --- |
| ログイン中のユーザーを決める | `vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }))`。`twoFactorEnabled` も入れる（運営は未設定だと止まる） | `actions/__tests__/authorization.test.ts` |
| メールを送らずに中身を見る | `vi.mock("@/server/services/email", () => ({ sendEmail }))` | `services/__tests__/cancel-refund.test.ts` |
| Stripe を呼ばない | `vi.mock("@/server/services/payments/stripe", …)`（サービス単位）または `vi.mock("stripe", …)`（SDK 単位, 送るパラメータを見たいとき） | `refund-race.test.ts`, `components/checkout/__tests__/final-confirmation.test.tsx` |
| Better Auth を本物で通す | `auth.api.*` を直接呼ぶ。`asResponse: true` だと失敗は例外でなく 401 などの Response で返る。Set-Cookie を次の呼び出しの `cookie` に渡す | `auth/__tests__/password-reset.test.ts`, `two-factor.test.ts` |
| 画面の部品に文言があるか | `renderToStaticMarkup(createElement(Component, props))`（`.test.tsx`） | `final-confirmation.test.tsx` |
| `redirect()` の行き先 | `redirect` を throw するモックにして、行き先を例外メッセージで見る | `auth/__tests__/two-factor-guard.test.ts` |

落とし穴:
- **`example.jp` / `example.com` はデモ用ドメイン**（`src/config/demo.ts`）。デモ扱いでメールを送らない・二段階認証の対象外などになるので、
  「本物のユーザー」を作るテストでは `@awaji-test.jp` のようなドメインを使う
- `beforeEach(() => mock.mockClear())` のように**関数を返すと、Vitest はそれを後片付けとして呼ぶ**。`beforeEach(() => { mock.mockClear(); })` と波括弧で書く
- `console.log` はテスト出力に出ないことがある。値を見たいときは `expect(JSON.stringify(x)).toBe("")` のように失敗メッセージに出す

## 5. 本番のテストデータを消す

> **新しく clone した環境には `.deploy/` は無い**（gitignore 済みで、最初に作業した PC にだけある）。無い場合は、下の手順と
> 基準値を見て同じことを SQL で行うか、秘密情報を含まない部分を `scripts/` に移してから使う。

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

エージェントは多くの場合サンドボックスの中で動く。**サンドボックスの外（オーナーのターミナル・ログイン済みの CLI）でしかできないこと**がある。
その場合は、実行するコマンドを1行で示してオーナーに頼むか、ツールがあればオーナーのターミナルで実行する。

| 症状 | 理由と回避 |
| --- | --- |
| Neon に接続できない（`fetch failed` / TLS エラー） | サンドボックスから本番DBへ出られない。オーナーのターミナル経由で実行する。Neon の MCP がつながっていれば読み取りはそちらでもできる |
| `git push` が失敗する（proxy 認証・SSH 鍵なし） | push はサンドボックスの外から。これまではオーナーが `git push origin main` を実行してきた |
| GitHub の API・Issues が 404 | リポジトリが非公開のため。オーナーのターミナルの `gh`（ログイン済み）で `gh issue list` / `gh run list` |
| Vercel の状態を見たい | オーナーのターミナルで `npx vercel list/inspect … --scope brightbroom-projects`。手元のフォルダが未リンクなら `npx vercel link --yes --project awaji-marche --scope brightbroom-projects`（**`vercel` を引数なしで実行しない**: 対話で新しいプロジェクトが作られうる） |
| `npm` が `EPERM`（`~/.npm/_cacache`） | サンドボックスがホームの npm キャッシュを書けない。`export npm_config_cache="$TMPDIR/npmcache" npm_config_logs_dir="$TMPDIR/npmlogs"` |
| 依存を追加すると CI の `npm ci` が落ちる | npm 11.6.2 でも `install`（`--package-lock-only` やクリーンな場所でも）は依存を解き直し、CI に必要な optional の `@emnapi/*` を lockfile から消す。**追加するパッケージの項目だけを既存の lockfile に足す**（version・resolved・integrity は別の場所で解決した lockfile から写す）→ `npx -y npm@11.6.2 ci --dry-run --ignore-scripts` が通ることを確認（`uqr` 追加時の手順, 2026-09-25） |
| `git clone` が失敗（hooks や config を書けない） | サンドボックスの書き込み制限。`git clone --template= …` で hooks のコピーを省く。それでも `.git/config` を書けない場所なら `$TMPDIR` に clone する |
| `npm run build` が失敗 | Google Fonts の取得がネットワーク制限で落ちる。`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` で回避しても、Turbopack がフォント処理で子プロセスを起動できず落ちる。**ローカル build は通らなくて正常**。Vercel 側のビルドで確認する（完了条件は typecheck / lint / vitest） |
| 開発サーバーを見たい | `npm run dev -- -p 3100`（`.claude/launch.json` の `web`）。PGlite の DB はプロセス1つだけが持つ（ADR #8）ので、テストを並行で走らせても本体の `.data/pglite` には触れない |
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
| 生産者キャンセル時の自動返金・返金の一本化・返金／期限切れメール | `services/refunds.ts`（`refundOrder`, `cancelFarmOrderAsFarmer`）, `orders.ts#cancelOrderByCustomer/expireUnpaidOrder` | `cancel-refund.test.ts` |
| パスワード再設定（1時間・1回限り・他端末ログアウト・会員の有無を漏らさない・5回/時） | `server/auth/auth.ts`, `app/(auth)/forgot-password`, `app/(auth)/reset-password` | `auth/__tests__/password-reset.test.ts` |
| 本番公開チェック: 利用規約・プライバシーポリシーの下書き検知 | `queries/go-live.ts#checkLegalDocs` | `go-live.test.ts` |
| 運営の二段階認証（必須・バックアップコード・やり直しスクリプト） | `server/auth/guards.ts#needsTwoFactorSetup`, `auth.ts`（twoFactor）, `app/(auth)/two-factor`, `scripts/admin-reset-2fa.ts` | `two-factor.test.ts`, `two-factor-guard.test.ts`, `authorization.test.ts`, `provisioning.test.ts` |
| 商品編集中に売れた分を在庫に戻さない（#2） | `actions/farmer-products.ts#saveProduct`（開いた時点の在庫との差分だけ反映） | `actions/__tests__/product-stock.test.ts` |
| 画像アップロードの保存先・ロール・中身の検証（#3） | `services/storage.ts#uploadFolderFor/sniffImageType`, `app/api/upload` | `services/__tests__/upload.test.ts` |
| 最終確認画面のキャンセル・返品の表示（特商法12条の6, #1） | `config/content.ts#cancellationPolicy`, `checkout/order-summary.tsx`, Stripe `custom_text` | `components/checkout/__tests__/final-confirmation.test.tsx` |
| 一部返金後の領収書（#4） | `lib/receipt.ts#receiptAmounts` | `services/__tests__/receipt.test.ts` |
| フォロー中の農家の新商品のお知らせ（#5） | `services/product-launch.ts` | `actions/__tests__/product-launch.test.ts` |
| 自動送金の農家に手動の「振込済み」を出さない・送金前に Stripe の既存送金を確認（二重払い防止, #13） | `services/payouts.ts#markPayoutPaidManually/executeDuePayouts`, `payments/stripe.ts#findPayoutTransfer`, `admin/payouts/payouts-table.tsx` | `services/__tests__/manual-payout.test.ts`, `payout-transfer-lookup.test.ts` |
| 停止中の農家の売上・返金の相殺も月次で精算する（#14） | `jobs/index.ts`（close-payouts） | `jobs/suspended-farm-payout.test.ts` |
| 決済画面で「戻る」を押したら注文をすぐ取り消し、在庫とクーポンを戻して案内する（#17） | `services/orders.ts#abandonCheckout`, `actions/checkout.ts#cancelAbandonedCheckout`, `shop/cart/checkout-canceled-notice.tsx` | `services/__tests__/abandon-checkout.test.ts`, `authorization.test.ts` |
| 出店審査: 見送り後の再申請（前回の内容入り）・審査中の準備案内・見送り／停止のメール（#15） | `actions/join.ts`, `actions/admin-farms.ts#setFarmStatus`, `shop/join/join-gate.tsx`, `lib/farms.ts`, `email/templates.ts#farmRejected/farmSuspended` | `actions/__tests__/farm-application.test.tsx` |
