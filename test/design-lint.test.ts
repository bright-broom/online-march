import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/DESIGN.md §8「作り物っぽさを避ける決まり」のうち、機械で見分けられるものを CI で止める。
 * 新しい画面を足したときに定番の飾りが戻ってこないようにするため。
 */
const root = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.(tsx|css)$/.test(name) ? [p] : [];
  });
}

const files = walk(path.join(root, "src")).map((p) => ({ file: path.relative(root, p), text: readFileSync(p, "utf8") }));

/** 矢印に意味がある場所（外部リンク・増減・並べ替え・行全体がリンクの一覧） */
const arrowAllowed = new Set([
  "src/components/common/image-uploader.tsx",
  "src/components/farmer/overview/todo-cards.tsx",
]);

const rules: { id: string; what: string; test: (file: string, text: string) => boolean }[] = [
  { id: "D-01", what: "英字の小見出し（.eyebrow）", test: (_f, t) => /\.eyebrow\b|className="[^"]*\beyebrow\b/.test(t) },
  { id: "D-04", what: "ボタン・リンク末尾の飾りの矢印（<ArrowRight />）", test: (f, t) => !arrowAllowed.has(f) && /<ArrowRight\b/.test(t) },
  { id: "D-05", what: "飾りの光の玉（blur-3xl / blur-2xl）", test: (_f, t) => /\bblur-(2xl|3xl)\b/.test(t) },
  { id: "D-05", what: "放射グラデーションの背景模様", test: (f, t) => f.endsWith(".css") && /radial-gradient\(/.test(t) },
  { id: "D-06", what: "英字の飾り書体 Fraunces", test: (_f, t) => /\bFraunces\b|--font-fraunces/.test(t) },
  { id: "D-06", what: "字間を大きく空けた英字（tracking-[0.2em 以上] + uppercase）", test: (_f, t) => /tracking-\[0\.[2-9]\d*em\][^"]*\buppercase\b|\buppercase\b[^"]*tracking-\[0\.[2-9]\d*em\]/.test(t) },
];

describe("作り物っぽさを避ける決まり（docs/DESIGN.md §8）", () => {
  for (const rule of rules) {
    it(`${rule.id}: ${rule.what} を使っていない`, () => {
      const hits = files.filter(({ file, text }) => rule.test(file, text)).map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
