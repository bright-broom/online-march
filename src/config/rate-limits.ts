/**
 * アプリ側の回数制限（#21）。ログイン・登録・パスワード再設定などの認証まわりは Better Auth 側（server/auth/auth.ts）。
 * ここはそれ以外で、連打や総当たりの的になるもの。数字は「ふつうに使う人には当たらない」ことを優先している。
 * windowSec の間に max 回まで。数えるのは本人（ユーザーID）単位。
 */
export const rateLimits = {
  /** 画像アップロード（商品写真・農園写真・アイコン）。1回の商品登録で数枚上げる前提 */
  upload: { windowSec: 60 * 60, max: 60, message: "画像のアップロードが多すぎます。1時間ほどおいてから再度お試しください。" },
  /** メッセージの送信 */
  message: { windowSec: 10 * 60, max: 30, message: "メッセージの送信が多すぎます。少し時間をおいてから送ってください。" },
  /** レビューの投稿・編集 */
  review: { windowSec: 60 * 60, max: 10, message: "レビューの投稿・編集が多すぎます。1時間ほどおいてから再度お試しください。" },
  /** 使えないクーポンコードの入力（コードの総当たり対策。正しいコードの再計算は数えない） */
  couponMiss: { windowSec: 60 * 60, max: 10, message: "クーポンコードの入力が多すぎます。1時間ほどおいてから再度お試しください。" },
} as const;

export type RateLimitName = keyof typeof rateLimits;
