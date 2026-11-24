import "server-only";
import { prefectures, type Prefecture } from "@/config/shipping";

/**
 * 郵便番号から住所（都道府県・市区町村・町域）を引く。日本郵便のデータを公開している zipcloud の API を使う。
 * 入力を助けるためだけのもので、引けなくても注文はできる（失敗・時間切れは null。画面は何もしない）。
 * 同じ番号はサーバーの中で覚えておき、何度も問い合わせない。
 */
export type PostalAddress = { prefecture: Prefecture; city: string; town: string };

const endpoint = "https://zipcloud.ibsnet.co.jp/api/search";
const timeoutMs = 3000;
const cache = new Map<string, PostalAddress | null>();
const cacheLimit = 2000;

type ZipcloudResponse = { status: number; results: { address1: string; address2: string; address3: string }[] | null };

export function normalizePostalCode(input: string): string | null {
  const digits = input.normalize("NFKC").replace(/[\s-ー－]/g, "");
  return /^\d{7}$/.test(digits) ? digits : null;
}

export async function lookupPostalCode(code: string, fetchImpl: typeof fetch = fetch): Promise<PostalAddress | null> {
  const zip = normalizePostalCode(code);
  if (!zip) return null;
  if (cache.has(zip)) return cache.get(zip)!;
  let found: PostalAddress | null = null;
  try {
    const res = await fetchImpl(`${endpoint}?zipcode=${zip}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null; // 一時的な失敗は覚えない
    const body = (await res.json()) as ZipcloudResponse;
    const r = body.results?.[0];
    if (r && (prefectures as readonly string[]).includes(r.address1)) {
      found = { prefecture: r.address1 as Prefecture, city: r.address2, town: r.address3 };
    }
  } catch {
    return null;
  }
  if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
  cache.set(zip, found);
  return found;
}
