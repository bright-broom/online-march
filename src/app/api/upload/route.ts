import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { storeImage } from "@/server/services/storage";

/** POST multipart {file, folder} → {url}. Farmers/admins only (customers for review photos). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "products") as "products" | "farms" | "reviews";
  if (!(file instanceof File)) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  if (folder === "products" && user.role === "customer") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const url = await storeImage(file, folder);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "アップロードに失敗しました" }, { status: 400 });
  }
}
