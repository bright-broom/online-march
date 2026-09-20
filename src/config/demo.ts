/** Demo accounts created by the seed. Shown on /login only when features.demo is true. */
export const demoPassword = "awaji-demo-2026";
/**
 * Domains that can only ever hold seeded accounts: the demo logins plus the RFC 2606 documentation
 * domains the seeded customers use. Nobody real can receive mail at these, so they are safe to block
 * after go-live and safe to delete when the demo data is purged.
 */
export const demoEmailDomain = "demo.awaji";
export const demoEmailDomains = [demoEmailDomain, "example.jp", "example.com", "example.org", "example.net"] as const;
export const isDemoEmail = (email: string) => {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  return at !== -1 && demoEmailDomains.some((d) => email.trim().toLowerCase().slice(at + 1) === d);
};

export const demoAccounts = [
  { role: "customer", email: "customer@demo.awaji", name: "山田 花子", label: "購入者" },
  { role: "farmer", email: "farmer@demo.awaji", name: "阿波 太一", label: "生産者（実家の畑）" },
  { role: "admin", email: "admin@demo.awaji", name: "運営 管理者", label: "運営管理者" },
] as const;
