import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** next.config は評価時の DATABASE_URL で本番（Neon）かローカル（PGlite）かを決める */
async function loadConfig(databaseUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", databaseUrl ?? "");
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  return (await import("../next.config")).default;
}

const pgliteDist = path.resolve(__dirname, "../node_modules/@electric-sql/pglite/dist");
/** PGlite が `new URL("./x", import.meta.url)` で参照していて、ファイルトレースが関数に同梱してしまうもの */
const referencedAssets = [
  ...new Set(
    readdirSync(pgliteDist)
      .filter((f) => f.endsWith(".js"))
      .flatMap((f) => [...readFileSync(path.join(pgliteDist, f), "utf8").matchAll(/new URL\("\.?\/?([^"]+)",\s*import\.meta\.url\)/g)].map((m) => m[1])),
  ),
];

/** Next がトレース除外の判定に使うのと同じ picomatch（型定義は同梱されていない） */
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  globs: string[],
  options: { contains: boolean; dot: boolean },
) => (pathname: string) => boolean;

afterEach(() => vi.unstubAllEnvs());

describe("本番関数に PGlite のバイナリを同梱しない", () => {
  it("PGlite が参照しているバイナリを検出できている（前提）", () => {
    expect(referencedAssets).toEqual(expect.arrayContaining(["pglite.wasm", "pglite.data", "initdb.wasm"]));
  });

  it("本番ビルド（DATABASE_URL あり）では参照されているバイナリをすべて除外する", async () => {
    const config = await loadConfig("postgres://example");
    const globs = config.outputFileTracingExcludes?.["*"] ?? [];
    // Next と同じ matcher・同じオプション（collect-build-traces.js）で、トレース上のパスに当てる
    const isExcluded = picomatch(globs, { contains: true, dot: true });
    for (const asset of referencedAssets) {
      expect(isExcluded(`../../../node_modules/@electric-sql/pglite/dist/${asset}`), asset).toBe(true);
    }
    // JS は残す（db/client.ts が静的に import している）
    expect(isExcluded("../../../node_modules/@electric-sql/pglite/dist/index.js")).toBe(false);
  });

  it("ローカル / CI（DATABASE_URL なし）では除外しない（PGlite を実際に使う）", async () => {
    const config = await loadConfig(undefined);
    expect(config.outputFileTracingExcludes).toBeUndefined();
  });
});
