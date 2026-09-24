import { beforeEach, describe, expect, it, vi } from "vitest";

/** redirect() は Next では例外で処理を止める。テストでも同じく throw して行き先を確かめる */
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

type U = { id: string; name: string; email: string; image: null; role: "customer" | "farmer" | "admin"; twoFactorEnabled: boolean };
let current: U | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => current }));

const { requireRole, requireUser } = await import("../guards");
const owner = (twoFactorEnabled: boolean): U => ({ id: "u1", name: "運営", email: "owner@awaji-marche.jp", image: null, role: "admin", twoFactorEnabled });

beforeEach(() => {
  redirect.mockClear();
});

describe("運営画面のページガード", () => {
  it("二段階認証を設定していない運営は、設定画面へ送る（戻り先つき）", async () => {
    current = owner(false);
    await expect(requireRole("admin", "/admin/orders")).rejects.toThrow("REDIRECT:/two-factor/setup?next=%2Fadmin%2Forders");
  });

  it("設定済みの運営はそのまま入れる", async () => {
    current = owner(true);
    await expect(requireRole("admin", "/admin")).resolves.toMatchObject({ role: "admin" });
  });

  it("デモの運営アカウントと、ほかのロールは対象外", async () => {
    current = { ...owner(false), email: "admin@demo.awaji" };
    await expect(requireUser("/admin")).resolves.toMatchObject({ role: "admin" });
    current = { ...owner(false), role: "customer" };
    await expect(requireUser("/mypage")).resolves.toMatchObject({ role: "customer" });
  });
});
