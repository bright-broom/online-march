# SHIPPING — 送料計算と出荷自動化

マスタ: `src/config/shipping.ts` / 計算（純関数）: `src/lib/shipping.ts` / CSV: `server/services/shipping/label-csv.ts`
/ 追跡: `server/services/shipping/tracking.ts` / 自動化: `server/jobs/index.ts`

## 1. 送料計算（農家ごと）

1. 商品重量合計 → `packBoxes()`：最大160サイズ(25kg)で箱数を決め、1箱の重量(+梱包400g)が収まる最小サイズを選択。
2. お届け先都道府県 → `zoneOf()`（8ゾーン、発送元=兵庫）。
3. `rateFor(carrier, zone, size)` = ゾーン×サイズ基準額 × キャリア係数 → ×箱数。
4. 農家の `freeShippingThreshold` 以上なら 0 円。

クライアント（カートの目安表示）とサーバー（確定）で **同じ関数** を使う。確定値は常にサーバー。

## 受付の一時停止（お休み）

`farms.pausedUntil`（date, nullable）。この日までは新規注文を受け付けない。過ぎれば自動で再開する
（解除し忘れて売り逃さないよう、終了日を必ず持たせる設計。過去日は設定できない）。

- 判定は `quoteCart` の1か所: 停止中の農園の明細は `unavailable` になり、`createOrder` も通らない
- 商品ページ・農園ページは見えたまま「お休み中」と表示（フォロワーや検索流入を失わないため）。
  ページはキャッシュされるので、表示側の日付判定はブラウザで行う
- 設定は /farmer/settings（3日・1週間・2週間・1か月のプリセット、または日付指定）
- 回帰テスト `services/__tests__/farm-pause.test.ts`

## 2. お届け日程

`scheduleDelivery()`: 最短出荷日 = 今日 + `leadTimeDays` を `shipWeekdays` に繰り上げ。最短着 = +`transitDays`。
希望日指定時は 希望日 − transit を出荷曜日に繰り下げて `shipByDate`。選択可能期間 = 最短着 + 21日。
複数農家カートは「全農家が間に合う最短日」以降のみ選択可。

## 3. 出荷ワークフロー（生産者: /farmer/shipping 出荷センター）

| Step | 操作 | 自動化 |
| --- | --- | --- |
| 受注 | 決済完了で farm_order=paid | 農家へメール+通知、出荷期限算出 |
| 準備 | 「出荷準備中にする」(一括可) | お客さまの注文画面に反映 |
| 送り状 | 対象を選択 →「送り状CSV」 | B2クラウド / ゆうプリR / e飛伝Ⅲ 形式（Shift_JIS）を生成、`labelPrintedAt` 記録 |
| 納品書 | 「納品書を印刷」 | `/farmer/orders/[id]/slip` 印刷用ページ |
| 発送 | 追跡番号を入力 or 追跡CSVを取込 | 一括で shipped、発送メール（追跡リンク付き） |
| 配達 | お客さまがマイページで「受け取りました」→ その場で delivered | cron `sync-tracking` が業者の記録 or **お届け予定日の翌日**に delivered（下の 5 節） |
| レビュー | — | cron `review-requests` が配達3日後に依頼メール |

送り状CSV API: `GET /api/farmer/labels?ids=<farmOrderId,...>&carrier=yamato|japanpost|sagawa&encoding=sjis|utf8`
（生産者本人の paid/preparing のみ。`labelPrintedAt` と `label_created` イベントを記録）

追跡CSV取込: 任意CSVの各行から注文コード `AM-YYMMDD-XXXX-n` と追跡番号を抽出（`parseTrackingCsv`）。
見出し行に「伝票番号」「追跡番号」「お問い合わせ番号」などがあればその列だけを読み、無ければ数字10〜14桁のうち
電話番号の形（0 始まり 10〜11 桁）を除いた最初のものを使う（お届け先の電話番号の取り違え防止, #21）。
追跡番号の決まりは手入力・CSV・運営の入力で1つ（`lib/shipping.ts#trackingNumberPattern`: 全角・空白・ハイフンをそろえて英数字8〜20桁）。

## 4. Automation（Vercel Cron → `/api/cron/[job]`）

| Job | Schedule (UTC, vercel.json) | Pro 推奨 | 内容 |
| --- | --- | --- | --- |
| `cancel-unpaid` | 15 15 * * *（JST 0:15）| */30 * * * * | 60分未決済の注文をキャンセル・在庫戻し（Stripe は `checkout.session.expired` webhook が主経路）|
| `ship-reminders` | 0 23 * * *（JST 8:00）| 同左 | 期限が明日以前の未発送を農家へ通知。期限を過ぎたものは発送されるまで毎日1回（件名「【至急】」, #21） |
| `sync-tracking` | 0 21 * * *（JST 6:00）| 0 */3 * * * | 配達完了の自動反映 |
| `review-requests` | 0 1 * * *（JST 10:00）| 同左 | レビュー依頼 |
| `backup-db` | 30 17 * * *（JST 翌 2:30）| 同左 | 全テーブルを JSON(gzip) で非公開 Blob に保存 → **保存後に読み戻して検証** → 14日より古い分を削除 |
| `close-payouts` | 0 16 * * *（JST 毎日 1:00）| 同左 | 月初に前月分の精算を作成・振込予定日（15日）以降に送金。毎日動くので失敗した送金も翌日以降に再試行 |
| `compare-prices` | 45 19 * * *（JST 4:45）| 同左 | 「通常価格」の打ち消し表示を販売の記録から見直す（値下げ8週間で表示をやめる。docs/DATA_MODEL.md「通常価格の打ち消し表示」, #11） |

- すべて冪等。実行ログは `job_runs`、/admin/automation で履歴確認・手動実行。
- **失敗・停止は運営に通知**（`services/ops-alerts.ts#alertAdmins`）: ジョブが throw したら「自動処理が失敗しました」、
  いずれかのジョブが `maxAgeHours`（既定30h）以内に成功していなければ「自動処理が動いていません」を admin 全員へ。
  停止の検知は毎回の実行後に走るため、動いているジョブが動かなくなったジョブを報告する。同一内容は20時間は再通知しない。
- 認証: `Authorization: Bearer $CRON_SECRET`。
- 既定の vercel.json は **Hobby プランでも通る1日1回** のスケジュール。Pro プランでは上表「Pro 推奨」に変更する。

## 5. 配達完了の判定と配送業者の追跡 API（#25）

オーナーの決定（Issue #25 のコメント, 2026-09-26）: 業者との API 契約は**まだ**。契約するときは**運営がまとめて**契約し費用も持つ
（接続情報は環境変数に1つ、生産者は何もしない）。判定は `services/shipping/delivery.ts#syncDeliveries`（cron `sync-tracking`）。

| 状況 | どうなるか |
| --- | --- |
| お客さまが「受け取りました」（マイページの発送済みの荷物） | その場で配達完了（`actions/account.ts#confirmReceived`。自分の注文の発送済みだけ） |
| 業者の記録が「配達完了」 | 配達完了（source `carrier`）。配達の問題があっても解ける |
| 業者の記録が「届けられなかった」（持ち戻り・返送） | **配達の問題**（`farm_orders.deliveryIssueAt/Note`）。生産者と運営に1回だけ知らせ、**自動完了を止める**。状態は発送済みのまま。運営が判断する（届いていれば配達完了、届かないなら `refundOrder`） |
| 業者の API が無い（**今はすべての業者**） | **お届け予定日の翌日**（`shippingPolicy.autoDeliveredAfterEtaDays`）に配達完了。予定日の無い古い注文だけ発送から `autoDeliveredAfterDays` 日 |
| API はあるが障害 | 予定日から `trackingGraceDays`（7日）までは待ち、過ぎたら配達完了（精算を止めない） |
| API はあるが輸送中のまま | 予定日から `trackingGraceDays` を過ぎたら配達の問題にする |

- **お届け予定日は発送したときに引き直す**（`transitionFarmOrder`: 発送日＋地域の輸送日数。遅れて発送したら後ろへ、希望日など先の日付はそのまま）。
  注文時の予定日のままだと、遅れて発送した荷物がすぐ「配達完了」になってしまうため。発送メールの「お届け予定」もこの日
- 配達の問題は生産者・運営の注文画面に出る（`components/common/delivery-issue-alert.tsx`）。お客さまの配送の記録にも「配送トラブル」が出る

**業者と契約したら**（つなぎ込みの手順）:
1. `src/server/services/shipping/carriers/<業者>.ts` に `TrackingAdapter`（`fetch(trackingNumber)` → `TrackingStatus | null`）を書く。
   業者の状態を `in_transit` / `out_for_delivery` / `delivered` / `exception`（届けられなかった理由は `detail`）に対応させる
2. 接続情報は `src/lib/env.ts` に足し（**キーが無ければアダプタを登録しない**＝今までどおり動く）、`tracking.ts#trackingAdapters` に登録する
3. `services/__tests__/delivery-sync.test.ts` と同じ形で、その業者の応答（配達済み・持ち戻り・番号なし・タイムアウト）ごとにテストを書く
4. docs/DEPLOY.md の環境変数の表に足す（Vercel の設定変更はオーナーの承認が要る）

送り状の API 発行に移行する場合も `label-csv.ts` と同じ `LabelRow` を入力にアダプタを追加する。
