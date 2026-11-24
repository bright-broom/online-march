/**
 * 生産者ダッシュボードの「販売を始めるまでのチェック」（承認直後の農園向け）。
 * 全部そろうと表示しない。判定は server/queries/farmer.ts#getFarmSetup。
 */
export const farmSetupCopy = {
  title: "販売を始めるまで",
  description: "承認おめでとうございます。次の3つがそろうと、お客さまが買えて、売上も受け取れます。",
  steps: {
    product: {
      label: "商品を登録して「販売中」にする",
      hint: "写真・規格（重さ）・価格・在庫を入れて、公開設定を「販売中」にします",
      cta: "商品を登録",
    },
    payout: {
      label: "売上の受け取り先を登録する",
      hint: "振込先口座（またはオンライン決済の登録）がないと、売上をお支払いできません",
      cta: "受け取り先を登録",
    },
    shop: {
      label: "ショップページに写真を入れる",
      hint: "アイコンと表紙の写真があると、農園ページと商品カードがぐっと伝わりやすくなります",
      cta: "ショップページを編集",
    },
  },
  done: "済み",
} as const;
export type FarmSetupStep = keyof typeof farmSetupCopy.steps;
