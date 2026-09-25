import { beforeEach, describe, expect, it, vi } from "vitest";

// ローカル保存（public/uploads）に実際には書かない
const writeFile = vi.fn(async () => {});
vi.mock("node:fs/promises", () => ({ writeFile, mkdir: vi.fn(async () => {}) }));

type U = { id: string; name: string; email: string; image: null; role: "customer" | "farmer" | "admin"; twoFactorEnabled: boolean };
let current: U | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => current }));

const { sniffImageType, uploadFolderFor } = await import("../storage");
const { POST } = await import("@/app/api/upload/route");

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const WEBP = [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")];
const AVIF = [0, 0, 0, 0x1c, ...ascii("ftyp"), ...ascii("avif")];
const HTML = ascii("<html><script>alert(1)</script>");

const user = (role: U["role"], email = `${role}@awaji-marche.jp`): U => ({ id: "u1", name: "n", email, image: null, role, twoFactorEnabled: true });
function upload(bytes: number[], folder: string, claimedType = "image/png") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "x.png", { type: claimedType }));
  form.set("folder", folder);
  return POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
}

beforeEach(() => writeFile.mockClear());

describe("画像の形式判定（中身の先頭バイト）", () => {
  it("JPEG / PNG / WebP / AVIF を見分け、それ以外は受け付けない", () => {
    expect(sniffImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(sniffImageType(new Uint8Array(WEBP))).toBe("image/webp");
    expect(sniffImageType(new Uint8Array(AVIF))).toBe("image/avif");
    expect(sniffImageType(new Uint8Array(HTML))).toBeNull();
  });
});

describe("アップロード先の許可", () => {
  it("生産者・運営は products と farms に置ける", () => {
    expect(uploadFolderFor("farmer", "products")).toBe("products");
    expect(uploadFolderFor("admin", "farms")).toBe("farms");
  });
  it("お客さまはどこにも置けない。許可リストに無いフォルダ・パスは拒否", () => {
    expect(uploadFolderFor("customer", "farms")).toBeNull();
    expect(uploadFolderFor("customer", "products")).toBeNull();
    expect(uploadFolderFor("farmer", "reviews")).toBeNull();
    expect(uploadFolderFor("farmer", "../../etc")).toBeNull();
    expect(uploadFolderFor("farmer", "toString")).toBeNull(); // プロトタイプのキーで通らない
  });
});

describe("POST /api/upload", () => {
  it("生産者の本物の画像は保存される（保存名の拡張子は中身から決める）", async () => {
    current = user("farmer");
    const res = await upload(JPEG, "products", "image/png");
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^\/uploads\/products\/[a-z0-9]+-[a-z0-9]+\.jpg$/);
  });

  it("画像と偽った別の中身は拒否（ブラウザ申告の形式は信用しない）", async () => {
    current = user("farmer");
    const res = await upload(HTML, "products", "image/png");
    expect(res.status).toBe(400);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("お客さまと、フォルダを書き換えた要求は 403", async () => {
    current = user("customer");
    expect((await upload(PNG, "farms")).status).toBe(403);
    current = user("farmer");
    expect((await upload(PNG, "../../public")).status).toBe(403);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("未ログインは 401、二段階認証を設定していない運営は 403", async () => {
    current = null;
    expect((await upload(PNG, "products")).status).toBe(401);
    current = { ...user("admin"), twoFactorEnabled: false };
    expect((await upload(PNG, "products")).status).toBe(403);
  });
});
