// Tool definitions + executor dispatch for the workout chat.
// Runs inside the Supabase Edge Function, using a Supabase client
// bound to the caller's JWT so every query is RLS-scoped.

import type { SupabaseClient } from "@supabase/supabase-js";

export const TOOL_DEFS = [
  {
    name: "find_or_create_exercise",
    description:
      "Resolve free-text exercise name to a canonical row. Always call this before log_workout. If the lookup misses, the row is created using proposed_canonical_name/category — so ALWAYS include those.",
    input_schema: {
      type: "object",
      required: ["query", "proposed_canonical_name", "proposed_category"],
      properties: {
        query: { type: "string", description: "User's free-text name, e.g. 'bp' or 'ran'." },
        proposed_canonical_name: {
          type: "string",
          description: "Canonical name to use if the exercise must be created, e.g. 'Bench Press'.",
        },
        proposed_category: {
          type: "string",
          enum: ["strength", "cardio", "bodyweight"],
        },
        proposed_aliases: {
          type: "array",
          items: { type: "string" },
          description: "Optional extra aliases to seed the new row with.",
        },
      },
    },
  },
  {
    name: "log_workout",
    description:
      "Create a workout session and log one or more sets. All sets share the same performed_on date.",
    input_schema: {
      type: "object",
      required: ["performed_on", "sets"],
      properties: {
        performed_on: { type: "string", description: "YYYY-MM-DD. Default to today if not stated." },
        notes: { type: "string" },
        sets: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["exercise_id", "kind"],
            properties: {
              exercise_id: { type: "string" },
              kind: { type: "string", enum: ["strength", "cardio", "bodyweight"] },
              reps: { type: "integer" },
              weight: { type: "number" },
              weight_unit: { type: "string", enum: ["lb", "kg"] },
              distance: { type: "number" },
              distance_unit: { type: "string", enum: ["mi", "km", "m"] },
              duration_seconds: { type: "integer" },
              rpe: { type: "number" },
              repeat: {
                type: "integer",
                minimum: 1,
                description: "Expand into N identical sets (e.g. 3x10 -> one entry with repeat:3).",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "query_workouts",
    description:
      "Look up the user's past workouts. Use for ranges or filters beyond the 7-day summary already in context.",
    input_schema: {
      type: "object",
      properties: {
        since: { type: "string", description: "YYYY-MM-DD inclusive." },
        until: { type: "string", description: "YYYY-MM-DD inclusive." },
        exercise_id: { type: "string" },
        kind: { type: "string", enum: ["strength", "cardio", "bodyweight"] },
        limit: { type: "integer", default: 50, maximum: 200 },
      },
    },
  },
  {
    name: "update_workout",
    description:
      "Patch an existing workout or its sets. Pass set_patches with delete:true to remove a set.",
    input_schema: {
      type: "object",
      required: ["workout_id"],
      properties: {
        workout_id: { type: "string" },
        performed_on: { type: "string" },
        notes: { type: "string" },
        set_patches: {
          type: "array",
          items: {
            type: "object",
            required: ["set_id"],
            properties: {
              set_id: { type: "string" },
              delete: { type: "boolean" },
              reps: { type: "integer" },
              weight: { type: "number" },
              distance: { type: "number" },
              duration_seconds: { type: "integer" },
              rpe: { type: "number" },
            },
          },
        },
      },
    },
  },
  {
    name: "delete_workout",
    description: "Delete an entire workout and all its sets.",
    input_schema: {
      type: "object",
      required: ["workout_id"],
      properties: { workout_id: { type: "string" } },
    },
  },
] as const;

type ToolError = { error: string };
type ToolResult = Record<string, unknown> | ToolError;

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "find_or_create_exercise":
        return await findOrCreateExercise(supabase, userId, input);
      case "log_workout":
        return await logWorkout(supabase, userId, input);
      case "query_workouts":
        return await queryWorkouts(supabase, userId, input);
      case "update_workout":
        return await updateWorkout(supabase, input);
      case "delete_workout":
        return await deleteWorkout(supabase, input);
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────

async function findOrCreateExercise(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const query = String(input.query ?? "").trim().toLowerCase();
  if (!query) return { error: "query is required" };

  // 1. Exact canonical name (case-insensitive).
  const { data: exact } = await supabase
    .from("exercises")
    .select("id, canonical_name, category, aliases")
    .ilike("canonical_name", query)
    .limit(1);
  if (exact && exact.length > 0) {
    return await maybeAppendAlias(supabase, exact[0], query);
  }

  // 2. Alias array contains query.
  const { data: aliased } = await supabase
    .from("exercises")
    .select("id, canonical_name, category, aliases")
    .contains("aliases", [query])
    .limit(1);
  if (aliased && aliased.length > 0) {
    return await maybeAppendAlias(supabase, aliased[0], query);
  }

  // 3. Trigram similarity via RPC-style similarity() call.
  // Using PostgREST's `.ilike` with % wildcards as a reasonable proxy
  // since a dedicated RPC isn't set up; the trigram index still helps.
  const { data: fuzzy } = await supabase
    .from("exercises")
    .select("id, canonical_name, category, aliases")
    .ilike("canonical_name", `%${query}%`)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) {
    return await maybeAppendAlias(supabase, fuzzy[0], query);
  }

  // 4. Miss → create using proposals.
  const proposedName = typeof input.proposed_canonical_name === "string"
    ? input.proposed_canonical_name.trim()
    : "";
  const proposedCategory = input.proposed_category as string | undefined;
  if (!proposedName || !proposedCategory) {
    return {
      error:
        "no match; resend with proposed_canonical_name and proposed_category (strength|cardio|bodyweight)",
    };
  }

  const aliases = Array.isArray(input.proposed_aliases)
    ? [...new Set([...(input.proposed_aliases as string[]), query].map((s) => s.toLowerCase()))]
    : [query];

  const { data: inserted, error } = await supabase
    .from("exercises")
    .insert({
      owner_id: userId,
      canonical_name: proposedName,
      category: proposedCategory,
      aliases,
    })
    .select("id, canonical_name, category")
    .single();
  if (error) return { error: error.message };

  return {
    exercise_id: inserted.id,
    canonical_name: inserted.canonical_name,
    category: inserted.category,
    was_created: true,
  };
}

async function maybeAppendAlias(
  supabase: SupabaseClient,
  row: { id: string; canonical_name: string; category: string; aliases: string[] },
  query: string,
): Promise<ToolResult> {
  const normalized = query.toLowerCase();
  const canonicalLower = row.canonical_name.toLowerCase();
  if (normalized !== canonicalLower && !row.aliases.includes(normalized)) {
    // Best-effort; ignore failure (might hit a row we don't own).
    await supabase
      .from("exercises")
      .update({ aliases: [...row.aliases, normalized] })
      .eq("id", row.id);
  }
  return {
    exercise_id: row.id,
    canonical_name: row.canonical_name,
    category: row.category,
    was_created: false,
  };
}

// ─────────────────────────────────────────────────────────────

type LogSetInput = {
  exercise_id: string;
  kind: "strength" | "cardio" | "bodyweight";
  reps?: number;
  weight?: number;
  weight_unit?: "lb" | "kg";
  distance?: number;
  distance_unit?: "mi" | "km" | "m";
  duration_seconds?: number;
  rpe?: number;
  repeat?: number;
};

async function logWorkout(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const performed_on = String(input.performed_on ?? "").slice(0, 10);
  const setsIn = (input.sets as LogSetInput[] | undefined) ?? [];
  if (!performed_on || setsIn.length === 0) {
    return { error: "performed_on and sets are required" };
  }

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      user_id: userId,
      performed_on,
      notes: typeof input.notes === "string" ? input.notes : null,
    })
    .select("id")
    .single();
  if (wErr) return { error: wErr.message };

  // Expand repeat into individual set rows.
  const rows: Array<Record<string, unknown>> = [];
  for (const s of setsIn) {
    const copies = Math.max(1, s.repeat ?? 1);
    for (let i = 0; i < copies; i++) {
      rows.push({
        workout_id: workout.id,
        exercise_id: s.exercise_id,
        kind: s.kind,
        set_index: i + 1,
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        weight_unit: s.weight_unit ?? null,
        distance: s.distance ?? null,
        distance_unit: s.distance_unit ?? null,
        duration_seconds: s.duration_seconds ?? null,
        rpe: s.rpe ?? null,
      });
    }
  }

  const { data: insertedSets, error: sErr } = await supabase
    .from("sets")
    .insert(rows)
    .select("id, exercise_id, kind, reps, weight, distance, duration_seconds");
  if (sErr) return { error: sErr.message };

  return { workout_id: workout.id, sets: insertedSets ?? [] };
}

// ─────────────────────────────────────────────────────────────

async function queryWorkouts(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Math.max(1, (input.limit as number | undefined) ?? 50), 200);
  let q = supabase
    .from("workouts")
    .select(
      "id, performed_on, notes, sets:sets(id, exercise_id, kind, reps, weight, weight_unit, distance, distance_unit, duration_seconds, rpe, set_index)",
    )
    .eq("user_id", userId)
    .order("performed_on", { ascending: false })
    .limit(limit);

  if (typeof input.since === "string") q = q.gte("performed_on", input.since);
  if (typeof input.until === "string") q = q.lte("performed_on", input.until);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let workouts = data ?? [];
  if (typeof input.exercise_id === "string") {
    workouts = workouts
      .map((w) => ({ ...w, sets: w.sets.filter((s: { exercise_id: string }) => s.exercise_id === input.exercise_id) }))
      .filter((w) => w.sets.length > 0);
  }
  if (typeof input.kind === "string") {
    workouts = workouts
      .map((w) => ({ ...w, sets: w.sets.filter((s: { kind: string }) => s.kind === input.kind) }))
      .filter((w) => w.sets.length > 0);
  }

  // Also return exercise names for display.
  const exerciseIds = [
    ...new Set(workouts.flatMap((w) => w.sets.map((s: { exercise_id: string }) => s.exercise_id))),
  ];
  const { data: exRows } = await supabase
    .from("exercises")
    .select("id, canonical_name, category")
    .in("id", exerciseIds);

  return { workouts, exercises: exRows ?? [] };
}

// ─────────────────────────────────────────────────────────────

type SetPatch = {
  set_id: string;
  delete?: boolean;
  reps?: number;
  weight?: number;
  distance?: number;
  duration_seconds?: number;
  rpe?: number;
};

async function updateWorkout(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const workoutId = String(input.workout_id ?? "");
  if (!workoutId) return { error: "workout_id is required" };

  // Header patch.
  const headerPatch: Record<string, unknown> = {};
  if (typeof input.performed_on === "string") headerPatch.performed_on = input.performed_on;
  if (typeof input.notes === "string") headerPatch.notes = input.notes;
  if (Object.keys(headerPatch).length > 0) {
    const { error } = await supabase.from("workouts").update(headerPatch).eq("id", workoutId);
    if (error) return { error: error.message };
  }

  // Set patches.
  const patches = (input.set_patches as SetPatch[] | undefined) ?? [];
  for (const p of patches) {
    if (!p.set_id) continue;
    if (p.delete) {
      const { error } = await supabase.from("sets").delete().eq("id", p.set_id);
      if (error) return { error: error.message };
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (p.reps !== undefined) patch.reps = p.reps;
    if (p.weight !== undefined) patch.weight = p.weight;
    if (p.distance !== undefined) patch.distance = p.distance;
    if (p.duration_seconds !== undefined) patch.duration_seconds = p.duration_seconds;
    if (p.rpe !== undefined) patch.rpe = p.rpe;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("sets").update(patch).eq("id", p.set_id);
    if (error) return { error: error.message };
  }

  return { workout_id: workoutId, patched: true };
}

async function deleteWorkout(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const workoutId = String(input.workout_id ?? "");
  if (!workoutId) return { error: "workout_id is required" };
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
  if (error) return { error: error.message };
  return { workout_id: workoutId, deleted: true };
}

// ─────────────────────────────────────────────────────────────

/** Build a compact recent-activity string for the cached system context. */
export async function buildRecentSummary(
  supabase: SupabaseClient,
  userId: string,
  days = 7,
): Promise<string> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("workouts")
    .select(
      "performed_on, sets:sets(kind, reps, weight, weight_unit, distance, distance_unit, duration_seconds, exercise:exercises(canonical_name))",
    )
    .eq("user_id", userId)
    .gte("performed_on", since)
    .order("performed_on", { ascending: false });

  if (!data || data.length === 0) return "";

  return data
    .map((w) => {
      const setsByEx = new Map<string, string[]>();
      for (const s of w.sets as Array<{
        kind: string;
        reps: number | null;
        weight: number | null;
        weight_unit: string | null;
        distance: number | null;
        distance_unit: string | null;
        duration_seconds: number | null;
        exercise: { canonical_name: string } | null;
      }>) {
        const name = s.exercise?.canonical_name ?? "Unknown";
        const desc = s.kind === "strength"
          ? `${s.reps ?? "?"}@${s.weight ?? "?"}${s.weight_unit ?? ""}`
          : s.kind === "cardio"
            ? [
              s.distance != null ? `${s.distance}${s.distance_unit ?? ""}` : null,
              s.duration_seconds != null ? `${Math.round(s.duration_seconds / 60)}min` : null,
            ].filter(Boolean).join("/")
            : `${s.reps ?? s.duration_seconds ?? "?"}`;
        const arr = setsByEx.get(name) ?? [];
        arr.push(desc);
        setsByEx.set(name, arr);
      }
      const line = [...setsByEx.entries()]
        .map(([ex, sets]) => `${ex} (${sets.join(", ")})`)
        .join("; ");
      return `- ${w.performed_on}: ${line}`;
    })
    .join("\n");
}
