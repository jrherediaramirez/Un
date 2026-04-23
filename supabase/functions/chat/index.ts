// POST /chat — Edge Function entry for the workout-tracker assistant.
// Flow: persist the user message → build Anthropic request with caller's
// recent history + cached system prompt + per-request context → run a
// tool-use loop, executing each tool via RLS-scoped Supabase client →
// return the final assistant text (plus tool-result IDs the app can use
// for optimistic cache invalidation).

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

import { buildRequestContext, STATIC_SYSTEM_PROMPT } from "./prompt.ts";
import { buildRecentSummary, executeTool, TOOL_DEFS } from "./tools.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1024;
const HISTORY_LIMIT = 20;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...CORS_HEADERS, ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !anthropicKey) {
    return json({ error: "server_misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, { status: 401 });
  const userId = userData.user.id;

  let body: { message?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.message ?? "").trim();
  if (!text) return json({ error: "empty_message" }, { status: 400 });

  // Persist user message.
  const userContent = [{ type: "text", text }];
  const { data: userMsgRow, error: userMsgErr } = await supabase
    .from("messages")
    .insert({ user_id: userId, role: "user", content: userContent })
    .select("id, created_at")
    .single();
  if (userMsgErr) return json({ error: userMsgErr.message }, { status: 500 });

  // Profile (unit preference) + history + recent summary.
  const [{ data: profile }, { data: historyRows }, recentSummary] = await Promise.all([
    supabase.from("profiles").select("unit_system").eq("id", userId).single(),
    supabase
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    buildRecentSummary(supabase, userId),
  ]);
  const history = (historyRows ?? []).slice().reverse();

  const today = new Date().toISOString().slice(0, 10);
  const unitSystem = (profile?.unit_system ?? "imperial") as "imperial" | "metric";

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Map DB rows → Anthropic message shape. tool rows are user-role carriers
  // of tool_result blocks in the Anthropic wire format.
  // deno-lint-ignore no-explicit-any
  type AnyMessage = { role: "user" | "assistant"; content: any };
  const toAnthropicMessage = (row: { role: string; content: unknown }): AnyMessage => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  });

  const messages: AnyMessage[] = history.map(toAnthropicMessage);

  const insertedWorkoutIds = new Set<string>();
  let finalAssistantText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: STATIC_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: buildRequestContext({ today, unitSystem, recentSummary }),
        },
      ],
      // deno-lint-ignore no-explicit-any
      tools: TOOL_DEFS as any,
      messages,
    });

    // Persist assistant turn.
    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: resp.content,
    });

    messages.push({ role: "assistant", content: resp.content });

    // Extract any final text so we can always return something.
    for (const block of resp.content) {
      if (block.type === "text") finalAssistantText = block.text;
    }

    if (resp.stop_reason !== "tool_use") break;

    // Execute tools and build tool_result blocks.
    // deno-lint-ignore no-explicit-any
    const toolResultBlocks: any[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTool(
        block.name,
        block.input as Record<string, unknown>,
        supabase,
        userId,
      );
      if (block.name === "log_workout" && typeof result === "object" && result !== null) {
        const wid = (result as { workout_id?: string }).workout_id;
        if (wid) insertedWorkoutIds.add(wid);
      }
      const isError = typeof result === "object" && result !== null && "error" in result;
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }

    if (toolResultBlocks.length === 0) break;

    // Persist + append a single tool-result carrier message.
    await supabase.from("messages").insert({
      user_id: userId,
      role: "tool",
      content: toolResultBlocks,
    });
    messages.push({ role: "user", content: toolResultBlocks });
  }

  return json({
    reply: finalAssistantText,
    user_message_id: userMsgRow.id,
    inserted_workout_ids: [...insertedWorkoutIds],
  });
});
