import { roleHome } from "@/config/nav";

/** Only allow same-origin relative paths for ?next= (blocks open redirects like //evil.com or /\evil.com). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\r\n\t]/.test(next)) return null;
  return next;
}

export function homeForRole(role: unknown): string {
  return typeof role === "string" && role in roleHome ? roleHome[role as keyof typeof roleHome] : roleHome.customer;
}

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;

/** Better Auth error → Japanese, actionable message. */
export function authErrorMessage(error: AuthError, fallback = "うまくいきませんでした。時間をおいて再度お試しください。") {
  if (!error) return fallback;
  if (error.status === 429) return "試行回数が多すぎます。しばらく待ってから再度お試しください。";
  // our own hooks answer in Japanese already (e.g. デモアカウントのメールアドレスは変更できません)
  if (error.status === 403 && error.message && /[ぁ-んァ-ン一-龥]/.test(error.message)) return error.message;
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "このメールアドレスはすでに登録されています。ログインしてください。";
    case "PASSWORD_TOO_SHORT":
      return "パスワードは8文字以上で設定してください。";
    case "PASSWORD_TOO_LONG":
      return "パスワードが長すぎます。";
    case "INVALID_EMAIL":
      return "メールアドレスの形式が正しくありません。";
    case "INVALID_PASSWORD":
      return "現在のパスワードが正しくありません。";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "このリンクは有効期限が切れているか、すでに使われています。もう一度お手続きください。";
    case "EMAIL_NOT_VERIFIED":
      return "メールアドレスの確認が完了していません。";
    default:
      return fallback;
  }
}
