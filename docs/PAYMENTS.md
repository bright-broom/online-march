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
- Stripe 決済手数料（約3.6%）はプラットフォームの手数料10%から負担する想定。

## モード

| 条件 | 挙動 |
| --- | --- |
| `STRIPE_SECRET_KEY` なし | デモ決済: 注文確定ボタンで即 `markOrderPaid`（provider=demo） |
| あり | Stripe Checkout（カード / Apple Pay / Google Pay / コンビニ等は Dashboard の Payment methods で有効化）|

## Webhook（/api/webhooks/stripe）

`checkout.session.completed` / `async_payment_succeeded` → `markOrderPaid`（冪等）
`checkout.session.expired` / `async_payment_failed` → `expireUnpaidOrder`
`account.updated` → `farms.stripeOnboarded`（= transfers capability が active）

Stripe は送信先ごとに署名シークレットが別。同じ URL に「自分のアカウント」(`STRIPE_WEBHOOK_SECRET`) と
「連結アカウント」(`STRIPE_CONNECT_WEBHOOK_SECRET`) の2つの送信先を作り、`constructWebhookEvent` が両方で検証する。

success ページでも session を確認して `markOrderPaid` を呼ぶ（webhook 遅延対策、冪等なので二重実行可）。

## Connect オンボーディング

/farmer/payouts →「振込先を登録」→ `createConnectOnboardingLink`（Express, JP）→ 完了後 `/api/farmer/stripe-return` が
アカウント状態を即時同期して /farmer/payouts へ戻す（以後の変化は webhook で追従）。
未登録の農家の精算は `pending` のまま → 運営が /admin/payouts で銀行振込し「振込済み」にする運用も可。

## 返金・キャンセル

- 顧客キャンセル（発送前のみ）: 全 farm_orders cancelled → Stripe 全額返金 → orders.refunded。
- 部分（農家単位）返金: admin が /admin/orders から実行 → `services/refunds.ts#refundOrder`
  （配達済み→refunded / 発送前→cancelled＋在庫戻し / 配送中は拒否）。`farm_orders.refundedAt/refundAmount` に記録。
- 精算締め後の返金は **翌月の精算で自動相殺**（clawback）：`close-payouts` が「精算済み（payoutId あり）かつ返金済み・未相殺」の
  farm_orders の `payoutAmount` を差し引き、`payouts.refundAdjustment` に記録、`farm_orders.clawbackPayoutId` で二重控除を防ぐ。
  差引後が最低振込額未満（マイナス含む）なら全額翌月へ繰越。

## 安全性（二重処理・非同期決済）

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
