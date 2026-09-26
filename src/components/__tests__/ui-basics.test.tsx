import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * 画面の基本（#21）: 生産者画面の noindex、管理画面のスキップリンク、エリア別のエラー画面、ホーム画面・PWA 用のアイコン。
 */
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn(), useRouter: () => ({}), usePathname: () => "/" }));

describe("検索エンジンに出さない画面", () => {
  it("生産者・運営・マイページの管理画面は noindex", async () => {
    for (const area of ["farmer", "admin", "mypage"] as const) {
      const { metadata } = await import(`@/app/${area}/layout`);
      expect(metadata.robots, area).toMatchObject({ index: false });
    }
  });
});

describe("エリア別のエラー画面", () => {
  const error = Object.assign(new Error("boom"), { digest: "abc123" });
  it.each([
    ["admin", "/admin"],
    ["farmer", "/farmer"],
    ["mypage", "/mypage"],
  ])("%s: エリアのトップへ戻れて、エラーIDが出る", async (area, home) => {
    const { default: AreaErrorPage } = await import(`@/app/${area}/error`);
    const html = renderToStaticMarkup(createElement(AreaErrorPage, { error, retry: () => {} }));
    expect(html).toContain(`href="${home}"`);
    expect(html).toContain("abc123");
    expect(html).toContain('role="alert"');
  });
});

describe("管理画面のスキップリンク", () => {
  it("サイドバーより前に「本文へスキップ」があり、本文の入れ物を指す", () => {
    const src = readFileSync(path.resolve(__dirname, "../layout/dashboard-shell.tsx"), "utf8");
    const link = src.indexOf('href="#main-content"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(src.indexOf("<AppSidebar"));
    expect(src).toContain('id="main-content"');
  });
});

describe("ホーム画面・PWA 用のアイコン", () => {
  it("manifest に 192px と 512px（maskable を含む）があり、その URL が PNG を返す", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);

    for (const px of [192, 512]) {
      const { GET } = await import(`@/app/icons/${px}/route`);
      const res: Response = await GET();
      expect(res.headers.get("content-type")).toContain("image/png");
      const png = new Uint8Array(await res.arrayBuffer());
      // PNG の IHDR から幅と高さ
      const view = new DataView(png.buffer);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([px, px]);
    }
  });

  it("Apple のホーム画面用は 180px", async () => {
    const { size, contentType } = await import("@/app/apple-icon");
    expect(size).toEqual({ width: 180, height: 180 });
    expect(contentType).toBe("image/png");
  });
});
