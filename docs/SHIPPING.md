# SHIPPING — 送料計算と出荷自動化

マスタ: `src/config/shipping.ts` / 計算（純関数）: `src/lib/shipping.ts` / CSV: `server/services/shipping/label-csv.ts`
/ 追跡: `server/services/shipping/tracking.ts` / 自動化: `server/jobs/index.ts`

## 1. 送料計算（農家ごと）

1. 商品重量合計 → `packBoxes()`：最大160サイズ(25kg)で箱数を決め、1箱の重量(+梱包400g)が収まる最小サイズを選択。
2. お届け先都道府県 → `zoneOf()`（8ゾーン、発送元=兵庫）。
3. `rateFor(carrier, zone, size)` = ゾーン×サイズ基準額 × キャリア係数 → ×箱数。
4. 農家の `freeShippingThreshold` 以上なら 0 円。

クライアント（カートの目安表示）とサーバー（確定）で **同じ関数** を使う。確定値は常にサーバー。

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
| 配達 | — | cron `sync-tracking` が API or 発送3日後に delivered |
| レビュー | — | cron `review-requests` が配達3日後に依頼メール |

送り状CSV API: `GET /api/farmer/labels?ids=<farmOrderId,...>&carrier=yamato|japanpost|sagawa&encoding=sjis|utf8`
（生産者本人の paid/preparing のみ。`labelPrintedAt` と `label_created` イベントを記録）

追跡CSV取込: 任意CSVの各行から注文コード `AM-YYMMDD-XXXX-n` と 10〜14桁の番号を抽出（`parseTrackingCsv`）。

## 4. Automation（Vercel Cron → `/api/cron/[job]`）

| Job | Schedule (UTC, vercel.json) | Pro 推奨 | 内容 |
| --- | --- | --- | --- |
| `cancel-unpaid` | 15 15 * * *（JST 0:15）| */30 * * * * | 60分未決済の注文をキャンセル・在庫戻し（Stripe は `checkout.session.expired` webhook が主経路）|
| `ship-reminders` | 0 23 * * *（JST 8:00）| 同左 | 期限が明日以前の未発送を農家へ通知 |
| `sync-tracking` | 0 21 * * *（JST 6:00）| 0 */3 * * * | 配達完了の自動反映 |
| `review-requests` | 0 1 * * *（JST 10:00）| 同左 | レビュー依頼 |
| `close-payouts` | 0 16 * * *（JST 毎日 1:00）| 同左 | 月初に前月分の精算を作成・振込予定日（15日）以降に送金。毎日動くので失敗した送金も翌日以降に再試行 |

- すべて冪等。実行ログは `job_runs`、/admin/automation で履歴確認・手動実行。
- 認証: `Authorization: Bearer $CRON_SECRET`。
- 既定の vercel.json は **Hobby プランでも通る1日1回** のスケジュール。Pro プランでは上表「Pro 推奨」に変更する。

## 5. キャリア API 連携（将来）

`fetchTrackingStatus()` を契約 API で実装すれば自動で追跡連携に切替わる。送り状の API 発行に移行する場合も
`label-csv.ts` と同じ `LabelRow` を入力にアダプタを追加する。
