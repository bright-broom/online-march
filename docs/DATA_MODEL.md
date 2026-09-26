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
admin_audit_logs (actor user, action, target, summary, detail)  ← 運営の操作記録。追記のみ
farm_bank_accounts (farm 1─1)  ← 振込先口座。口座番号は暗号化・下4桁だけ平文
```

`admin_audit_logs`（#19）: 運営が行った変更の操作を1件ずつ残す。`action` は `config/audit.ts#auditActions` のキー、
`actorEmail` は操作時点の控え（`actorId` は退会しても `set null` で行は残る）。消す・書き換える経路は作らない。

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
- **運営による匿名化**（#21, /admin/users）: お客さまからの削除依頼などで、運営が同じ処理を行う（`actions/admin-users.ts#anonymizeUser`）。
  購入者だけ・進行中の注文があるとできない・取り消せない。操作記録には元のアドレスを書かない（user id で追う）。
  ただし、それより前の操作記録（利用停止など）の要約に入っているアドレスはそのまま残る（運営の操作の証跡のため書き換えない）

## 利用停止（#21）

`user.suspendedAt` が入っている間は利用停止中（理由は `user.suspendedReason`、運営のメモ）。/admin/users から運営が停止・再開する
（`actions/admin-users.ts#setUserSuspended`、操作記録 `user.suspend`）。

- ログインできない: Better Auth の `databaseHooks.session.create.before`（`server/auth/auth.ts`）がセッションを作らせない。
  パスワード・二段階認証・メール確認後の自動ログインのどの入口でも同じ
- 停止した時点のセッションは消す。万一残っていても `getSessionUser` が停止中なら null を返す
- 注文・レビュー・ショップはそのまま（進行中の注文は通常どおり発送。返金が要れば運営が `refundOrder`）。
  生産者を停止してもショップは公開のまま。ショップも止めるなら出店の停止（`farms.status`）
- 自分自身・運営ユーザーは停止・匿名化できない（運営は先にロールを変える。最後の1人の決まりが効く）
- 回帰テスト `server/auth/__tests__/user-suspension.test.ts`

## テーブル要点

| Table | 要点 |
| --- | --- |
| `farms` | 出品者ショップ。`status` pending/active/suspended（**却下＝`approvedAt` が空のまま suspended**。`lib/farms.ts#isRejectedApplication`。却下された申請だけ /join から同じ行を書き換えて出し直せる, #15）。`commissionRateBps` null=既定。出荷設定: `defaultCarrier` `leadTimeDays` `shipWeekdays` `freeShippingThreshold`。評価は `ratingSum/Count` 非正規化 |
| `products` | `category` enum, `variety`, `cultivation`(config key), `harvestFrom/To`(月), `status`, `soldCount`/`rating*` 非正規化 |
| `product_variants` | 規格（5kg 等）。`price` `compareAtPrice` `stock` `weightGrams`（送料計算に使用） |
| `orders` | 顧客の1決済。`shippingAddress` はスナップショット JSON。`paymentProvider` stripe/demo |
| `farm_orders` | 農家別の出荷単位。金額内訳（subtotal, shippingFee, discount, commission*, payoutAmount）と出荷情報（carrier, boxSize/Count, tracking, shipByDate, ETA）をインライン保持 |
| `order_items` | 購入時点の名称・価格スナップショット |
| `shipment_events` | 追跡タイムライン（source: system/farmer/cron/carrier）。`actorId` は操作した人（オーナー・スタッフ・運営。#24。自動処理は null）で、生産者の注文画面の履歴に名前を出す |
| `payouts` | 月次精算。`scheduledFor`=翌月15日 |
| 在庫（`product_variants.stock`） | 予約は**条件付き更新**（`stock >= 数量` の行だけを減らす）で注文トランザクション内。同時注文は Postgres の行ロックで直列化され、売り越し・在庫マイナスは起きない。キャンセル・返金で戻す。回帰テスト `services/__tests__/stock-race.test.ts` |
| `payouts.transferError` / `transferAttemptedAt` | 自動送金が通らなかった理由と試行時刻（送金成功で null に戻す）。/admin/payouts に表示 |
| `payouts.refundAdjustment` / `farm_orders.clawbackPayoutId` | 精算済み注文の返金を翌月精算で相殺した額と、相殺した精算の参照（二重控除防止） |
| `reviews.images` | お客さまの写真（#21）。URL の配列（最大 `catalogLimits.maxReviewImages`=3）。付けられるのはこのサイトが reviews フォルダに置いたものだけ（`validators/engagement.ts#reviewImageUrlPattern`。よその画像を商品ページに出させない）。問題があれば運営がレビューごと非公開にする（写真だけを消す操作はない）。付けずに終わった写真・外した写真のファイルは Blob に残る（容量が問題になったら掃除のジョブを足す） |
| `farm_orders.deliveryIssueAt/Note` | 配達の問題（#25。持ち戻り・返送・予定を大きく過ぎても届かない）。入っている間は自動で配達完了にしない。発送済みのあいだだけ画面に出す。docs/SHIPPING.md §5 |
| `products.taxRate` / `order_items.taxRate` | 消費税率（%）。商品は既定 8（食品）、食品以外は 10。注文明細には購入時点の率を控える（#10）。docs/PAYMENTS.md「インボイス」 |
| `farms.invoiceRegistrationNumber` | 生産者の適格請求書発行事業者の登録番号（任意, T＋13桁, #10）。今は保存だけ |
| `coupons.oncePerUser` | お一人さま1回まで（#21）。docs/PAYMENTS.md |
| `user.suspendedAt/suspendedReason` | 運営による利用停止（#21）。下の「利用停止」 |
| `farm_members` | 農園のスタッフ（#24）。オーナーが招待（`email`・`access` all/shipping・`tokenHash`＝招待リンクの sha256・7日有効）→ 招待されたアドレスの**購入者**アカウントで参加すると `userId`・`acceptedAt` が入り、`tokenHash` は消える。1人1農園（`userId` 一意）・1農園5人まで（招待中を含む、`config/farm-staff.ts`）。ロールは変えない。外す＝行を消す（ガードが毎回 DB を見るので次のリクエストから入れない）。退会で所属と招待中の行も消す。スタッフのままでは出店申請できない |
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
