# PAYMENTS — 決済・手数料・精算

設定: `src/config/fees.ts`（既定手数料 10% = 1000bps、月末締め翌月15日払い、最低振込額 1,000円）
アダプタ: `src/server/services/payments/stripe.ts`

## お金の流れ

```
お客さま ──(Stripe Checkout, 1決済)──► プラットフォーム残高
                                         │  farm_orders ごとに:
                                         │    payoutAmount = subtotal + shippingFee − commission
                                         │    commission   = floor(subtotal × rateBps / 10000)   ※送料には課金しない
                                         ▼
                           月次 close-payouts ─► Stripe Connect transfer ─► 農家の口座
```

- 手数料率: `farms.commissionRateBps ?? platform_settings.commissionRateBps ?? feeConfig.default`（admin で変更可）。
  注文時点の率を `farm_orders.commissionRateBps` に固定保存（後から率を変えても過去注文は不変）。
- クーポンは **プラットフォーム負担**。`farm_orders.discount` は表示用配分で、農家の payout は減らない。
- **利用回数は注文作成時に確保**（在庫と同じ条件付き更新: `used_count < max_uses` の行だけ +1）。支払い時には数えない。
  同時チェックアウトでも上限を超えず、未払い注文を並べて上限を回避することもできない。注文全体がキャンセル/期限切れに
  なったときだけ戻す（`releaseCoupon`、0 未満にはならない）。返金では戻さない（取引自体は成立したため）。
  回帰テスト `services/__tests__/coupon-limit.test.ts`。
- **お一人さま1回まで**（`coupons.once_per_user`、運営のクーポン画面でオン/オフ）: その人の注文に同じコードがあれば使えない。
  キャンセルした注文は数えない（未払い・支払済み・返金済みは数える。返金で使用回数を戻さないのと同じ考え）。
  見積もり（`quoteCart` に `userId`）で断り、注文作成では人とコードの組で `pg_advisory_xact_lock` を取ってから数え直す
  （同じ人の同時の注文が両方通らないように）。誰の見積もりか分からないときは割り引かない。
  回帰テスト `services/__tests__/coupon-once-per-user.test.ts`。
- Stripe 決済手数料（約3.6%）はプラットフォームの手数料10%から負担する想定。
- **ゴールデンルート回帰テスト** `services/__tests__/golden-route.test.ts`:
  注文 → Stripe 署名付き webhook → 出荷 → 配達 → 月次締め → Connect 送金 を一本で通す。
  各段の個別テストは通るのに「つなぎ目」だけ壊れる事故（精算が farm_orders を claim しない、
  送金後に payout が paid にならない等）を検知する。本番では 2026-09-20 にテストカードで通し確認済み。

## 生産者向けの書き出し

`/api/farmer/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&encoding=sjis|utf8` — 確定申告・記帳用の売上明細 CSV。
1行 = 1出荷単位（farm_orders）、**注文日**で期間を切り、未決済は除外、キャンセル・返金は含める。
列は 注文日 / 注文番号 / 出荷単位番号 / 状態 / お届け先（都道府県）/ 商品 / 商品代金 / 送料 / クーポン割引 /
販売手数料 / 受取額 / 返金日 / 発送日 / 配達日 / 精算予定日 / 入金日、最終行に合計。
実装 `services/sales-csv.ts` + `queries/farmer.ts#getSalesRows`、UI は /farmer/payouts。
回帰テスト `services/__tests__/sales-csv.test.ts`（農園スコープ・期間の境界・金額の整合・CSVエスケープ）。

## 運営向けの書き出し（会計CSV）

`/api/admin/accounting?month=YYYY-MM&encoding=utf8|sjis`（既定 UTF-8・BOM 付き）— 運営の月次の記帳用（#21）。
/admin/payouts の「会計CSVの書き出し」から。運営（二段階認証済み）だけが取れ、書き出すたびに操作記録
（`accounting.export`）に残す。**注文日（JST）**で月を切り、未決済は除外、キャンセル・返金は含める。
1ファイルに2つの表: 明細（1行 = 1出荷単位。注文日 / 注文番号 / 出荷単位番号 / 生産者 / 状態 / 決済手段 / 商品代金 / 送料 /
クーポン割引（運営負担）/ お客さま支払額 / 販売手数料（運営の収入）/ 生産者受取額 / 返金額 / 返金日 / 精算予定日 / 入金日）と、
生産者別の集計＋合計。**勘定科目の割り当てはしない**（会計ソフト・税理士ごとに違うため）。
実装 `services/accounting-csv.ts` + `queries/admin.ts#getAccountingRows`、`app/api/admin/accounting/route.ts`。
回帰テスト `services/__tests__/accounting-csv.test.ts`（権限・二段階認証・月の境界・未決済の除外・明細と集計の一致・BOM・操作記録）。

## モード

| 条件 | 挙動 |
| --- | --- |
| `STRIPE_SECRET_KEY` なし | デモ決済: 注文確定ボタンで即 `markOrderPaid`（provider=demo） |
| あり | Stripe Checkout（表示される決済手段は Dashboard の設定しだい。下記「決済手段」参照）|

## 決済手段

設定: `src/config/payments.ts`（案内する手段のラベルと性質。FAQ・決済ページ・領収書はここから生成）

Checkout セッションでは **`payment_method_types` を送らない**（dynamic payment methods）。
実際に表示されるのは [Stripe ダッシュボード → 決済手段](https://dashboard.stripe.com/settings/payment_methods) で
有効にしたものだけ。コードで固定しないのは、未有効化の手段を指定すると **Checkout の作成自体が 400 で落ち、
全員が決済できなくなる**ため。手段を増やす手順はダッシュボードで ON にするだけ（デプロイ不要）。

| 手段 | 性質 | 備考 |
| --- | --- | --- |
| カード（Visa/Mastercard/JCB/AMEX/Diners） | 即時確定 | Apple Pay / Google Pay / Link もここに含まれる |
| PayPay | 即時確定（アプリへ遷移） | JP・JPY のみ。最低 50円・最大 100万円。返金は全額/一部とも可（購入後365日） |
| コンビニ払い | **後日入金** | 支払い番号を発行 → 入金で確定。`payment_method_options.konbini.expires_after_days` で期限を指定 |

### 後日入金（コンビニ払い）の扱い

1. `checkout.session.completed` は来るが `payment_status = "unpaid"` → `recordAwaitingPayment`。
   注文は `pending_payment` のまま **在庫だけ押さえ**、支払い番号ページ（`orders.payment_voucher_url`）と
   期限（`payment_due_at`）を保存し、メールとマイページで案内する。生産者にはまだ通知しない。
2. 入金 → `checkout.session.async_payment_succeeded` → `markOrderPaid`（手段も記録、支払い番号は消す）。
3. 期限切れ → `async_payment_failed` または `cancel-unpaid` ジョブ → 注文キャンセル・在庫と
   クーポンを戻す。**打ち切る前に PaymentIntent を cancel する**（支払い番号が生きたままだと、
   キャンセル後にレジで入金されてしまう）。そのため `konbini.expiresAfterDays` は
   `shippingPolicy.asyncPaymentTtlDays` より短くする（config 読み込み時に検証）。

回帰テスト `services/__tests__/deferred-payment.test.ts`（Webhook の署名検証込み）、
`jobs/cancel-unpaid-stripe.test.ts`（打ち切り時の PaymentIntent cancel）。

使われた手段は `orders.payment_method`（Stripe の payment method type）に保存し、
マイページ・領収書・運営の注文詳細に表示する。

## Webhook（/api/webhooks/stripe）

`checkout.session.completed` / `async_payment_succeeded` → 入金済みなら `markOrderPaid`（冪等）、
未入金（コンビニ払いの番号発行）なら `recordAwaitingPayment`
`checkout.session.expired` / `async_payment_failed` → `expireUnpaidOrder`
`account.updated` → `syncFarmPayoutReady`（v1 イベント。v2 アカウントでも送られる。状態は Accounts v2 で取り直す）

Stripe は送信先ごとに署名シークレットが別。同じ URL に「自分のアカウント」(`STRIPE_WEBHOOK_SECRET`) と
「連結アカウント」(`STRIPE_CONNECT_WEBHOOK_SECRET`) の2つの送信先を作り、`constructWebhookEvent` が両方で検証する。

### Accounts v2 イベント（/api/webhooks/stripe/accounts）

3つ目の送信先「自分のアカウント」・ペイロード **thin**（`STRIPE_ACCOUNTS_WEBHOOK_SECRET`）で
`v2.core.account[configuration.recipient].capability_status_updated` / `v2.core.account[requirements].updated` を受け、
`parseAccountEventNotification` → `syncFarmPayoutReady`。thin イベントはアカウント ID だけなので必ず取り直す。
シークレット未設定なら 404（`account.updated` だけでも追従はできる）。

success ページでも session を確認して `markOrderPaid` を呼ぶ（webhook 遅延対策、冪等なので二重実行可）。

**決済画面で「戻る」を押したとき（#17）**: `cancel_url` は `/cart?canceled_order=<注文ID>`（`config/payments.ts#checkoutCanceledParam`）。
カートの `CheckoutCanceledNotice` が `actions/checkout.ts#cancelAbandonedCheckout` → `services/orders.ts#abandonCheckout` を呼び、
期限（60分）を待たずに注文を取り消して在庫とクーポンを戻す。取り消す前に `resolveStaleCheckout` で Stripe の決済画面を閉じる
（別タブで後から払われないように）。そこで支払い済み・コンビニ払いの番号発行済みと分かった注文は取り消さず、そう案内する。
案内文は `config/payments.ts#checkoutCanceledCopy`。回帰テスト `services/__tests__/abandon-checkout.test.ts`・`authorization.test.ts`。

## Connect オンボーディング

/farmer/payouts →「振込先を登録」→ `createConnectOnboardingLink` → 完了後 `/api/farmer/stripe-return` が
アカウント状態を即時同期して /farmer/payouts へ戻す（以後の変化は webhook で追従）。

- **Accounts v2**（`/v2/core/accounts`）で作成。v1 の `accounts.create({ type: "express" })` は新規連携では Stripe が拒否する。
  - `configuration.recipient` で `stripe_balance.stripe_transfers` のみ要求（merchant / card_payments は不要）
  - `dashboard: "express"`、`defaults.responsibilities` は fees / losses とも `application`（プラットフォーム負担）
  - `identity.country: "jp"`、`defaults.currency: "jpy"`、作成は `connect-account:<farmId>` で冪等
- 送金可否 = `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === "active"`（`isPayoutReady`）。
  v1 の `capabilities.transfers` / `payouts_enabled` は使わない。v1 で作ったアカウントも同じ acct_ ID で v2 取得できる。
- 未完了は v2 Account Links（`account_onboarding`）。登録済みの「登録内容を確認・変更」は Express ダッシュボードの
  ログインリンク（`accounts.createLoginLink`）。Express アカウントには `account_update` リンクを作れない。
未登録の農家の精算は `pending` のまま → 運営が /admin/payouts で銀行振込し「振込済み」にする。
振込先は生産者が /farmer/payouts の「振込先口座」で登録する（#20, `farm_bank_accounts`）。口座番号は AES-256-GCM で暗号化して保存し
（`services/bank-account.ts`、鍵は `BETTER_AUTH_SECRET` から導出）、画面には下4桁だけ出す。運営は精算の明細で「全桁を表示」を押したときだけ
全桁を見られ、その操作は操作記録（`farm.bank_account_reveal`）に残る。回帰テスト `actions/__tests__/bank-account.test.ts`。
Stripe で自動送金する農家には「振込済みにする」を出さない（送金の失敗が記録されたときだけ出す。→ 下の「手動の振込済み」）。

## 返金・キャンセル

- **返金は必ず `services/refunds.ts#refundOrder` を通す**（運営の返金・生産者のキャンセル・お客さまのキャンセルの3経路とも）。
  二重返金の防止、`farm_orders.refundedAt/refundAmount` の記録（売上明細CSV・翌月相殺が使う）、タイムライン、
  お客さまへの返金メール（`emailTemplates.refunded`）がそこにまとまっている。Stripe を直接呼ばないこと。
  回帰テスト `services/__tests__/cancel-refund.test.ts`。
- 顧客キャンセル（#18。オーナーの決定は Issue #18 のコメント、文言と数値は `config/order-cancel.ts`、判定は `lib/order-cancel.ts#customerCancelMode`）:
  - **生産者が準備を始める前（新規受注）だけ**、お客さまが自分で取り消せる。注文全体（`cancelOrderByCustomer`。1軒でも出荷準備中なら断る）か、
    複数の農家の注文なら農家ごと（`services/cancel-requests.ts#cancelFarmOrderByCustomer`＝その出荷単位を送料込みで `refundOrder`）。
    未決済ならキャンセルだけ
  - **出荷準備中になった後は「キャンセルの依頼」**（`requestCancelByCustomer`、出荷単位ごとに1回）。農園のオーナーに知らせる。
    生産者（キャンセルの権限＝オーナーと「すべて」のスタッフ）が承認すると `refundOrder` で全額返金、お断りするとお客さまに知らせてそのまま発送。
    **回答するまで生産者は発送済みにできない**（1件・一括・送り状の取り込みとも）。運営が発送済みにしたときは「お断り」で閉じる
  - 猶予は無い（「準備を始める」で締め切り。生産者の画面にその旨を出す）
  - 同時に押されたとき: `refundOrder` の `onlyStatus` で、返金の行を押さえる更新の中で状態を確かめる（取り消しは「新規受注」、承認は「出荷準備中」のときだけ）。
    押さえた行（`refundedAt` あり）は準備にも発送にも進めない（`transitionFarmOrder`）。依頼の記録・回答も、状態を条件にした更新で1回だけ
  - 回帰テスト `services/__tests__/cancel-request.test.ts`
- 生産者キャンセル（発送前のみ, `refunds.ts#cancelFarmOrderAsFarmer`）: 支払い済みなら `refundOrder`（その出荷単位）で返金。
  **2026-09-24 まではキャンセルで在庫を戻すだけで返金されていなかった**（画面には「返金は運営が行います」とあったが運営に通知はなかった）。
- お支払い期限切れ（`expireUnpaidOrder`）: お支払い番号を受け取った人（`payment_due_at` あり＝コンビニ払い）にだけ
  キャンセルのメール（`emailTemplates.paymentExpired`）。決済画面を閉じただけの人には送らない。
- 部分（農家単位）返金: admin が /admin/orders から実行 → `services/refunds.ts#refundOrder`
  （配達済み→refunded / 発送前→cancelled＋在庫戻し / 配送中は拒否）。`farm_orders.refundedAt/refundAmount` に記録。
- **返金の二重実行防止**: `refundOrder` は対象 farm_orders を `refundedAt IS NULL` 条件で**先に確保**してから Stripe を呼ぶ。
  同時に2人が押しても Stripe 呼び出し・通知・タイムラインの `refund` 行は1回だけ。Stripe が失敗したら確保を解除して
  再試行できる状態に戻す（金額は idempotency key でも守られるが、それだけでは通知とAPI呼び出しが二重になる）。
  回帰テスト `services/__tests__/refund-race.test.ts`。
- 精算締め後の返金は **翌月の精算で自動相殺**（clawback）：`close-payouts` が「精算済み（payoutId あり）かつ返金済み・未相殺」の
  farm_orders の `payoutAmount` を差し引き、`payouts.refundAdjustment` に記録、`farm_orders.clawbackPayoutId` で二重控除を防ぐ。
  差引後が最低振込額未満（マイナス含む）なら全額翌月へ繰越。
- **締めの対象は全農家**（停止中を含む, #14）。停止はストアに出さないだけで進行中の注文の出荷は続くため、その売上と返金の相殺も
  通常どおり精算する。回帰テスト `jobs/suspended-farm-payout.test.ts`。

## 安全性（二重処理・非同期決済）

- **送金（`services/payouts.ts#executeDuePayouts`）**: 期日到来の pending を1件ずつ処理。送金直前に Accounts v2 で
  `stripe_transfers` を再確認し（無効なら `stripeOnboarded=false` にして手動振込待ちへ）、1件の失敗で他農家を止めない。
  失敗・残高不足はジョブを失敗扱いにして /admin/automation に出し、理由を `payouts.transferError` に保存（/admin/payouts に表示）、
  運営ユーザー全員へ通知。pending のまま翌日以降の実行で再試行し、成功時は `transferError` を null に戻して農家へ通知。
- **残高の事前確認**: 実行開始時に `balance.retrieve()` の available（JPY）を取り、送金額が残高を超える精算は **Stripe を呼ばずに**
  見送る。残高不足で API を叩くと、その精算の idempotency key（payoutId）にエラー応答が最大24時間貼り付き、翌日の再試行まで
  弾かれるため。残高は1回だけ取得し、成功した送金額をローカルで差し引く。
- **重複実行（Cron の再配信・今すぐ実行の重なり）**: `close-payouts` は精算の insert と farm_orders の紐付けを1トランザクションで行い、
  紐付けは `payoutId IS NULL`（相殺は `clawbackPayoutId IS NULL`）の行だけを対象にする。件数が合わなければ先行した実行が
  確定済みとみなしてロールバック（同じ注文から精算が2件でき、二重送金になるのを防ぐ）。送金後の `paid` 更新も `status='pending'`
  条件付きで、重なった実行は Stripe から同じ Transfer（同じ idempotency key）を受け取るだけで記録・通知は1回。
- **既存の送金の確認（`stripe.ts#findPayoutTransfer`）**: 送金の idempotency key が効くのは約24時間だけ。Stripe の送金が通ったのに
  DB の記録が失敗すると、精算は pending のまま `transferError` まで残り、翌日の再試行では新しい送金が作られてしまう。
  そこで送金の前に、その農家あての Transfer から `metadata.payoutId` が一致するもの（全額取り消し済みは除く）を探し、
  あればそれを記録して送り直さない。
- **手動の振込済み（`services/payouts.ts#markPayoutPaidManually`, #13）**: Stripe 登録済み（`stripeOnboarded`）の農家は
  送金失敗（`transferError`）が記録されていない限り拒否。失敗が記録されていても、Stripe アカウントがある農家は
  先に Stripe に送金を問い合わせ、あればそれを記録するだけ（「銀行振込は不要」と表示）。Stripe に確かめられないときは記録しない。
  記録すると `paid` になり自動送金の対象から外れるので、**銀行振込は記録のあとに行う**（確認ダイアログにも書いてある）。
  Stripe 未設定（デモ）ではすべて手動。回帰テスト `services/__tests__/manual-payout.test.ts`, `payout-transfer-lookup.test.ts`。
- **Idempotency key**: Checkout Session / クーポン（`orderId`）、返金（`order:` / `farm-order:`）、農家への送金（`payoutId`）。
  リトライや DB 書込失敗後の再実行で二重返金・二重送金にならない。
- **コンビニ払い等の非同期決済**: 支払い番号発行後は `checkout.session.completed`（payment_status=unpaid）→ 入金で
  `async_payment_succeeded`。`cancel-unpaid` は TTL 経過注文を即キャンセルせず `resolveStaleCheckout` で Stripe に確認する:
  open → Session を expire してからキャンセル（期限後に払えないように）／ paid → webhook 取りこぼしとして `markOrderPaid` で回復／
  入金待ち → `shippingPolicy.asyncPaymentTtlDays`（7日）まで待機。

## 税（消費税）と Stripe Tax

売買契約は購入者と各生産者の間で成立し（利用規約 第3条）、運営は代金の収納代行。価格はすべて **税込（内税）** で農家が設定する。
商品の消費税の納税義務者は各生産者（多くは免税事業者）であり、運営が売り手として税を計算・上乗せする Stripe Tax（`automatic_tax`）は
このモデルでは使わない。運営が納める消費税は手数料収入（農家向け役務）分のみ。

## インボイス（適格請求書）対応（#10）

オーナーの決定（Issue #10 のコメント, 2026-09-26）と実装:

| 項目 | 実装 |
| --- | --- |
| 運営の登録番号 | `src/config/site.ts#company.invoiceRegistrationNumber`（T＋13桁）。**空の間は領収書・支払通知書に出さない**。本番公開チェックの「適格請求書の登録番号」が、空なら要確認・形が違えば公開を止める |
| 税率 | 商品は `products.taxRate`（既定 8% 軽減税率。食品以外は 10% を選べる。商品フォーム）、注文時の税率を `order_items.taxRate` に控える。送料・販売手数料は 10%。`config/tax.ts` |
| 端数処理 | 金額はすべて税込。**税率ごとの合計に対して1回だけ切り捨て**（`lib/tax.ts#taxIncluded`）。割引（運営負担のクーポン）は商品だけから税率の割合で按分、返金はその出荷単位の中で按分（`lib/tax.ts#taxBreakdown`）。税理士の確認前提 |
| 領収書 | 明細（軽減税率の商品に ※ と注記）、税率ごとの対価の額と消費税額、運営の登録番号（設定されていれば）。`components/mypage/receipt-view.tsx`、`lib/receipt.ts#receiptTaxLines` |
| 支払通知書 | /farmer/payouts の精算の内訳から開く（オーナーだけ）。売上・送料・販売手数料（税込・うち消費税 10%）・返金の相殺・振込額・対象の注文。運営の登録番号があれば販売手数料の適格請求書を兼ねる。`components/farmer/payouts/payout-statement.tsx` |
| 生産者の登録番号 | `farms.invoiceRegistrationNumber`（任意）。/farmer/payouts のカードで登録（オーナーだけ）。**今は保存だけ**（売主の決定待ち） |

> **要確認（オーナー・税理士）**: 上の「税（消費税）と Stripe Tax」節の前提は「売主は各生産者、運営は収納代行」。一方、領収書の発行者は運営で、
> 運営の登録番号を設定すると**商品代金を含む領収書に運営の登録番号が載る**。売主が生産者のままなら、運営の番号で商品の適格請求書を出すことになり
> （媒介者交付特例などの条件の確認が要る）、食い違う。**売主を誰にするか（STATUS §2 の「売主は誰か」）が決まるまで、登録番号は設定しないこと**。
> 決まったら、領収書に載せる番号（運営か各生産者か）をここで決め直す。

