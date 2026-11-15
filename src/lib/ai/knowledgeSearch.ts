import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedOne } from "./voyage";

export interface KnowledgeMatch {
  id: string;
  source: string;
  title: string | null;
  content: string;
  similarity: number;
}

/** Semantic search over ai_knowledge_chunks via the match_ai_knowledge_chunks RPC (see supabase_patch_6). */
export async function searchKnowledgeBase(query: string, matchCount = 5): Promise<KnowledgeMatch[]> {
  const embedding = await embedOne(query, "query");
  const { data, error } = await supabaseAdmin.rpc("match_ai_knowledge_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
  });
  if (error) throw error;
  return (data ?? []) as KnowledgeMatch[];
}
