/** Human-friendly identifiers. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function randomCode(len: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** AM-260918-7F3K */
export function orderCode(now: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "2-digit", month: "2-digit", day: "2-digit" })
    .format(now)
    .replaceAll("-", "");
  return `AM-${ymd}-${randomCode(4)}`;
}

export function slugify(input: string) {
  const ascii = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || randomCode(8).toLowerCase();
}
