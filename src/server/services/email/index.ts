import "server-only";
import { Resend } from "resend";
import { env, features } from "@/lib/env";
import { renderEmail, type EmailBlock } from "./layout";

let client: Resend | null = null;

export type EmailMessage = { to: string; subject: string; preheader?: string; title?: string; blocks: EmailBlock[] };

/** Send a transactional email. Without RESEND_API_KEY it logs to the console (demo mode). Never throws. */
export async function sendEmail(msg: EmailMessage) {
  const { html, text } = renderEmail({ preheader: msg.preheader ?? msg.subject, title: msg.title ?? msg.subject, blocks: msg.blocks });
  if (!features.email) {
    console.info(`[email:demo] → ${msg.to} | ${msg.subject}`);
    return { id: null, demo: true };
  }
  try {
    client ??= new Resend(env.RESEND_API_KEY);
    const { data, error } = await client.emails.send({ from: env.EMAIL_FROM, to: msg.to, subject: msg.subject, html, text });
    if (error) console.error("[email]", error);
    return { id: data?.id ?? null, demo: false };
  } catch (err) {
    console.error("[email]", err);
    return { id: null, demo: false };
  }
}

export type { EmailBlock };
