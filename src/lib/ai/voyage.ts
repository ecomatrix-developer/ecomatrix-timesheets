import "server-only";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
// 1024-dim output — must match the `vector(1024)` column in
// ai_knowledge_chunks (see supabase_patch_6_ai_assistant.sql). Changing
// this model requires re-embedding every existing row with the new
// dimension, not just new ones.
const VOYAGE_MODEL = "voyage-3";

/**
 * Voyage AI has no official SDK dependency needed — it's a plain REST
 * embeddings endpoint, same shape as OpenAI's. `inputType` tells the model
 * whether the text is a search query or a stored document, which Voyage
 * uses to adjust the embedding for better retrieval (asymmetric search).
 */
export async function embedTexts(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set in .env.local.");

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function embedOne(text: string, inputType: "query" | "document" = "query"): Promise<number[]> {
  const [embedding] = await embedTexts([text], inputType);
  return embedding;
}
