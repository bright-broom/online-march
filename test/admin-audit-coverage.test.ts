import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 運営の操作記録（#19）の漏れ検出。運営だけが使う Server Action（`assertRole("admin")` で始まるもの）は、どのファイルにあっても
 * 何かを変える操作なので、すべて recordAudit を呼ぶこと。新しい操作を足して記録を忘れると、ここで落ちる。
 * （#21 で reviews.ts#setReviewPublished が admin-*.ts の外にあって漏れていたので、ファイル名ではなく中身で探す）
 */
const dir = path.resolve(__dirname, "../src/server/actions");
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

/** export async function ごとに本文を切り出す（次の export か末尾まで） */
function actionsOf(source: string) {
  const parts = source.split(/^export async function /m).slice(1);
  return parts.map((body) => ({ name: body.slice(0, body.indexOf("(")), body }));
}

const adminActions = files.flatMap((file) =>
  actionsOf(readFileSync(path.join(dir, file), "utf8"))
    .filter(({ body }) => /assertRole\("admin"\)/.test(body))
    .map((a) => ({ file, ...a })),
);

describe("運営の操作記録の漏れ", () => {
  it("運営だけが使う Server Action を見つけられている（前提）", () => {
    expect(adminActions.length).toBeGreaterThanOrEqual(20);
    expect(adminActions.map((a) => a.name)).toContain("setReviewPublished");
  });

  for (const { file, name, body } of adminActions) {
    it(`${file}#${name} は操作を記録する`, () => {
      expect(body).toMatch(/\brecordAudit\(/);
    });
  }
});
