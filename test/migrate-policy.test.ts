import { describe, expect, it } from "vitest";
import { migrateDecision } from "../scripts/migrate-policy";

const url = "postgres://example";

describe("ビルド時のマイグレーション", () => {
  it("Vercel の Preview ビルドでは、DATABASE_URL があっても当てない", () => {
    expect(migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "preview" })).toMatchObject({ run: false });
    expect(migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "development" })).toMatchObject({ run: false });
  });

  it("本番ビルドでは当てる", () => {
    expect(migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "production" })).toEqual({ run: true });
  });

  it("手元や CI から明示的に実行したときは当てる", () => {
    expect(migrateDecision({ DATABASE_URL: url })).toEqual({ run: true });
  });

  it("DATABASE_URL が無ければ当てない（PGlite が自分で当てる）", () => {
    expect(migrateDecision({ VERCEL_ENV: "production" })).toMatchObject({ run: false });
  });
});
