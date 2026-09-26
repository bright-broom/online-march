/**
 * 運営の操作記録（#19）に残す操作。運営が行う「変更」の Server Action（actions/admin-*.ts）はすべてどれかを記録する
 * （test/admin-audit-coverage.test.ts が漏れを検出する）。ラベルは /admin/audit に出す。
 */
export const auditActions = {
  "order.refund": "返金",
  "order.status": "注文ステータスの変更",
  "payout.mark_paid": "振込済みにする",
  "platform.commission": "標準手数料率の変更",
  "platform.maintenance": "メンテナンスモード",
  "job.run": "自動処理の手動実行",
  "farm.status": "生産者の承認・却下・停止・再開",
  "farm.commission": "生産者の手数料率",
  "farm.featured": "おすすめ生産者",
  "farm.bank_account_reveal": "振込先口座番号の表示",
  "product.featured": "おすすめ商品",
  "product.archived": "商品の非公開",
  "user.role": "ロールの変更",
  "coupon.save": "クーポンの作成・編集",
  "coupon.active": "クーポンの有効・無効",
  "coupon.delete": "クーポンの削除",
  "announcement.save": "お知らせの作成・編集",
  "announcement.published": "お知らせの公開・非公開",
  "announcement.delete": "お知らせの削除",
} as const;

export type AuditAction = keyof typeof auditActions;
