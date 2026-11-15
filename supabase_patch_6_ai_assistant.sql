-- AI Assistant: vector knowledge base + chat history, for the admin-panel
-- chatbot (tool-calling Claude agent + Voyage AI embeddings for semantic
-- FAQ/policy search).
--
-- Run this once in the Supabase SQL Editor (it's safe to run the whole
-- file in one go — no CREATE INDEX CONCURRENTLY here, same reasoning as
-- supabase_patch_4: this table starts empty and will stay small, so a
-- plain index build is instant).

-- pgvector is a standard Supabase extension, already available to enable.
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per knowledge chunk (FAQ answers, feature explanations, policy
-- text) with its embedding. 1024 dims matches Voyage AI's "voyage-3" model
-- — if you ever switch embedding models, this column's dimension must
-- match that model's output size exactly, or inserts will fail.
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,       -- e.g. 'faq', 'feature-doc', 'policy'
  title text,
  content text NOT NULL,
  embedding vector(1024),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_embedding
  ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- PostgREST can't do vector math inline in a .select() call, so the chat
-- tool calls this function via supabase.rpc(...) instead — this is a
-- regular read-only SQL function, not arbitrary query execution.
CREATE OR REPLACE FUNCTION match_ai_knowledge_chunks(
  query_embedding vector(1024),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source text,
  title text,
  content text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, source, title, content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM ai_knowledge_chunks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Chat history, so the floating widget's conversation survives a page
-- refresh instead of resetting every time (it already persists across
-- client-side navigation since it's mounted in the root layout, but not
-- across a hard reload or a new tab without this).
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_admin_created
  ON ai_chat_messages (admin_user_id, created_at);

-- Verify afterward:
-- select extname from pg_extension where extname = 'vector';
-- select proname from pg_proc where proname = 'match_ai_knowledge_chunks';
-- select tablename from pg_tables where tablename in ('ai_knowledge_chunks','ai_chat_messages');
