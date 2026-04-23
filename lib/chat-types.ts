// Shared chat content-block shapes. These mirror the subset of
// Anthropic content blocks we persist in the messages table.

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
export type ChatBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type MessageRow = {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "tool";
  content: ChatBlock[];
  created_at: string;
};

export type ChatSendResponse = {
  reply: string;
  user_message_id: string;
  inserted_workout_ids: string[];
};

export function extractText(blocks: ChatBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
