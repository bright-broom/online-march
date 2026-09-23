<div align="center">

# <img src="docs/icons/accent/sprout.svg" width="32" height="32" alt="" /> あわじ玉ねぎマルシェ

**Awaji Onion Marché — 南あわじの玉ねぎ農家から、畑直送で全国へ**

食べチョク / ポケットマルシェ型の **マルチ出品者マーケットプレイス**（販売手数料 10%）

[![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=fff)](https://tailwindcss.com)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=000)](https://orm.drizzle.team)
[![Neon](https://img.shields.io/badge/Neon-Postgres-00E599?logo=postgresql&logoColor=000)](https://neon.tech)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout_+_Connect-635BFF?logo=stripe&logoColor=fff)](https://stripe.com)
[![Vercel](https://img.shields.io/badge/Vercel-sin1-000?logo=vercel)](https://awaji-marche.vercel.app)
[![CI](https://github.com/bright-broom/online-march-/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)

<img src="docs/icons/muted/globe.svg" width="16" height="16" alt="" /> **本番**: https://awaji-marche.vercel.app &nbsp;·&nbsp; <img src="docs/icons/muted/clipboard-list.svg" width="16" height="16" alt="" /> **現況と引き継ぎ**: [`docs/STATUS.md`](docs/STATUS.md) &nbsp;·&nbsp; <img src="docs/icons/muted/bot.svg" width="16" height="16" alt="" /> **開発ガイド**: [`AGENTS.md`](AGENTS.md)

</div>

---

## <img src="docs/icons/accent/list.svg" width="22" height="22" alt="" /> 目次

- [全体像](#-全体像)
- [だれが何をできるか](#-だれが何をできるか)
- [アーキテクチャ](#-アーキテクチャ)
- [レイヤ構成とディレクトリ](#-レイヤ構成とディレクトリ)
- [購入フロー](#-購入フロー)
- [出荷と注文の状態](#-出荷と注文の状態)
- [お金の流れ](#-お金の流れ)
- [自動化（Cron）](#-自動化cron)
- [データモデル](#-データモデル)
- [守り（安全性と品質）](#-守り安全性と品質)
- [クイックスタート](#-クイックスタート)
- [スクリプト](#-スクリプト)
- [CI / デプロイ](#-ci--デプロイ)
- [ドキュメント](#-ドキュメント)

---

## <img src="docs/icons/accent/map.svg" width="22" height="22" alt="" /> 全体像

お客さまの **1回の決済** を、農家ごとの **出荷単位（`farm_orders`）** に分けます。各農家はそれぞれ出荷・精算します。運営は手数料を受け取り、月次でまとめて農家へ送金します。

```mermaid
flowchart LR
    C["お客さま"] -- "カート → 決済（1回）" --> P(("マルシェ<br/>（プラットフォーム）"))
    P -- "受注通知・出荷期限" --> F1["農家 A"]
    P -- "受注通知・出荷期限" --> F2["農家 B"]
    F1 -- "個別に発送" --> C
    F2 -- "個別に発送" --> C
    P -- "月次精算（手数料10%を差引）" --> F1
    P -- "月次精算" --> F2
    A["運営"] -. "審査・KPI・返金・自動化監視" .-> P
```

---

## <img src="docs/icons/accent/users.svg" width="22" height="22" alt="" /> だれが何をできるか

| | 利用者 | 主な機能 |
| :-: | --- | --- |
| <img src="docs/icons/muted/shopping-bag.svg" width="16" height="16" alt="" /> | **お客さま** `customer` | <img src="docs/icons/muted/search.svg" width="16" height="16" alt="" /> 商品検索・絞り込み ／ <img src="docs/icons/muted/store.svg" width="16" height="16" alt="" /> 農家ページ ／ <img src="docs/icons/muted/shopping-cart.svg" width="16" height="16" alt="" /> カート（農家別の送料と最短お届け日をその場で計算）／ <img src="docs/icons/muted/calendar.svg" width="16" height="16" alt="" /> お届け日時・のし指定 ／ <img src="docs/icons/muted/credit-card.svg" width="16" height="16" alt="" /> 決済（カード・PayPay・コンビニ払い・Apple Pay・Google Pay）／ <img src="docs/icons/muted/route.svg" width="16" height="16" alt="" /> 注文追跡タイムライン ／ <img src="docs/icons/muted/star.svg" width="16" height="16" alt="" /> レビュー ／ <img src="docs/icons/muted/heart.svg" width="16" height="16" alt="" /> お気に入り・フォロー ／ <img src="docs/icons/muted/message-circle.svg" width="16" height="16" alt="" /> 農家とのメッセージ ／ <img src="docs/icons/muted/receipt.svg" width="16" height="16" alt="" /> 領収書 ／ <img src="docs/icons/muted/log-out.svg" width="16" height="16" alt="" /> 退会（匿名化） |
| <img src="docs/icons/muted/tractor.svg" width="16" height="16" alt="" /> | **生産者** `farmer` | <img src="docs/icons/muted/trending-up.svg" width="16" height="16" alt="" /> 売上ダッシュボード ／ <img src="docs/icons/muted/sprout.svg" width="16" height="16" alt="" /> 商品登録（写真・規格・在庫）／ <img src="docs/icons/muted/inbox.svg" width="16" height="16" alt="" /> 受注管理 ／ <img src="docs/icons/muted/truck.svg" width="16" height="16" alt="" /> **出荷センター**（送り状CSV: B2クラウド・ゆうプリR・e飛伝、追跡番号の一括取込、納品書の印刷）／ <img src="docs/icons/muted/star.svg" width="16" height="16" alt="" /> レビュー返信 ／ <img src="docs/icons/muted/message-circle.svg" width="16" height="16" alt="" /> メッセージ ／ <img src="docs/icons/muted/landmark.svg" width="16" height="16" alt="" /> 精算・振込（Stripe Connect）／ <img src="docs/icons/muted/file-text.svg" width="16" height="16" alt="" /> 売上明細CSV ／ <img src="docs/icons/muted/palette.svg" width="16" height="16" alt="" /> ショップページ編集 ／ <img src="docs/icons/muted/circle-pause.svg" width="16" height="16" alt="" /> 受付の一時停止（お休み） |
| <img src="docs/icons/muted/user-cog.svg" width="16" height="16" alt="" /> | **運営** `admin` | <img src="docs/icons/muted/chart-column.svg" width="16" height="16" alt="" /> KPI・GMV・手数料分析 ／ <img src="docs/icons/muted/circle-check.svg" width="16" height="16" alt="" /> 出店審査 ／ <img src="docs/icons/muted/folders.svg" width="16" height="16" alt="" /> 商品・レビュー管理 ／ <img src="docs/icons/muted/undo-2.svg" width="16" height="16" alt="" /> 注文・返金 ／ <img src="docs/icons/muted/user.svg" width="16" height="16" alt="" /> ユーザー ／ <img src="docs/icons/muted/banknote.svg" width="16" height="16" alt="" /> 精算 ／ <img src="docs/icons/muted/ticket.svg" width="16" height="16" alt="" /> クーポン ／ <img src="docs/icons/muted/megaphone.svg" width="16" height="16" alt="" /> お知らせ ／ <img src="docs/icons/muted/bot.svg" width="16" height="16" alt="" /> **自動化の監視と手動実行** ／ <img src="docs/icons/muted/settings.svg" width="16" height="16" alt="" /> 手数料率 ／ <img src="docs/icons/muted/traffic-cone.svg" width="16" height="16" alt="" /> **本番公開チェック** |

> <img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> ロールは1ユーザーに1つです。出店は customer が `/join` から申請し、admin が承認すると `farmer` になります。

---

## <img src="docs/icons/accent/building-2.svg" width="22" height="22" alt="" /> アーキテクチャ

```mermaid
flowchart TB
    subgraph Client["ブラウザ"]
        UI["React 19 UI<br/>shadcn/ui · lucide"]
        Cart["カート<br/>zustand（localStorage）"]
    end

    subgraph Vercel["Vercel（Functions: sin1 シンガポール）"]
        CDN["Edge / CDN<br/>静的シェル（PPR）"]
        subgraph Next["Next.js 16 App Router · Cache Components"]
            RSC["Server Components"]
            SA["Server Actions<br/>'use server' · zod"]
            RH["Route Handlers<br/>/api/*"]
        end
        subgraph Server["src/server（server-only）"]
            Q["queries<br/>'use cache' + cacheTag"]
            ACT["actions"]
            SVC["services<br/>ドメインロジック＋外部アダプタ"]
            JOBS["jobs<br/>自動化"]
            AUTH["auth<br/>Better Auth · guards"]
        end
        CRON["Vercel Cron"]
    end

    subgraph Data["データ"]
        DB[("Neon Postgres<br/>ap-southeast-1")]
        PGL[("PGlite<br/>ローカル・テスト")]
        BLOB["Vercel Blob<br/>画像（公開）"]
        BAK["Vercel Blob<br/>バックアップ（非公開）"]
    end

    subgraph Ext["外部サービス"]
        STRIPE["Stripe<br/>Checkout + Connect v2"]
        RESEND["Resend"]
        CARRIER["配送業者<br/>CSV連携"]
    end

    UI --> CDN --> RSC
    UI --> SA
    Cart -. "確定時はサーバーで再計算" .-> SA
    RSC --> Q
    SA --> ACT --> SVC
    RH --> SVC
    CRON -- "Bearer CRON_SECRET" --> RH --> JOBS --> SVC
    Q --> DB
    SVC --> DB
    DB -. "ローカルでは置き換え" .- PGL
    SVC --> STRIPE
    SVC --> RESEND
    SVC --> BLOB
    SVC --> BAK
    SVC --> CARRIER
    STRIPE -- "Webhook" --> RH
```

### <img src="docs/icons/accent/route.svg" width="22" height="22" alt="" /> 設計判断（ADR の要約）

| # | 決定 | 理由 |
| :-: | --- | --- |
| 1 | <img src="docs/icons/muted/postgresql.svg" width="16" height="16" alt="" /> **Drizzle + Neon / PGlite** | サーバーレスに向いていて型安全。ローカルは Docker なしで動く |
| 2 | <img src="docs/icons/muted/key-round.svg" width="16" height="16" alt="" /> **Better Auth** | セルフホストでロールを拡張しやすく、Drizzle と直結でき、ベンダーロックがない |
| 3 | <img src="docs/icons/muted/credit-card.svg" width="16" height="16" alt="" /> **Separate charges & transfers** | 複数農家のカートを1回で決済し、月次まとめ送金で振込手数料を抑える |
| 4 | <img src="docs/icons/muted/package.svg" width="16" height="16" alt="" /> **1 farm_order = 1 出荷** | 農家ごとに別発送する産直の実態に合い、状態機械が単純になる |
| 5 | <img src="docs/icons/muted/shopping-cart.svg" width="16" height="16" alt="" /> **カートはクライアント側** | 匿名でも速い。確定はサーバーで再計算するので改ざんされても問題ない |
| 6 | <img src="docs/icons/muted/truck.svg" width="16" height="16" alt="" /> **配送は CSV 連携 + アダプタ** | 国内キャリアは小口向けの公開APIが少ない。API契約後は `tracking.ts` を差し替える |
| 7 | <img src="docs/icons/muted/zap.svg" width="16" height="16" alt="" /> **Cache Components** | 公開ページは静的シェルとタグ無効化で、速くて常に新しい |
| 8 | <img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> **PGlite の書き込みは1プロセスだけ** | 同時書き込みによる WAL 破損を実際に観測したため |
| 9 | <img src="docs/icons/muted/map-pin.svg" width="16" height="16" alt="" /> **関数リージョン = DBリージョン** | 1ページで十数クエリ走るので、エッジ近接より DB との往復削減が効く |

詳細 → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## <img src="docs/icons/accent/layers.svg" width="22" height="22" alt="" /> レイヤ構成とディレクトリ

依存は **一方向** です（逆向きは禁止）。`config` と `lib` はどこからでも import できます。

```mermaid
flowchart LR
    app["app<br/>ルーティングのみ"] --> components["components"]
    components --> queries["server/queries<br/>読み取り"]
    components --> actions["server/actions<br/>書き込み"]
    actions --> services["server/services"]
    queries --> db[("db")]
    services --> db
    config["config<br/>文言・金額・マスタ"] -.-> app & components & services
    lib["lib<br/>純粋関数"] -.-> components & services
```

```text
src/
├── app/                 ルーティング（薄く保つ）
│   ├── (shop)/             公開ストア  / products farms cart checkout about guide faq join legal
│   ├── (auth)/             login / signup
│   ├── mypage/             購入者
│   ├── farmer/             生産者
│   ├── admin/              運営
│   └── api/                auth · upload · webhooks/stripe · cron/[job] · farmer/{labels,sales}
├── config/              ★ 文言・金額・率・ナビ・配送設定の置き場（ハードコード禁止）
├── db/                  schema / client / seed
├── lib/                 純粋関数（format · dates · shipping計算 · env）
├── server/              サーバー専用
│   ├── auth/               Better Auth · requireRole / assertRole
│   ├── queries/            "use cache" + cacheTag
│   ├── actions/            "use server" · zod · 権限チェック · updateTag
│   ├── services/           orders · payouts · refunds · payments · shipping · email · backup …
│   └── jobs/               Cron ジョブ
├── components/          ui(shadcn) · common · charts · dashboard · layout · shop · farmer · admin …
└── stores/              zustand（カート）
```

### <img src="docs/icons/accent/ruler.svg" width="22" height="22" alt="" /> 絶対ルール

| | ルール |
| :-: | --- |
| <img src="docs/icons/muted/ban.svg" width="16" height="16" alt="" /> | **ハードコード禁止**。文言・金額・率・ステータス名は `src/config/*` から参照する |
| <img src="docs/icons/muted/database.svg" width="16" height="16" alt="" /> | **DB に触るのはサーバー層だけ**（`queries` / `actions`）。コンポーネントから `db` を import しない |
| <img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> | **認可は必ずサーバーで**行う（`src/server/auth/guards.ts`） |
| <img src="docs/icons/muted/zap.svg" width="16" height="16" alt="" /> | cookies / headers / `Date.now()` を読む部分は `<Suspense>` の中に置く |
| <img src="docs/icons/muted/banknote.svg" width="16" height="16" alt="" /> | 金額は **整数（円）**、率は **bps**、日時は `timestamptz` |
| <img src="docs/icons/muted/plug.svg" width="16" height="16" alt="" /> | 外部サービスは `services/*` のアダプタ経由で呼ぶ。キーが無ければ **デモモード** で動く |

---

## <img src="docs/icons/accent/shopping-cart.svg" width="22" height="22" alt="" /> 購入フロー

```mermaid
sequenceDiagram
    autonumber
    actor C as お客さま
    participant W as Next.js
    participant DB as Postgres
    participant S as Stripe
    participant F as 農家

    C->>W: /checkout を開く
    W->>DB: quoteCart（価格・在庫・送料・日程・クーポンを再計算）
    C->>W: 注文を確定（placeOrder）
    W->>DB: Tx: 在庫の条件付き減算 + orders / farm_orders / items
    W->>S: Checkout セッション作成
    C->>S: 支払い（カード / PayPay / コンビニ）
    alt 即時確定（カード・PayPay）
        S-->>W: checkout.session.completed（paid）
        W->>DB: markOrderPaid（冪等）
        W-->>F: 受注通知・出荷期限
    else 後日入金（コンビニ払い）
        S-->>W: completed（unpaid）
        W->>DB: recordAwaitingPayment（在庫だけ押さえる）
        W-->>C: 支払い番号と期限を案内
        S-->>W: async_payment_succeeded
        W->>DB: markOrderPaid
        W-->>F: 受注通知
    end
```

> <img src="docs/icons/muted/lightbulb.svg" width="16" height="16" alt="" /> 成功画面でもセッションを確認して `markOrderPaid` を呼びます（Webhook が遅れた場合の保険）。冪等なので二重に実行されても問題ありません。

---

## <img src="docs/icons/accent/package.svg" width="22" height="22" alt="" /> 出荷と注文の状態

### <img src="docs/icons/accent/truck.svg" width="22" height="22" alt="" /> 出荷センターの流れ

```mermaid
flowchart LR
    A["決済完了"] --> B["受注<br/>通知＋出荷期限"]
    B --> C["出荷準備中"]
    C --> D["送り状CSV<br/>B2 / ゆうプリR / e飛伝"]
    D --> E["発送<br/>追跡番号を登録"]
    E --> G["配達完了<br/>sync-tracking"]
    G --> H["レビュー依頼<br/>review-requests"]
    H --> I["月次精算<br/>close-payouts"]
```

### <img src="docs/icons/accent/refresh-cw.svg" width="22" height="22" alt="" /> `farm_orders.status` の状態機械

状態は必ず `services/orders.ts#transitionFarmOrder` で変更します（直接 UPDATE は禁止）。

```mermaid
stateDiagram-v2
    [*] --> pending_payment
    pending_payment --> paid: 入金
    pending_payment --> cancelled: 期限切れ
    paid --> preparing: 
    paid --> cancelled
    preparing --> shipped: 追跡番号必須
    preparing --> cancelled
    shipped --> delivered: 
    delivered --> refunded: 
    cancelled --> [*]: 在庫を戻す
    refunded --> [*]
    delivered --> [*]
```

### <img src="docs/icons/accent/ruler.svg" width="22" height="22" alt="" /> 送料とお届け日

| 計算 | 内容 |
| --- | --- |
| <img src="docs/icons/muted/package.svg" width="16" height="16" alt="" /> 箱数 | 重量合計から最大160サイズ（25kg）で箱数を決め、梱包 400g を足して収まる最小サイズを選ぶ |
| <img src="docs/icons/muted/map.svg" width="16" height="16" alt="" /> ゾーン | お届け先の都道府県を8ゾーンに分ける（発送元は兵庫） |
| <img src="docs/icons/muted/calculator.svg" width="16" height="16" alt="" /> 送料 | ゾーン×サイズの基準額 × キャリア係数 × 箱数。農家の送料無料ラインを超えれば 0 円 |
| <img src="docs/icons/muted/calendar.svg" width="16" height="16" alt="" /> 日程 | 今日 + リードタイムを出荷曜日に繰り上げ、+ 輸送日数。複数農家のカートは全員が間に合う日から選べる |

同じ関数をカートの目安表示（クライアント）と確定（サーバー）の両方で使います。詳細 → [`docs/SHIPPING.md`](docs/SHIPPING.md)

---

## <img src="docs/icons/accent/banknote.svg" width="22" height="22" alt="" /> お金の流れ

```mermaid
flowchart TB
    C["お客さま"] -- "Stripe Checkout（1回の決済）" --> PB["プラットフォーム残高"]
    PB --> SPLIT{"farm_orders ごとに計算"}
    SPLIT --> CALC["commission = floor(商品代金 × 10%)<br/>※送料には課金しない<br/><br/>payout = 商品代金 + 送料 − commission"]
    CALC --> CLOSE["close-payouts<br/>月末締め"]
    CLOSE -- "翌月15日 · Stripe Connect transfer" --> FARM["農家の口座"]
    CLOSE -. "Connect 未登録" .-> MANUAL["運営が手動で振込"]
    REF["締め後の返金"] -. "翌月の精算で自動相殺（clawback）" .-> CLOSE
```

| 項目 | 仕様 |
| --- | --- |
| <img src="docs/icons/muted/receipt.svg" width="16" height="16" alt="" /> 手数料率 | 農園ごとの率 → 運営の設定 → 既定 10% の順で決まる。**注文時点の率を固定保存** |
| <img src="docs/icons/muted/ticket.svg" width="16" height="16" alt="" /> クーポン | プラットフォーム負担（農家の受取額は減らない）。利用回数は注文作成時に条件付きで確保 |
| <img src="docs/icons/muted/landmark.svg" width="16" height="16" alt="" /> 最低振込額 | 1,000円（下回れば翌月へ繰り越し） |
| <img src="docs/icons/muted/credit-card.svg" width="16" height="16" alt="" /> 決済手段 | コードで固定せず、**Stripe ダッシュボードで有効化したものだけ** を表示（dynamic payment methods） |

詳細 → [`docs/PAYMENTS.md`](docs/PAYMENTS.md)

---

## <img src="docs/icons/accent/alarm-clock.svg" width="22" height="22" alt="" /> 自動化（Cron）

Vercel Cron が `/api/cron/[job]` を叩きます。どのジョブも冪等です。実行ログは `job_runs` に残り、`/admin/automation` で確認・手動実行できます。

| <img src="docs/icons/muted/clock.svg" width="16" height="16" alt="" /> JST | ジョブ | 内容 |
| :-: | --- | --- |
| 00:15 | <img src="docs/icons/muted/hourglass.svg" width="16" height="16" alt="" /> `cancel-unpaid` | 期限切れの未決済注文をキャンセルし、在庫とクーポンを戻す |
| 01:00 | <img src="docs/icons/muted/banknote.svg" width="16" height="16" alt="" /> `close-payouts` | 月初に前月分を締めて精算を作成し、15日以降に送金（失敗分は翌日に再試行） |
| 02:30 | <img src="docs/icons/muted/database.svg" width="16" height="16" alt="" /> `backup-db` | 全テーブルを JSON(gzip) で非公開 Blob に保存し、**読み戻して検証**。14日保持 |
| 06:00 | <img src="docs/icons/muted/house.svg" width="16" height="16" alt="" /> `sync-tracking` | 配達完了を自動で反映 |
| 08:00 | <img src="docs/icons/muted/bell.svg" width="16" height="16" alt="" /> `ship-reminders` | 出荷期限が近い未発送を農家に通知 |
| 10:00 | <img src="docs/icons/muted/star.svg" width="16" height="16" alt="" /> `review-requests` | 配達3日後にレビューを依頼 |

> <img src="docs/icons/muted/siren.svg" width="16" height="16" alt="" /> ジョブが失敗したとき、または30時間成功していないときは、**運営全員にアラート** が届きます（`services/ops-alerts.ts`）。

---

## <img src="docs/icons/accent/database.svg" width="22" height="22" alt="" /> データモデル

```mermaid
erDiagram
    user ||--o| farms : "owns"
    farms ||--o{ products : ""
    products ||--o{ product_variants : "規格・在庫"
    products ||--o{ product_images : ""
    user ||--o{ orders : "places"
    orders ||--|{ farm_orders : "農家ごとに分割"
    farms ||--o{ farm_orders : ""
    farm_orders ||--|{ order_items : "購入時スナップショット"
    farm_orders ||--o{ shipment_events : "追跡タイムライン"
    payouts ||--o{ farm_orders : "月次精算"
    farms ||--o{ payouts : ""
    user ||--o{ reviews : ""
    products ||--o{ reviews : ""
    user ||--o{ favorites : ""
    user ||--o{ farm_follows : ""
    farms ||--o{ messages : ""
    user ||--o{ notifications : ""
```

**その他**: `coupons` / `announcements` / `platform_settings` / `job_runs`（自動化ログ）

| 規約 | |
| --- | --- |
| <img src="docs/icons/muted/banknote.svg" width="16" height="16" alt="" /> 金額 | 整数（円） |
| <img src="docs/icons/muted/chart-column.svg" width="16" height="16" alt="" /> 率 | bps（1000 = 10%） |
| <img src="docs/icons/muted/scale.svg" width="16" height="16" alt="" /> 重量 | g |
| <img src="docs/icons/muted/calendar.svg" width="16" height="16" alt="" /> 業務日 | `date`（JST, `YYYY-MM-DD`） |
| <img src="docs/icons/muted/clock.svg" width="16" height="16" alt="" /> 時刻 | `timestamptz` |

詳細 → [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)

---

## <img src="docs/icons/accent/shield-check.svg" width="22" height="22" alt="" /> 守り（安全性と品質）

| | 守っていること | 仕組み | 回帰テスト |
| :-: | --- | --- | --- |
| <img src="docs/icons/muted/package.svg" width="16" height="16" alt="" /> | 在庫の売り越しを防ぐ | `stock >= 数量` の行だけを減らす条件付き更新 | `stock-race` |
| <img src="docs/icons/muted/ticket.svg" width="16" height="16" alt="" /> | クーポンの上限超えを防ぐ | 注文作成時に `used_count < max_uses` の行だけ +1 | `coupon-limit` |
| <img src="docs/icons/muted/undo-2.svg" width="16" height="16" alt="" /> | 返金の二重実行を防ぐ | 対象を先に確保してから Stripe を呼ぶ | `refund-race` |
| <img src="docs/icons/muted/receipt.svg" width="16" height="16" alt="" /> | コンビニ払いの期限切れ後に入金されない | 打ち切り前に PaymentIntent を cancel | `deferred-payment` · `cancel-unpaid-stripe` |
| <img src="docs/icons/muted/link.svg" width="16" height="16" alt="" /> | 決済から送金までのつなぎ目が壊れない | 注文 → Webhook → 出荷 → 配達 → 締め → 送金 を1本で通す | `golden-route` |
| <img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> | 他人のデータに触れない | 全 Action の認可テスト | `authorization` |
| <img src="docs/icons/muted/database.svg" width="16" height="16" alt="" /> | バックアップを本当に戻せる | 保存後に読み戻し、使い捨てブランチへの復元を検証 | `backup` · `restore` |
| <img src="docs/icons/muted/traffic-cone.svg" width="16" height="16" alt="" /> | 公開判断を誤らない | 「鍵があるか」ではなく「実際に動いているか」を判定 | `go-live` |

**<img src="docs/icons/muted/flask-conical.svg" width="16" height="16" alt="" /> テストの方針**: 守りを足したら、対象のコードを **わざと壊して、テストが赤くなることまで確認** します（[`docs/STATUS.md`](docs/STATUS.md) §4.2）。

**<img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> その他**: 本番 CSP · `X-Frame-Options: DENY` · 認証 API のレート制限 · ロール変更時にセッションを全破棄 · 退会は行を消さずに個人情報だけ匿名化。

---

## <img src="docs/icons/accent/rocket.svg" width="22" height="22" alt="" /> クイックスタート

```bash
npm install
npm run dev
```

<img src="docs/icons/muted/flask-conical.svg" width="16" height="16" alt="" /> **DB は自動** で用意されます（組込み Postgres = PGlite を `.data/pglite` に作成し、migrate と seed まで実行）。Docker は要りません。外部サービスのキーが無くても **デモモード** で動きます（<img src="docs/icons/muted/credit-card.svg" width="16" height="16" alt="" /> デモ決済 / <img src="docs/icons/muted/mail.svg" width="16" height="16" alt="" /> メールはログに出力）。

| デモアカウント | メール | パスワード |
| --- | --- | --- |
| <img src="docs/icons/muted/shopping-bag.svg" width="16" height="16" alt="" /> お客さま | `customer@demo.awaji` | `awaji-demo-2026` |
| <img src="docs/icons/muted/tractor.svg" width="16" height="16" alt="" /> 生産者 | `farmer@demo.awaji` | `awaji-demo-2026` |
| <img src="docs/icons/muted/user-cog.svg" width="16" height="16" alt="" /> 運営 | `admin@demo.awaji` | `awaji-demo-2026` |

> <img src="docs/icons/muted/triangle-alert.svg" width="16" height="16" alt="" /> Node 22 以上、**npm 11.6.2** を使ってください。npm 10 だと lockfile の表現が変わり、CI の `npm ci` が落ちます。依存を変更したら `npm run deps:verify` を実行します。

---

## <img src="docs/icons/accent/wrench.svg" width="22" height="22" alt="" /> スクリプト

| | Script | 内容 |
| :-: | --- | --- |
| <img src="docs/icons/muted/play.svg" width="16" height="16" alt="" /> | `npm run dev` | 開発サーバー（PGlite を自動起動） |
| <img src="docs/icons/muted/building-2.svg" width="16" height="16" alt="" /> | `npm run build` | migrate（`DATABASE_URL` があるとき）+ 本番ビルド |
| <img src="docs/icons/muted/flask-conical.svg" width="16" height="16" alt="" /> | `npm test` | Vitest（純関数と、PGlite を使う注文・返金・自動化ジョブの統合テスト） |
| <img src="docs/icons/muted/search.svg" width="16" height="16" alt="" /> | `npm run typecheck` / `lint` | 型チェック / Lint |
| <img src="docs/icons/muted/database.svg" width="16" height="16" alt="" /> | `npm run db:generate` / `db:migrate` / `db:seed` / `db:reset` | マイグレーション生成・適用 / シード |
| <img src="docs/icons/muted/history.svg" width="16" height="16" alt="" /> | `npm run db:restore` | バックアップから復元 |
| <img src="docs/icons/muted/eraser.svg" width="16" height="16" alt="" /> | `npm run demo:purge` | 本番公開前にデモデータを削除 |
| <img src="docs/icons/muted/crown.svg" width="16" height="16" alt="" /> | `npm run admin:promote <メール>` | 運営アカウントに昇格（**デモ削除より先に**） |
| <img src="docs/icons/muted/package.svg" width="16" height="16" alt="" /> | `npm run deps:verify` | CI と同じ npm で lockfile を検証 |

---

## <img src="docs/icons/accent/git-branch.svg" width="22" height="22" alt="" /> CI / デプロイ

```mermaid
flowchart LR
    DEV["ローカル<br/>typecheck · lint · test"] --> MIG["スキーマ変更時は<br/>本番DBへ先に migrate"]
    MIG --> PUSH["push to main"]
    PUSH --> CI["GitHub Actions<br/>typecheck · lint · test<br/>migration 整合 · build"]
    PUSH --> VC["Vercel<br/>自動デプロイ"]
    VC --> CHECK["本番URLで実際に確認"]
    CHECK --> CLEAN["テストデータを削除"]
```

| 環境 | |
| --- | --- |
| <img src="docs/icons/muted/globe.svg" width="16" height="16" alt="" /> URL | https://awaji-marche.vercel.app |
| <img src="docs/icons/muted/vercel.svg" width="16" height="16" alt="" /> Hosting | Vercel（Functions `sin1`） |
| <img src="docs/icons/muted/postgresql.svg" width="16" height="16" alt="" /> DB | Neon Postgres `ap-southeast-1`（関数と同じリージョン） |
| <img src="docs/icons/muted/image.svg" width="16" height="16" alt="" /> 画像 / <img src="docs/icons/muted/lock.svg" width="16" height="16" alt="" /> バックアップ | Vercel Blob（公開ストア / 非公開ストア） |

<img src="docs/icons/muted/traffic-cone.svg" width="16" height="16" alt="" /> **公開できる状態かは `/admin/settings` →「本番公開チェック」が判定します。** Stripe 本番キー・デモモード・運営アカウント・特商法表記・バックアップ・自動処理の稼働をまとめて確認できます。準備中は `robots.txt` が自動で `Disallow: /` を返します。

環境変数と手順 → [`docs/DEPLOY.md`](docs/DEPLOY.md) ／ 残りのオーナー作業 → [`docs/STATUS.md`](docs/STATUS.md)

---

## <img src="docs/icons/accent/book-open.svg" width="22" height="22" alt="" /> ドキュメント

| | Doc | 内容 |
| :-: | --- | --- |
| <img src="docs/icons/muted/clipboard-list.svg" width="16" height="16" alt="" /> | [`STATUS.md`](docs/STATUS.md) | **いまどこまで出来ていて、次に何をするか**（引き継ぎはまずここ） |
| <img src="docs/icons/muted/building-2.svg" width="16" height="16" alt="" /> | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 全体構成・ディレクトリ・レイヤ責務・ADR |
| <img src="docs/icons/muted/palette.svg" width="16" height="16" alt="" /> | [`DESIGN.md`](docs/DESIGN.md) | UI・デザイントークン・コピーのトーン |
| <img src="docs/icons/muted/database.svg" width="16" height="16" alt="" /> | [`DATA_MODEL.md`](docs/DATA_MODEL.md) | テーブル・型・状態遷移 |
| <img src="docs/icons/muted/truck.svg" width="16" height="16" alt="" /> | [`SHIPPING.md`](docs/SHIPPING.md) | 送料計算・出荷自動化・Cron |
| <img src="docs/icons/muted/credit-card.svg" width="16" height="16" alt="" /> | [`PAYMENTS.md`](docs/PAYMENTS.md) | 決済・手数料・精算・返金 |
| <img src="docs/icons/muted/zap.svg" width="16" height="16" alt="" /> | [`PERFORMANCE.md`](docs/PERFORMANCE.md) | キャッシュ・遅延読込・Cache Components の規約 |
| <img src="docs/icons/muted/ruler.svg" width="16" height="16" alt="" /> | [`CONVENTIONS.md`](docs/CONVENTIONS.md) | コーディング規約・命名・Server Action の型 |
| <img src="docs/icons/muted/rocket.svg" width="16" height="16" alt="" /> | [`DEPLOY.md`](docs/DEPLOY.md) | ローカル起動・Vercel デプロイ・環境変数 |
| <img src="docs/icons/muted/bot.svg" width="16" height="16" alt="" /> | [`AGENTS.md`](AGENTS.md) | AI エージェント／開発者向けの入口 |

<div align="center">

---

<img src="docs/icons/muted/sprout.svg" width="16" height="16" alt="" /> **Made with love on Awaji Island** <img src="docs/icons/muted/waves.svg" width="16" height="16" alt="" />

</div>
