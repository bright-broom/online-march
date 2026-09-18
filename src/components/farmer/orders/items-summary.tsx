/** "玉ねぎ 5kg ×2 ほか1点" style compact summary. */
export function itemsSummaryText(items: { name: string; label: string; qty: number }[]) {
  if (!items.length) return "—";
  const [first, ...rest] = items;
  return `${first.name}（${first.label}）×${first.qty}${rest.length ? ` ほか${rest.length}点` : ""}`;
}
