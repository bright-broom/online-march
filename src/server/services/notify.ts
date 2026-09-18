import "server-only";
import { db } from "@/db";
import { notifications, type NotificationType } from "@/db/schema";
import { sendEmail, type EmailMessage } from "./email";

type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  email?: EmailMessage;
};

/** In-app notification (+ optional email). Failures are logged, never thrown. */
export async function notify(input: NotifyInput) {
  try {
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      href: input.href,
    });
  } catch (err) {
    console.error("[notify]", err);
  }
  if (input.email) await sendEmail(input.email);
}

export const notifyMany = (inputs: NotifyInput[]) => Promise.all(inputs.map(notify));
