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
