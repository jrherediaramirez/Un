// Quick-log helpers — all pure Supabase, no Edge Function / LLM.
// The sets.user_id trigger fills the caller automatically on insert,
// and RLS keeps everything scoped to auth.uid().

import { supabase } from "@/lib/supabase";
import type { WorkoutRow } from "@/lib/workouts";

type SetPayload = {
  exercise_id: string;
  kind: "strength" | "cardio" | "bodyweight";
  reps: number | null;
  weight: number | null;
  weight_unit: "lb" | "kg" | null;
  distance: number | null;
  distance_unit: "mi" | "km" | "m" | null;
  duration_seconds: number | null;
  rpe: number | null;
};

export type TemplateRow = {
  id: string;
  name: string;
  payload: { notes?: string | null; sets: SetPayload[] };
  created_at: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("not_authenticated");
  return id;
}

async function fetchLastWorkout(): Promise<WorkoutRow | null> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, performed_on, notes, created_at, sets:sets(id, workout_id, exercise_id, kind, set_index, reps, weight, weight_unit, distance, distance_unit, duration_seconds, rpe, created_at)",
    )
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkoutRow | null) ?? null;
}

function toSetPayload(rows: WorkoutRow["sets"]): SetPayload[] {
  return rows.map((s) => ({
    exercise_id: s.exercise_id,
    kind: s.kind,
    reps: s.reps,
    weight: s.weight,
    weight_unit: s.weight_unit,
    distance: s.distance,
    distance_unit: s.distance_unit,
    duration_seconds: s.duration_seconds,
    rpe: s.rpe,
  }));
}

async function insertWorkoutWithSets(opts: {
  performed_on: string;
  notes?: string | null;
  sets: SetPayload[];
}): Promise<{ workout_id: string }> {
  const userId = await requireUserId();
  const { data: w, error: wErr } = await supabase
    .from("workouts")
    .insert({ user_id: userId, performed_on: opts.performed_on, notes: opts.notes ?? null })
    .select("id")
    .single();
  if (wErr) throw wErr;
  if (opts.sets.length > 0) {
    const rows = opts.sets.map((s, i) => ({ ...s, workout_id: w.id, set_index: i + 1 }));
    const { error: sErr } = await supabase.from("sets").insert(rows);
    if (sErr) throw sErr;
  }
  return { workout_id: w.id };
}

export async function repeatLastWorkout(): Promise<{ workout_id: string } | null> {
  const last = await fetchLastWorkout();
  if (!last) return null;
  return insertWorkoutWithSets({
    performed_on: todayIso(),
    notes: last.notes,
    sets: toSetPayload(last.sets),
  });
}

export async function applyTemplate(templateId: string): Promise<{ workout_id: string }> {
  const { data, error } = await supabase
    .from("templates")
    .select("payload")
    .eq("id", templateId)
    .single();
  if (error) throw error;
  const payload = data.payload as { notes?: string | null; sets: SetPayload[] };
  return insertWorkoutWithSets({
    performed_on: todayIso(),
    notes: payload.notes ?? null,
    sets: payload.sets ?? [],
  });
}

export async function saveLastWorkoutAsTemplate(name: string): Promise<TemplateRow> {
  const last = await fetchLastWorkout();
  if (!last) throw new Error("no_workouts_yet");
  const userId = await requireUserId();
  const payload = { notes: last.notes, sets: toSetPayload(last.sets) };
  const { data, error } = await supabase
    .from("templates")
    .insert({ user_id: userId, name, payload })
    .select("id, name, payload, created_at")
    .single();
  if (error) throw error;
  return data as TemplateRow;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, payload, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TemplateRow[];
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw error;
}

export async function hasLastWorkout(): Promise<boolean> {
  const last = await fetchLastWorkout();
  return last !== null;
}
