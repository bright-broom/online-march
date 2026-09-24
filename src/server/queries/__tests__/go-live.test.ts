import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

/** 決済手段のチェックは Stripe に問い合わせる。テストでは答えを固定する */
const fetchEnabledPaymentMethods = vi.fn(async () => [
  { id: "card", enabled: true },
  { id: "apple_pay", enabled: true },
  { id: "google_pay", enabled: true },
  { id: "paypay", enabled: true },
  { id: "konbini", enabled: true },
]);
vi.mock("@/server/services/payments/stripe", () => ({ fetchEnabledPaymentMethods }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { jobs } = await import("@/server/jobs");

const load = async () => {
  vi.resetModules();
  return (await import("../go-live")).getGoLiveChecks();
};

/** 自動処理が「動いている」状態にする（チェックは実行記録を見るため） */
const recordJobRuns = async (startedAt = new Date()) => {
  await db.delete(s.jobRuns);
  await db.insert(s.jobRuns).values(
    Object.keys(jobs).map((job) => ({ job, status: "success" as const, trigger: "cron" as const, startedAt, finishedAt: startedAt })),
  );
};
const stateOf = (checks: Awaited<ReturnType<typeof load>>, key: string) => checks.find((c) => c.key === key)!;

const liveEnv = {
  STRIPE_SECRET_KEY: "sk_live_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_a",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b",
  STRIPE_ACCOUNTS_WEBHOOK_SECRET: "whsec_c",
  DEMO_MODE: "false",
  BETTER_AUTH_SECRET: "a-production-secret-value",
  CRON_SECRET: "cron-secret",
  RESEND_API_KEY: "re_dummy",
  EMAIL_FROM: "マルシェ <noreply@awaji-marche.jp>",
  BLOB_READ_WRITE_TOKEN: "blob_dummy",
  BACKUP_BLOB_READ_WRITE_TOKEN: "blob_backup_dummy",
  NEXT_PUBLIC_SITE_URL: "https://awaji-marche.vercel.app",
  BETTER_AUTH_URL: "https://awaji-marche.vercel.app",
};

describe("go-live checks", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    fetchEnabledPaymentMethods.mockClear();
    await db.delete(s.jobRuns);
  });

  it("blocks launch while the app runs on demo defaults", async () => {
    const checks = await load();
    expect(stateOf(checks, "stripe-key").state).toBe("blocker");
    expect(stateOf(checks, "demo-mode").state).toBe("blocker");
    expect(stateOf(checks, "auth-secret").state).toBe("blocker");
    expect(stateOf(checks, "cron").state).toBe("blocker");
    expect(stateOf(checks, "legal").state).toBe("blocker"); // src/config/site.ts still has placeholders
    expect(stateOf(checks, "legal-docs").state).toBe("blocker"); // terms / privacy are still drafts
    expect(stateOf(checks, "email").state).toBe("blocker"); // password reset only works by email
  });

  it("clears once live keys and secrets are configured", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    await recordJobRuns();
    const checks = await load();
    for (const key of ["stripe-key", "stripe-webhooks", "demo-mode", "auth-secret", "cron", "email", "blob", "backups", "site-url"]) {
      expect(stateOf(checks, key).state, key).toBe("ready");
    }
    // the seeded demo rows are still in the database — flagged, but not a blocker once they cannot sign in
    expect(stateOf(checks, "demo-accounts").state).toBe("warning");
    expect(stateOf(checks, "demo-accounts").detail).toContain("demo.awaji");
  });

  it("warns when the Accounts v2 destination is missing, and blocks on an example sender domain", async () => {
    for (const [k, v] of Object.entries({ ...liveEnv, STRIPE_ACCOUNTS_WEBHOOK_SECRET: "", EMAIL_FROM: "マルシェ <noreply@example.com>" })) vi.stubEnv(k, v);
    const checks = await load();
    expect(stateOf(checks, "stripe-webhooks").state).toBe("warning");
    expect(stateOf(checks, "email").state).toBe("blocker"); // Resend will not send from an unverified domain
  });

  it("treats a test-mode Stripe key as a blocker", async () => {
    for (const [k, v] of Object.entries({ ...liveEnv, STRIPE_SECRET_KEY: "sk_test_dummy" })) vi.stubEnv(k, v);
    const checks = await load();
    expect(stateOf(checks, "stripe-key").state).toBe("blocker");
    expect(stateOf(checks, "stripe-key").detail).toContain("テストキー");
  });

  it("案内している決済手段が Stripe 側で無効なら警告する", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    fetchEnabledPaymentMethods.mockResolvedValueOnce([
      { id: "card", enabled: true },
      { id: "paypay", enabled: false }, // ダッシュボードで未有効化
      { id: "konbini", enabled: false },
    ]);

    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("warning");
    expect(check.detail).toContain("PayPay");
    expect(check.detail).toContain("コンビニ払い");
  });

  it("すべて有効なら準備完了として扱う", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);

    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("ready");
    expect(check.detail).toContain("PayPay");
  });

  it("Stripe が未設定なら決済手段は確認できないとだけ伝える", async () => {
    const check = stateOf(await load(), "payment-methods");

    expect(check.state).toBe("warning");
    expect(fetchEnabledPaymentMethods).not.toHaveBeenCalled();
  });

  it("鍵があっても自動処理が動いていなければ警告する", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);

    const checks = await load(); // 実行記録なし

    expect(stateOf(checks, "cron").state).toBe("warning");
    expect(stateOf(checks, "cron").detail).toContain("実行記録なし");
  });

  it("バックアップが48時間以上取れていなければ公開を止める", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    await recordJobRuns(new Date(Date.now() - 3 * 86_400_000));

    const checks = await load();

    expect(stateOf(checks, "backups").state).toBe("blocker"); // トークンだけでは「取れている」と言えない
    expect(stateOf(checks, "backups").detail).toContain("48時間以上前");
  });

  it("デモ以外の運営アカウントが居なければ公開を止める", async () => {
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    await recordJobRuns();

    const before = stateOf(await load(), "admin-account");
    const id = "user_golive_admin";
    await db.insert(s.user).values({ id, name: "運営", email: "ops@awaji-marche.jp", role: "admin" });
    const after = stateOf(await load(), "admin-account");
    await db.delete(s.user).where(eq(s.user.id, id));

    expect(before.state).toBe("blocker"); // 種データの運営はデモアカウントだけ
    expect(after.state).toBe("ready");
    expect(after.detail).toContain("ops@awaji-marche.jp");
  });

  it("サイトURLが本番のものでなければ公開を止める", async () => {
    for (const [k, v] of Object.entries({ ...liveEnv, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })) vi.stubEnv(k, v);
    await recordJobRuns();

    const check = stateOf(await load(), "site-url");

    expect(check.state).toBe("blocker");
    expect(check.detail).toContain("localhost");
  });

  it("準備中は検索避けにしていることを伝える", async () => {
    const preparing = stateOf(await load(), "search-index");
    for (const [k, v] of Object.entries(liveEnv)) vi.stubEnv(k, v);
    const live = stateOf(await load(), "search-index");

    expect(preparing.detail).toContain("noindex");
    expect(live.detail).toContain("公開しています");
  });
});

describe("利用規約・プライバシーポリシーのチェック", () => {
  const doc = (text: string) => ({ updatedAt: "2026-09-24", intro: "前文", sections: [{ heading: "第1条", body: [text] }] });

  it("下書き表示が残っていれば公開できない", async () => {
    const { checkLegalDocs } = await import("../go-live");
    expect(checkLegalDocs(true, { terms: doc("本文") })).toMatchObject({ state: "blocker", detail: expect.stringContaining("下書き") });
  });

  it("下書き表示を外しても【要確認】が残っていれば公開できない", async () => {
    const { checkLegalDocs } = await import("../go-live");
    const r = checkLegalDocs(false, { terms: doc("再配送料は購入者の負担とします。【要確認】"), privacy: doc("本文") });
    expect(r).toMatchObject({ state: "blocker", detail: expect.stringContaining("1か所") });
  });

  it("下書き表示も【要確認】も無くなれば公開できる", async () => {
    const { checkLegalDocs } = await import("../go-live");
    expect(checkLegalDocs(false, { terms: doc("本文"), privacy: doc("本文") }).state).toBe("ready");
  });
});
