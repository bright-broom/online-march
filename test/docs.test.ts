import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ドキュメントは引き継ぎの入口（docs/STATUS.md）。リンク切れ・画像切れ・目次のずれは
 * 誰も気づかないまま腐るので、CI で落とす。
 */
const root = path.resolve(__dirname, "..");
const docs = ["README.md", "AGENTS.md", ...readdirSync(path.join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];

/** コードブロックの中はリンクではないので除く */
function stripCode(md: string) {
  return md.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
}

function targets(md: string) {
  const body = stripCode(md);
  const links = [...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const imgs = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  return { links, imgs };
}

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

/** GitHub の見出しアンカーと同じ規則: タグを除き、小文字化し、文字・数字・空白・ハイフン以外を消して空白をハイフンに */
function githubSlug(heading: string) {
  return heading
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(md: string) {
  return new Set(
    stripCode(md)
      .split("\n")
      .filter((l) => /^#{1,6} /.test(l))
      .map((l) => githubSlug(l.replace(/^#{1,6} /, ""))),
  );
}

describe("ドキュメント", () => {
  it.each(docs)("%s のリンク先と画像がリポジトリ内に存在する", (file) => {
    const md = readFileSync(path.join(root, file), "utf8");
    const { links, imgs } = targets(md);
    const missing = [...links, ...imgs]
      .filter((href) => !isExternal(href) && !href.startsWith("#"))
      .map((href) => decodeURIComponent(href.split("#")[0]))
      .filter((rel) => !existsSync(path.join(root, path.dirname(file), rel)));
    expect(missing).toEqual([]);
  });

  it.each(docs)("%s のページ内リンクが見出しを指している", (file) => {
    const md = readFileSync(path.join(root, file), "utf8");
    const known = anchors(md);
    const broken = targets(md)
      .links.filter((href) => href.startsWith("#"))
      .filter((href) => !known.has(decodeURIComponent(href.slice(1))));
    expect(broken).toEqual([]);
  });

  it.each(docs)("%s のアイコン画像は外部サービスに依存しない", (file) => {
    const md = readFileSync(path.join(root, file), "utf8");
    expect(targets(md).imgs.filter(isExternal)).toEqual([]);
  });

  it("見出しアンカーの規則が GitHub と一致する", () => {
    // 実際の GitHub 上の id（2026-09-23 に README で確認）
    expect(githubSlug('<img src="docs/icons/accent/map.svg" alt="" /> 全体像')).toBe("-全体像");
    expect(githubSlug("設計判断（ADR の要約）")).toBe("設計判断adr-の要約");
    expect(githubSlug('<img src="x.svg" /> CI / デプロイ')).toBe("-ci--デプロイ");
  });
});
