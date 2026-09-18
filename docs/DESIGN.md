# DESIGN — あわじ玉ねぎマルシェ デザインシステム

## 1. コンセプト

**「畑の手ざわりと、編集された上質さ」** — 産直らしい温かさ（生成りの紙・土・潮風）を、
雑誌のようなエディトリアルなレイアウトと余白で上品にまとめる。写真が主役、UI は控えめ。

キーワード: 余白 / 明朝の見出し / 大きな写真 / 金色（玉ねぎの皮）/ 瀬戸内の藍 / 手書き感は使わない

## 2. トークン（src/app/globals.css）

| Token | 用途 | 値の意図 |
| --- | --- | --- |
| `background` | ページ地 | 生成りの紙（warm paper） |
| `primary` | CTA・強調・リンク | 玉ねぎの皮の金茶 |
| `sea` / `sea-foreground` | 帯・フッター・特集の反転面 | 瀬戸内の藍 |
| `leaf` | 新玉・在庫あり・成功の差し色 | 葉の緑 |
| `onion-red` | 紫玉ねぎ・セール | 赤紫 |
| `paper` / `gold-soft` | セクション背景・ハイライト | 紙の濃淡 |
| `chart-1..5` | グラフ系列（金・緑・藍・赤紫・砂）| 必ずこの順で使う |

**生の色コード・Tailwind のパレット色（amber-500 等）をコンポーネントに書かない。** 例外: `config/status.ts` の toneClasses のみ。
ダークモードは全トークン対応済み（`.dark`）。

## 3. タイポグラフィ

| 役割 | フォント | クラス |
| --- | --- | --- |
| 本文・UI | Noto Sans JP | `font-sans`（既定）|
| 見出し | Shippori Mincho | `heading-display` / `font-serif` |
| 英字アイブロウ・数字 | Fraunces | `eyebrow` / `num` / `font-display` |

- 見出しサイズ: Hero `text-4xl sm:text-5xl lg:text-6xl` / Section `text-2xl sm:text-3xl lg:text-4xl` / Card `text-base`
- 本文 `leading-relaxed`、行長は `max-w-prose` 程度。金額は必ず `<Price>` か `num` クラス。

## 4. レイアウト

- コンテナ: `container-page`（max-w-7xl + 余白）。セクション縦余白 `py-16 sm:py-24`。
- 角丸: カード `rounded-2xl`、画像 `rounded-2xl`〜`rounded-3xl`、ボタンは既定（shadcn）/ CTA は `rounded-full`。
- 影は最小限（`shadow-sm` まで）。区切りは余白と `border` で。
- グリッド: 商品 `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8`。モバイルでも2列（産直ECの定石）。
- ダッシュボード: `DashboardShell` + `PageHeader` + KPI（`StatCard` 4列）+ Card 内のグラフ/表。

## 5. コンポーネント規約

- プリミティブは **shadcn/ui のみ**（`src/components/ui`）。アイコンは **lucide-react のみ**。
- 状態表示は `<StatusBadge kind status />`、空状態は `<EmptyState />`、金額 `<Price />`、評価 `<RatingStars />`。
- グラフは `@/components/charts` から（lazy）。系列色は `ChartColor` トークン名で指定。
- フォーム: shadcn `Field*` 系 + Server Action + `useActionState`、送信は `<SubmitButton>`、結果は `sonner` の toast。
- 画像: `next/image`（`sizes` 必須）。ファーストビューのみ `priority`/`preload`、他は既定の lazy。
- モーション: `animate-fade-up`、hover で画像 `scale-[1.03]`（`duration-700`）。`motion` ライブラリは Hero 等の限定用途。
  `prefers-reduced-motion` を尊重（`motion-safe:` 接頭辞）。

## 6. Voice & Tone（文言）

- 飾らない・あたたかい・誠実。農家さんは「生産者」「農家さん」、お客さまは「お客さま」。
- 誇張表現（「最高」「No.1」）を避け、事実（品種・栽培方法・収穫日）で語る。
- エラーは原因と次の行動を1文で（例:「在庫が不足しています。数量を減らしてください」）。
- 文言の置き場: 共通・マーケ文言は `config/content.ts`、ラベル類は各 config。ページ固有の短い説明のみ JSX 可。

## 7. アクセシビリティ

- コントラスト AA 以上（トークンで担保）。フォーカスリングは shadcn 既定を消さない。
- アイコンのみのボタンは `aria-label`。画像 `alt` は商品名/内容。
- タップ領域 44px 以上（モバイルの数量ステッパー等）。
