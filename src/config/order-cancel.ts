/**
 * お客さまのキャンセル（#18）。オーナーの決定（Issue #18 のコメント）:
 * - 生産者が出荷準備を始める前（新規受注）なら、お客さまがマイページから取り消せる。複数の農家の注文は農家ごと（送料を含めてその農家の分を返金）
 * - 出荷準備中になった後は「キャンセルの依頼」。生産者が承認すると全額返金、断るとそのまま発送
 * - 猶予は設けない（「準備を始める」を押した時点で締め切り）
 * 規約・ご利用ガイド・最終確認画面の文言は config/content.ts の `cancellationPolicy` と利用規約 第6条。
 */
export const orderCancelPolicy = {
  reasonMaxLength: 500,
  replyMaxLength: 500,
} as const;

export const orderCancelCopy = {
  /** マイページ（お客さま） */
  customer: {
    cancelFarmOrder: "この生産者の分をキャンセル",
    cancelFarmOrderTitle: "この生産者の分をキャンセルしますか？",
    cancelFarmOrderBody: "この生産者の商品と送料を全額返金します。ほかの生産者の商品はそのままお届けします。",
    cancelFarmOrderDone: "キャンセルしました。返金の手続きを行いました",
    request: "キャンセルを依頼",
    requestTitle: "キャンセルを依頼しますか？",
    requestBody: "生産者がすでに収穫・箱詰めを始めています。生産者が承認するとキャンセルになり、全額を返金します。お断りの場合はそのままお届けします。依頼できるのは1回だけです。",
    requestReasonLabel: "キャンセルしたい理由",
    requestDone: "キャンセルを依頼しました。生産者からの回答をお待ちください",
    pending: "キャンセルを依頼中です。生産者からの回答をお待ちください",
    declined: "キャンセルの依頼はお断りされました。このままお届けします",
    preparingNote: "出荷準備が始まっているため、キャンセルは生産者への依頼になります",
  },
  /** 生産者の画面 */
  farmer: {
    requestTitle: "お客さまからキャンセルの依頼が届いています",
    requestHint: "承認すると全額を返金して在庫を戻します。お断りする場合はそのまま発送してください。回答するまで発送済みにはできません。",
    approve: "承認して返金する",
    approveConfirm: "この注文をキャンセルし、お客さまへ全額を返金します。取り消せません。",
    approveDone: "キャンセルを承認し、お客さまへ返金しました",
    decline: "お断りする",
    declineReplyLabel: "お客さまへのひとこと（任意）",
    declineDone: "キャンセルの依頼をお断りしました。お客さまにお知らせしました",
    viewOnly: "回答できるのはオーナーと「すべて」の権限のスタッフです",
    answered: { approved: "承認して返金しました", declined: "お断りしました" },
    startPreparingNote: "「準備を始める」を押すと、お客さまはご自身でキャンセルできなくなり、キャンセルは依頼（あなたの承認）に変わります。",
    listBadge: "キャンセル依頼",
  },
  /** お知らせの文面 */
  notice: {
    requestedFarmer: "キャンセルの依頼が届きました",
    declinedCustomer: "キャンセルの依頼はお断りされました",
  },
} as const;
