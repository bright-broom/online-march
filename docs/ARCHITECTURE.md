# ARCHITECTURE

## 1. システム概要

```
Browser ──► Vercel Edge/CDN (static shell, PPR) ──► Next.js 16 App Router (Node, Fluid compute)
                                                     ├─ Server Components  → server/queries (use cache + cacheTag)
                                                     ├─ Server Actions     → server/actions → server/services
                                                     ├─ Route Handlers     → /api/auth, /api/upload, /api/webhooks/stripe, /api/cron/[job]
                                                     └─ Drizzle ORM ──► Postgres (Neon) | PGlite (local)
External: Stripe (Checkout + Connect) / Resend / Vercel Blob / Vercel Cron / 配送業者CSV
```

マルチテナント型マーケットプレイス：**1 注文 (orders) = 1 決済**、農家ごとに **farm_orders** へ分割し、
各農家が独立して出荷・精算する（食べチョク / ポケマル と同じモデル）。

## 2. ディレクトリとレイヤ責務

```
src/
  app/                      ルーティングのみ。薄く保つ（データ取得は queries、UI は components）
    (shop)/                 公開ストア: / products farms cart checkout about guide faq join legal
    (auth)/                 login / signup
    mypage/                 購入者（customer）
    farmer/                 生産者（farmer）
    admin/                  運営（admin）
    api/                    auth / upload / webhooks/stripe / cron/[job]
  config/                   ★ 中央集権の設定・文言・マスタ（UI から直接 import 可, 純データ）
  db/                       schema/ client.ts seed/
  lib/                      純粋関数（format, dates, shipping計算, ids, cache-tags, env[server]）
  server/                   サーバー専用（"server-only"）
    auth/                   better-auth 設定, getSessionUser, guards
    queries/                読み取り（"use cache" + cacheTag + cacheLife）
    actions/                書き込み（"use server"）→ services を呼ぶ
    services/               ドメインロジック & 外部アダプタ（orders, notify, email, payments, shipping, storage）
    jobs/                   自動化ジョブ（cron）
  components/
    ui/                     shadcn/ui（生成物。原則編集しない。例外: chart.tsx valueFormatter）
    common/                 ブランド共通部品（StatusBadge, Price, RatingStars, Icon, Logo, EmptyState…）
    charts/                 Recharts ラッパ（index.tsx から lazy import のみ）
    dashboard/              PageHeader, StatCard, DataTable
    layout/                 DashboardShell, AppSidebar, UserMenu, Theme…, SiteHeader/Footer
    shop/ mypage/ farmer/ admin/   領域別コンポーネント
  stores/                   zustand（cart）
  hooks/
```

依存の向き（逆流禁止）: `app → components → (server/queries | server/actions) → server/services → db`。
`config` と `lib`（env 除く）はどこからでも import 可。`components/*` は `db` を import しない。

## 3. 認証・認可

- Better Auth（email+password, DB セッション, **cookieCache 無効** — ロール変更・失効を即時反映。権限を下げた時は全セッション破棄）。`user.role` = customer | farmer | admin。
- ページ: `requireUser / requireRole / requireFarm`（redirect）。Action: `assertUser / assertRole / assertFarm`（ActionError）。
- **運営は二段階認証（TOTP）が必須**: `guards.ts#needsTwoFactorSetup`。未設定の運営は `requireUser` が `/two-factor/setup` へ送り、
  `assertUser` が Action を拒否する（土台の2関数で止めるので、運営向けのページ・Action はすべて対象）。デモアカウントは対象外。
  2FA を設定したアカウントはパスワードの後に `/two-factor` で6桁コード（またはバックアップコード）を入れる。
  端末をなくした運営は `npm run admin:reset-2fa -- --email …`（本人確認を別手段で取ってから）。
- 農家は `farms.ownerId` で 1:1。farmer 画面の全クエリは **必ず farm.id でスコープ**。
- 出店申請: customer が /join から申請 → farms.status=pending → admin 承認で status=active & user.role=farmer。

## 4. エリア別レイアウトパターン（Cache Components 対応）

```tsx
// app/farmer/layout.tsx
export default function Layout({ children }: LayoutProps<"/farmer">) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
async function Shell({ children }: { children: React.ReactNode }) {
  const { user, farm } = await requireFarm();
  return <DashboardShell area="farmer" user={user} context={farm.name} farmId={farm.id}>{children}</DashboardShell>;
}
```

各ページも `requireFarm()` を呼んでよい（React `cache()` で重複排除）。各セグメントに `loading.tsx`。

## 5. ルート一覧

| Area | Routes |
| --- | --- |
| shop | `/` `/products` `/products/[slug]` `/farms` `/farms/[slug]` `/cart` `/checkout` `/checkout/success` `/about` `/guide` `/faq` `/join` `/legal/[doc]` |
| auth | `/login` `/signup` `/two-factor` `/two-factor/setup` `/forgot-password` `/reset-password`（パスワード再設定。メールのリンクは `/api/auth/reset-password/:token` を経由して `?token=` 付きで戻る）。メールアドレスの確認・変更（#16）はメールのリンクが `/api/auth/verify-email?token=` を経由してアカウント設定（`/mypage/settings` / `/farmer/account`）に `?email=done`、失敗時は `?error=` 付きで戻る。変更は新しいアドレスでリンクを開いたときに行われ、確認前でもログインはできる。デモアカウントは変更不可 |
| mypage | `/mypage` `orders` `orders/[id]` `orders/[id]/receipt` `favorites` `addresses` `reviews` `messages` `notifications` `settings`（退会もここ） |
| farmer | `/farmer` `products` `products/new` `products/[id]` `orders` `orders/[id]` `orders/[id]/slip` `shipping` `reviews` `messages` `payouts` `shop` `settings`（お休み設定もここ） `account` |
| admin | `/admin` `farms` `farms/[id]` `products` `orders` `orders/[id]` `users` `payouts` `coupons` `announcements` `automation` `settings` |
| api | `/api/auth/[...all]` `/api/upload` `/api/cron/[job]` `/api/webhooks/stripe` `/api/webhooks/stripe/accounts`（v2 thin） `/api/farmer/stripe-return` `/api/farmer/labels`（送り状CSV） `/api/farmer/sales`（売上明細CSV） |

パスは必ず `routes`（config/nav.ts）から生成する。

## 6. 主要フロー

**購入**: カート(localStorage) → `/checkout`（サーバーで `quoteCart` 再計算: 価格・在庫・送料・日程・クーポン）
→ `placeOrder` action → `createOrder`（Tx: 在庫の条件付き減算 + orders/farm_orders/items）
→ Stripe Checkout（or デモ決済）→ webhook / success で `markOrderPaid`（冪等）→ 通知・メール。

**出荷**: 農家「出荷センター」で 送り状CSV出力 → ラベル発行 → 追跡番号 一括取込 → `transitionFarmOrder(shipped)`
→ 顧客へ発送メール → cron `sync-tracking` が配達完了化 → cron `review-requests`。

**精算**: cron `close-payouts`（毎日）が月初に前月の配達完了分を締め payouts 作成 → 15日以降の実行で Stripe Connect transfer（`services/payouts.ts`）。

## 7. 設計判断（ADR 要約）

| # | 決定 | 理由 |
| --- | --- | --- |
| 1 | Drizzle + Neon / PGlite | サーバーレス最適・型安全・ローカルはゼロ設定（Docker不要） |
| 2 | Better Auth | セルフホストでロール拡張容易、Drizzle 直結、ベンダーロックなし |
| 3 | Separate charges & transfers | 複数農家カートを1決済で。月次まとめ送金で振込手数料を抑制 |
| 4 | 1 farm_order = 1 shipment | 産直の実態（農家ごと別発送）に一致し、状態機械が単純 |
| 5 | カートは client store | 匿名で即時・高速。確定はサーバー再計算で改ざん耐性 |
| 6 | 配送は CSV 連携 + アダプタ | 国内キャリアは小口向け公開APIが乏しい。API契約時は tracking.ts を差替 |
| 7 | Cache Components | 公開ページは静的シェル + タグ無効化で高速・常に新鮮 |
| 8 | PGlite は単一書き込みプロセス | `.data/pglite.owner` を O_EXCL で取得したメインプロセスのみがファイルDBを開く。Next の子ワーカー（JEST_WORKER_ID / IS_NEXT_WORKER）とビルドはメモリDB。所有者が死んでいればロックを引き継ぐ（強制終了からの自動復旧）。同時書き込みによる WAL 破損を実際に観測したため |
| 9 | 関数リージョン = DBリージョン | 1ページで十数クエリ走るため、関数とDBの往復を最小化する方がエッジ近接より効く。静的シェルは CDN から配信 |
| 10 | 本番関数に PGlite のバイナリを入れない（2026-09-24） | コールドスタートの実測で、遅いのは DB でなく関数の起動（5〜6s）だった。PGlite の wasm/data（約17MB）がファイルトレースで全関数に同梱されていたのを、本番ビルドだけ除外（`next.config.ts`）。放置後の初回 5.9〜6.5s → 1.76s。計測は `/api/health`（`docs/PERFORMANCE.md` §4） |
| 11 | ビルド時のマイグレーションは本番だけ（2026-09-24） | Preview に本番の `DATABASE_URL` があると、ブランチの push で本番のスキーマが変わる。`scripts/migrate-policy.ts` が `VERCEL_ENV=production` 以外では当てない。その代わりスキーマ変更は「足すだけ」に限る（§4.1） |
| 12 | 返金は `refundOrder` の一本道（2026-09-24） | 生産者のキャンセルが返金されず、お客さまのキャンセルは返金日を記録していなかった。経路ごとに書くと守り（二重返金の防止・記録・メール）が漏れるため、3経路とも同じ関数を通す（`docs/PAYMENTS.md`） |
| 13 | 運営は二段階認証（TOTP）必須（2026-09-25） | 運営画面は返金・手数料率・全顧客の個人情報を扱う。止める場所は土台のガード（`requireUser` / `assertUser`）にして、個別のページや Action の書き忘れで抜けないようにした。デモアカウントは対象外。やり直しは `npm run admin:reset-2fa` |
| 14 | 在庫の編集は差分で反映（2026-09-25） | フォームの値で上書きすると、編集中に売れた分が戻って売り越す。開いた時点の在庫との差分だけを足す（入荷の実態とも一致）。行ロックや楽観ロックより単純で、編集を拒否しなくて済む |
| 15 | 1回だけ起きるべき処理は「空の列を埋める条件付き更新」で確定（2026-09-24〜25） | 返金（`refunded_at`）・新商品のお知らせ（`published_at`）・クーポン利用数と同じ型。同時押しや再実行でも、更新できた1回だけが副作用（通知・メール・Stripe）を起こす |
