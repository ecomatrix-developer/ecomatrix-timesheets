import { redirect } from "next/navigation";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import AiChatsClient, { type AiChatMessage, type AiChatConversation } from "./AiChatsClient";

export const dynamic = "force-dynamic";

/**
 * Abeer, 2026-11-22: "Chats alag se karna h, jaha ai agent ki chats dikhe
 * create a new page only for super admins so that complete AI chats are
 * there" — a standalone, Super-Admin-only audit view of every admin's AI
 * assistant conversation (ai_chat_messages is keyed by admin_user_id, one
 * running history per admin — see src/lib/ai/history.ts). Previously this
 * history was only ever visible to the admin themselves, inside the
 * chatbot widget.
 */
export default async function AiChatsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOnly(session)) redirect("/login");

  const [users, { data: rows, error }] = await Promise.all([
    getAllUsers(),
    supabaseAdmin
      .from("ai_chat_messages")
      .select("id, admin_user_id, role, content, created_at")
      .order("created_at", { ascending: true }),
  ]);
  if (error) throw error;

  const userById = new Map(users.map((u) => [u.id, u]));
  const byAdmin = new Map<string, AiChatMessage[]>();
  for (const row of (rows ?? []) as AiChatMessage[]) {
    const list = byAdmin.get(row.admin_user_id) ?? [];
    list.push(row);
    byAdmin.set(row.admin_user_id, list);
  }

  const conversations: AiChatConversation[] = [...byAdmin.entries()]
    .map(([adminUserId, messages]) => ({
      adminUserId,
      adminName: userById.get(adminUserId)?.name ?? "Unknown user",
      messages,
    }))
    // Most recently active conversation first.
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at ?? "";
      const bLast = b.messages[b.messages.length - 1]?.created_at ?? "";
      return bLast.localeCompare(aLast);
    });

  return (
    <PageTransition>
      <AiChatsClient conversations={conversations} />
    </PageTransition>
  );
}
