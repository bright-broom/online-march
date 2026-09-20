/** Demo accounts created by the seed. Shown on /login only when features.demo is true. */
export const demoPassword = "awaji-demo-2026";
/** Seeded accounts all live on this domain, so they can be spotted (and blocked) without a list lookup. */
export const demoEmailDomain = "demo.awaji";
export const isDemoEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${demoEmailDomain}`);

export const demoAccounts = [
  { role: "customer", email: "customer@demo.awaji", name: "山田 花子", label: "購入者" },
  { role: "farmer", email: "farmer@demo.awaji", name: "阿波 太一", label: "生産者（実家の畑）" },
  { role: "admin", email: "admin@demo.awaji", name: "運営 管理者", label: "運営管理者" },
] as const;
