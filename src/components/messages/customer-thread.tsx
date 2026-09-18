"use client";
import { routes } from "@/config/nav";
import { markMessagesRead } from "@/server/actions/account";
import { sendMessage } from "@/server/actions/messages";
import type { ThreadFarm } from "@/server/queries/account";
import { ChatThread, type ChatMessage } from "./chat-thread";

/** Customer-side binding of ChatThread to a farm (sendMessage / markMessagesRead). */
export function CustomerThread({ viewerId, farm, messages }: { viewerId: string; farm: ThreadFarm; messages: ChatMessage[] }) {
  return (
    <ChatThread
      viewerId={viewerId}
      messages={messages}
      counterpart={{ name: farm.name, avatar: farm.avatarImage, subtitle: farm.tagline || `${farm.city}・${farm.representative}`, href: routes.farm(farm.slug) }}
      onSend={(body) => sendMessage({ farmId: farm.id, body })}
      onSeen={() => void markMessagesRead(farm.id)}
      backHref={routes.mypage.messages}
      emptyHint="おすすめの食べ方や保存方法、配送のご相談など、お気軽にどうぞ。"
    />
  );
}
