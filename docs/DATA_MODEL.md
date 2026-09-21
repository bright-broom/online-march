# DATA MODEL

定義: `src/db/schema/{auth,marketplace}.ts`。変更したら **`npm run db:generate`** でマイグレーション生成（`drizzle/`）。

規約: 金額=整数円 / 率=bps（1000=10%）/ 重量=g / 日付(業務日)=`date`(JST, "YYYY-MM-DD") / 時刻=`timestamptz`。

## ER（主要）

```
user 1─1 farms 1─* products 1─* product_variants
                          └─* product_images
user 1─* orders 1─* farm_orders *─1 farms
                    farm_orders 1─* order_items (snapshot) ─→ products/variants (nullable)
                    farm_orders 1─* shipment_events
                    farm_orders *─1 payouts
reviews (user, product, farm, farm_order)   favorites (user, product)   farm_follows (user, farm)
messages (farm, customer, sender)           notifications (user)        coupons / announcements
platform_settings (key/value)               job_runs (automation log)
```

## 退会（アカウント削除）

`user.deletedAt` が入っている行は退会済み。**user 行は消さない**: 注文は `onDelete: "cascade"` なので、
行を消すと売上・精算の記録ごと消える（生産者の帳簿と月次精算が壊れる）。代わりに個人情報だけを消す。

| 消す | 残す |
| --- | --- |
| 氏名・メール・電話・アドレス帳・お気に入り・フォロー・お知らせ・生産者とのメッセージ・ログイン情報（`account`/`session`） | 注文（金額・明細・お届け先スナップショット）とレビュー本文 |

- メールは `deleted+<id>@users.invalid` に置き換える（`user.email` は unique。元のアドレスで再登録できる）
- レビューの表示名は「退会したお客さま」になる
- 進行中の注文（`farm_orders` が pending_payment / paid / preparing / shipped）があるうちは退会できない
- 実装 `server/services/account-closure.ts`、回帰テスト `services/__tests__/account-closure.test.ts`

## テーブル要点

| Table | 要点 |
| --- | --- |
| `farms` | 出品者ショップ。`status` pending/active/suspended。`commissionRateBps` null=既定。出荷設定: `defaultCarrier` `leadTimeDays` `shipWeekdays` `freeShippingThreshold`。評価は `ratingSum/Count` 非正規化 |
| `products` | `category` enum, `variety`, `cultivation`(config key), `harvestFrom/To`(月), `status`, `soldCount`/`rating*` 非正規化 |
| `product_variants` | 規格（5kg 等）。`price` `compareAtPrice` `stock` `weightGrams`（送料計算に使用） |
| `orders` | 顧客の1決済。`shippingAddress` はスナップショット JSON。`paymentProvider` stripe/demo |
| `farm_orders` | 農家別の出荷単位。金額内訳（subtotal, shippingFee, discount, commission*, payoutAmount）と出荷情報（carrier, boxSize/Count, tracking, shipByDate, ETA）をインライン保持 |
| `order_items` | 購入時点の名称・価格スナップショット |
| `shipment_events` | 追跡タイムライン（source: system/farmer/cron/carrier） |
| `payouts` | 月次精算。`scheduledFor`=翌月15日 |
| 在庫（`product_variants.stock`） | 予約は**条件付き更新**（`stock >= 数量` の行だけを減らす）で注文トランザクション内。同時注文は Postgres の行ロックで直列化され、売り越し・在庫マイナスは起きない。キャンセル・返金で戻す。回帰テスト `services/__tests__/stock-race.test.ts` |
| `payouts.transferError` / `transferAttemptedAt` | 自動送金が通らなかった理由と試行時刻（送金成功で null に戻す）。/admin/payouts に表示 |
| `payouts.refundAdjustment` / `farm_orders.clawbackPayoutId` | 精算済み注文の返金を翌月精算で相殺した額と、相殺した精算の参照（二重控除防止） |
| `farm_orders.refundedAt/refundAmount` | 返金の事実（金額・日時）。返金は `services/refunds.ts#refundOrder` のみ。タイムラインに `refund` イベント |

## 状態機械

**orders.status**: `pending_payment → paid → (cancelled | refunded)`；未払いは60分で自動 cancelled。

**farm_orders.status**（遷移表は `config/status.ts#farmOrderTransitions`、実装は `services/orders.ts#transitionFarmOrder` のみ）

```
pending_payment ─paid→ paid ─→ preparing ─→ shipped ─→ delivered ─→ (refunded)
        │                 │          │
        └──→ cancelled ←──┴──────────┘   (在庫を戻す / 全 farm_orders が cancelled なら orders も cancelled)
```

- shipped には追跡番号必須。各遷移で `shipment_events` 追加 + 通知。
- 状態を直接 UPDATE しないこと（必ず service 経由）。

## 規格（variants）の論理削除

注文から参照されている規格は物理削除せず `stock=0` かつ `sortOrder >= REMOVED_VARIANT_SORT`（config/catalog.ts, 10000）にする。
ストア・カート見積り・生産者画面はすべてこの値未満のみ表示/受付。

## 非正規化カウンタ

- `products.soldCount` : `markOrderPaid` で加算。
- `products/farms.ratingSum/Count` : レビュー作成・公開切替で `recomputeRatings()`。
