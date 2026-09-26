import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 運営の操作記録（#19）の漏れ検出。運営の Server Action（src/server/actions/admin-*.ts）は、どれも運営が何かを変える操作なので、
 * すべて recordAudit を呼ぶこと。新しい操作を足して記録を忘れると、ここで落ちる。
 */
const dir = path.resolve(__dirname, "../src/server/actions");
const files = readdirSync(dir).filter((f) => /^admin-.*\.ts$/.test(f));

/** export async function ごとに本文を切り出す（次の export か末尾まで） */
function actionsOf(source: string) {
  const parts = source.split(/^export async function /m).slice(1);
  return parts.map((body) => ({ name: body.slice(0, body.indexOf("(")), body }));
}

describe("運営の操作記録の漏れ", () => {
  it("運営の Server Action のファイルがある", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of files) {
    for (const { name, body } of actionsOf(readFileSync(path.join(dir, file), "utf8"))) {
      it(`${file}#${name} は操作を記録する`, () => {
        expect(body).toMatch(/\brecordAudit\(/);
      });
    }
  }
});
