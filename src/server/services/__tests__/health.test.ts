import { describe, expect, it } from "vitest";
import { checkHealth } from "../health";

describe("稼働確認（/api/health）", () => {
  it("最初のリクエストだけをコールドスタートとして数え、DB の往復時間を返す", async () => {
    const first = await checkHealth();
    expect(first).toMatchObject({ ok: true, coldStart: true });
    expect(first.dbMs).toBeGreaterThanOrEqual(0);
    expect(first.processAgeMs).toBeGreaterThan(0);

    const second = await checkHealth();
    expect(second.coldStart).toBe(false);
    expect(second.processAgeMs).toBeGreaterThanOrEqual(first.processAgeMs);
  });
});
