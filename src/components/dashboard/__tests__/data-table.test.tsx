import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "../data-table";

/**
 * スマホでの一覧（2026-09-26）: 生産者は畑でスマホから受注・商品を見る。横長の表だと状態・出荷期限・金額が画面の外に切れて
 * 見えなかったので、`mobileCard` を渡した一覧は md 未満でカード、md 以上で表を出す（CSS で出し分け。検索・ページ送りは同じ行）。
 */
type Row = { id: string; name: string; amount: number };
const rows: Row[] = [
  { id: "a", name: "伊藤 翔太", amount: 3280 },
  { id: "b", name: "中村 大輔", amount: 6260 },
];
const columns = [{ id: "name", accessorFn: (r: Row) => r.name, header: "お名前" }];
const render = (props: Partial<Parameters<typeof DataTable<Row>>[0]>) =>
  renderToStaticMarkup(createElement(DataTable<Row>, { columns, data: rows, getRowId: (r: Row) => r.id, ...props }));

describe("一覧のスマホ表示", () => {
  it("mobileCard を渡すと、狭い画面ではカード（行ごとに詳細へのリンク）、広い画面では表", () => {
    const html = render({ mobileCard: (r) => `${r.name}｜${r.amount}円`, mobileHref: (r) => `/farmer/orders/${r.id}` });
    const list = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
    expect(list).toContain("md:hidden");
    expect(list).toContain('href="/farmer/orders/a"');
    expect(list).toContain("中村 大輔｜6260円");
    expect(html).toMatch(/class="[^"]*hidden md:block[^"]*"><div[^>]*><table/);
  });

  it("行が無いときはカードの一覧にも「該当なし」を出す", () => {
    const html = render({ data: [], emptyText: "該当する注文はありません", mobileCard: (r) => r.name });
    const list = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
    expect(list).toContain("該当する注文はありません");
  });

  it("mobileCard を渡さない一覧はこれまでどおり表だけ（どの幅でも出る）", () => {
    const html = render({});
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("hidden md:block");
  });
});
