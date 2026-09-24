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
未登録の農家の精算は `pending` のまま → 運営が /admin/payouts で銀行振込し「振込済み」にする運用も可。

## 返金・キャンセル

- **返金は必ず `services/refunds.ts#refundOrder` を通す**（運営の返金・生産者のキャンセル・お客さまのキャンセルの3経路とも）。
  二重返金の防止、`farm_orders.refundedAt/refundAmount` の記録（売上明細CSV・翌月相殺が使う）、タイムライン、
  お客さまへの返金メール（`emailTemplates.refunded`）がそこにまとまっている。Stripe を直接呼ばないこと。
  回帰テスト `services/__tests__/cancel-refund.test.ts`。
- 顧客キャンセル（発送前のみ）: 支払い済みなら `refundOrder`（注文全体）→ 全額返金・orders.refunded。未決済ならキャンセルだけ。
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
