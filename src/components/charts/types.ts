/** Serializable chart props (Server → Client). Colors reference CSS tokens: "chart-1".."chart-5" | "primary" | "sea" | "leaf" | "onion-red". */
export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "primary" | "sea" | "leaf" | "onion-red";
export type ValueFormat = "yen" | "number" | "compactYen" | "percent";
export type Series = { key: string; label: string; color: ChartColor };
export type Datum = Record<string, string | number | null>;

export const colorVar = (c: ChartColor) => `var(--${c})`;
