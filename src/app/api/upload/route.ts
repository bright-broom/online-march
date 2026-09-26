import { NextResponse } from "next/server";
import { rateLimits } from "@/config/rate-limits";
import { getSessionUser } from "@/server/auth/session";
import { needsTwoFactorSetup } from "@/server/auth/guards";
import { consumeRateLimit } from "@/server/services/rate-limit";
import { storeImage, uploadFolderFor } from "@/server/services/storage";

/** POST multipart {file, folder} → {url}. 生産者・運営だけが、許可されたフォルダにだけ置ける（services/storage.ts#uploadFolders）。 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (needsTwoFactorSetup(user)) return NextResponse.json({ error: "二段階認証の設定が必要です" }, { status: 403 });
  if (!(await consumeRateLimit("upload", user.id))) return NextResponse.json({ error: rateLimits.upload.message }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  const folder = uploadFolderFor(user.role, form.get("folder") ?? "products");
  if (!folder) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  try {
    const url = await storeImage(file, folder);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "アップロードに失敗しました" }, { status: 400 });
  }
}
