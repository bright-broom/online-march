import { siteConfig } from "@/config/site";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailBlock =
  | { type: "p"; text: string }
  | { type: "button"; label: string; href: string }
  | { type: "table"; rows: [string, string][] }
  | { type: "note"; text: string };

/** Minimal, client-safe transactional email layout (inline styles, brand colors). */
export function renderEmail(opts: { preheader: string; title: string; blocks: EmailBlock[] }) {
  const body = opts.blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return `<p style="margin:0 0 16px;line-height:1.8">${esc(b.text).replace(/\n/g, "<br>")}</p>`;
        case "button":
          return `<p style="margin:24px 0"><a href="${esc(b.href)}" style="background:#b07a2e;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${esc(b.label)}</a></p>`;
        case "table":
          return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px">${b.rows
            .map(([k, v]) => `<tr><td style="padding:8px 0;color:#7a6a58;border-bottom:1px solid #eee4d6;width:40%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee4d6">${esc(v)}</td></tr>`)
            .join("")}</table>`;
        case "note":
          return `<p style="margin:16px 0;padding:12px 14px;background:#f7efe1;border-radius:10px;font-size:13px;color:#6b5a45">${esc(b.text)}</p>`;
      }
    })
    .join("");
  const html = `<!doctype html><html lang="ja"><body style="margin:0;background:#fbf7ef;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#2b2118">
<span style="display:none;opacity:0">${esc(opts.preheader)}</span>
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-family:serif;font-size:18px;letter-spacing:.08em;color:#b07a2e;margin-bottom:20px">${esc(siteConfig.name)}</div>
<div style="background:#fff;border-radius:18px;padding:28px;border:1px solid #efe5d5">
<h1 style="font-size:20px;margin:0 0 18px;font-family:serif">${esc(opts.title)}</h1>${body}</div>
<p style="font-size:12px;color:#9a8a76;margin-top:20px;line-height:1.7">${esc(siteConfig.company.operator)}<br>${esc(siteConfig.contact.email)}<br>このメールは送信専用です。</p>
</div></body></html>`;
  const text = [opts.title, "", ...opts.blocks.map((b) =>
    b.type === "p" || b.type === "note" ? b.text : b.type === "button" ? `${b.label}: ${b.href}` : b.rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
  )].join("\n\n");
  return { html, text };
}
