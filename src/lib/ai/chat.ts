import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS, executeTool } from "./tools";

const MODEL = "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the admin assistant inside Ecomatrix Solutions' internal Timesheet app, talking to an admin via a chat widget.

Today's date is ${today}. Use it to resolve relative date ranges ("this month", "last 90 days", "last week") into explicit YYYY-MM-DD date_from/date_to before calling a tool — never ask the admin for today's date, you already have it.

Rules:
- For any question about real data (hours, employees, projects, submissions, leave balances, project status), use the provided tools. Never guess or fabricate a number, name, or date that didn't come from a tool result.
- Employee and project names are typed free-text by the admin — tools resolve them by fuzzy match. If a tool returns an error (not found, or ambiguous with multiple matches), relay that plainly and ask the admin to clarify instead of picking one yourself.
- Use search_knowledge_base for "how does X work" / policy / feature questions, not for live data.
- Dates are YYYY-MM-DD. When the admin doesn't give a date range, a data tool defaults to all-time — say so in your answer so the time period is clear.
- Keep answers concise and concrete: lead with the number or fact, then brief supporting detail. Format hours to 2 decimal places.
- If a question needs more than one tool (e.g. comparing two employees), call them in whatever order makes sense before answering.`;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Standard Anthropic agentic tool-use loop: send the conversation + tool
 * defs, execute any tool_use blocks the model requests against our own
 * curated, parameterized Supabase queries (see tools.ts — never arbitrary
 * SQL), feed the results back as tool_result blocks, and repeat until the
 * model answers with plain text (or the round cap is hit).
 */
export async function runChat(history: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.local.");
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: AI_TOOLS,
      messages,
    });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlock?.text ?? "I couldn't come up with an answer for that.";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          const result = await executeTool(toolUse.name, (toolUse.input ?? {}) as Record<string, unknown>);
          return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) };
        } catch (err) {
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  return "I had to stop after several tool calls without reaching a final answer — try rephrasing or narrowing your question.";
}
