import "server-only";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChatMessage } from "./chat";

const MAX_HISTORY_MESSAGES = 40; // keeps the Claude request bounded as a conversation grows

export async function loadChatHistory(adminUserId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("ai_chat_messages")
    .select("role, content")
    .eq("admin_user_id", adminUserId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function appendChatMessage(adminUserId: string, role: "user" | "assistant", content: string): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_chat_messages").insert({ admin_user_id: adminUserId, role, content });
  if (error) throw error;
  revalidateTag("ai-chats"); // keeps /ai_chats (Super-Admin audit view) in sync with this new message
}

export async function clearChatHistory(adminUserId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_chat_messages").delete().eq("admin_user_id", adminUserId);
  if (error) throw error;
  revalidateTag("ai-chats");
}
