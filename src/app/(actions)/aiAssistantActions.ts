"use server";

import { requireAdmin } from "@/lib/session";
import { runChat, type ChatMessage } from "@/lib/ai/chat";
import { loadChatHistory, appendChatMessage, clearChatHistory } from "@/lib/ai/history";

export interface SendChatMessageResult {
  success: boolean;
  error?: string;
  messages?: ChatMessage[];
}

/** Admin-only chat widget: loads this admin's history, runs the tool-use loop, persists both turns. */
export async function sendChatMessageAction(message: string): Promise<SendChatMessageResult> {
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: "Message is empty." };

  try {
    const session = await requireAdmin();
    const history = await loadChatHistory(session.userId);
    const nextHistory: ChatMessage[] = [...history, { role: "user", content: trimmed }];

    const reply = await runChat(nextHistory);

    await appendChatMessage(session.userId, "user", trimmed);
    await appendChatMessage(session.userId, "assistant", reply);

    return { success: true, messages: [...nextHistory, { role: "assistant", content: reply }] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "The assistant couldn't answer that." };
  }
}

export async function getChatHistoryAction(): Promise<ChatMessage[]> {
  const session = await requireAdmin();
  return loadChatHistory(session.userId);
}

export async function clearChatHistoryAction(): Promise<{ success: boolean }> {
  const session = await requireAdmin();
  await clearChatHistory(session.userId);
  return { success: true };
}
