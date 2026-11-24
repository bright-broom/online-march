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
    return /\.(tsx|ts|css)$/.test(name) ? [p] : [];
  });
}

const files = walk(path.join(root, "src")).map((p) => ({ file: path.relative(root, p), text: readFileSync(p, "utf8") }));

/** 矢印に意味がある場所（外部リンク・増減・並べ替え・行全体がリンクの一覧） */
const arrowAllowed = new Set([
  "src/components/common/image-uploader.tsx",
]);

/** 入力の段階を切り替えるときだけ、ブロック全体を1回フェードインさせてよい（D-07） */
const fadeAllowed = new Set([
  "src/app/globals.css",
  "src/components/checkout/address-step.tsx",
  "src/components/checkout/gift-step.tsx",
]);

/** shadcn/ui の部品（ダイアログ等の暗幕）は対象外。お客さまの文章を入れた見本データも対象外 */
const isUiKit = (f: string) => f.startsWith("src/components/ui/");
const isSeed = (f: string) => f.startsWith("src/db/seed/");

const rules: { id: string; what: string; test: (file: string, text: string) => boolean }[] = [
  { id: "D-01", what: "英字の小見出し（.eyebrow）", test: (_f, t) => /\.eyebrow\b|className="[^"]*\beyebrow\b/.test(t) },
  { id: "D-04", what: "ボタン・リンク末尾の飾りの矢印（<ArrowRight />）", test: (f, t) => !arrowAllowed.has(f) && /<ArrowRight\b/.test(t) },
  { id: "D-05", what: "飾りの光の玉（blur-3xl / blur-2xl）", test: (_f, t) => /\bblur-(2xl|3xl)\b/.test(t) },
  { id: "D-05", what: "放射グラデーションの背景模様", test: (f, t) => f.endsWith(".css") && /radial-gradient\(/.test(t) },
  { id: "D-06", what: "英字の飾り書体 Fraunces", test: (_f, t) => /\bFraunces\b|--font-fraunces/.test(t) },
  { id: "D-06", what: "字間を大きく空けた英字（tracking-[0.2em 以上] + uppercase）", test: (_f, t) => /tracking-\[0\.[2-9]\d*em\][^"]*\buppercase\b|\buppercase\b[^"]*tracking-\[0\.[2-9]\d*em\]/.test(t) },
  { id: "D-05", what: "すりガラス（backdrop-blur）", test: (f, t) => !isUiKit(f) && /\bbackdrop-blur/.test(t) },
  { id: "D-07", what: "ページや要素ごとのフェードイン（animate-fade-up）", test: (f, t) => !fadeAllowed.has(f) && /\banimate-fade-up\b/.test(t) },
  { id: "D-09", what: "ホバーで写真やロゴを拡大・回転させる動き", test: (f, t) => !isUiKit(f) && /\b(group-)?hover:(scale|rotate)-/.test(t) },
  { id: "D-10", what: "AI を思わせるきらきらのアイコン（Sparkles）", test: (_f, t) => /\bSparkles\b/.test(t) },
  { id: "D-08", what: "「〜しましょう」の呼びかけ", test: (f, t) => !isSeed(f) && /しましょう/.test(t) },
];

describe("作り物っぽさを避ける決まり（docs/DESIGN.md §8）", () => {
  for (const rule of rules) {
    it(`${rule.id}: ${rule.what} を使っていない`, () => {
      const hits = files.filter(({ file, text }) => rule.test(file, text)).map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
