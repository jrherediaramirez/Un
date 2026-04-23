// Shared workout query types + client helpers used by History and Trends.

import { supabase } from "@/lib/supabase";

export type SetRow = {
  id: string;
  workout_id: string;
  exercise_id: string;
  kind: "strength" | "cardio" | "bodyweight";
  set_index: number;
  reps: number | null;
  weight: number | null;
  weight_unit: "lb" | "kg" | null;
  distance: number | null;
  distance_unit: "mi" | "km" | "m" | null;
  duration_seconds: number | null;
  rpe: number | null;
  created_at: string;
};

export type WorkoutRow = {
  id: string;
  performed_on: string; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
  sets: SetRow[];
};

export type ExerciseRow = {
  id: string;
  canonical_name: string;
  category: "strength" | "cardio" | "bodyweight";
};

export async function fetchWorkoutsInRange(since: string, until: string): Promise<WorkoutRow[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, performed_on, notes, created_at, sets:sets(id, workout_id, exercise_id, kind, set_index, reps, weight, weight_unit, distance, distance_unit, duration_seconds, rpe, created_at)",
    )
    .gte("performed_on", since)
    .lte("performed_on", until)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false, foreignTable: "sets" });
  if (error) throw error;
  return (data ?? []) as WorkoutRow[];
}

export async function fetchExercisesByIds(ids: string[]): Promise<Map<string, ExerciseRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("exercises")
    .select("id, canonical_name, category")
    .in("id", ids);
  if (error) throw error;
  const map = new Map<string, ExerciseRow>();
  for (const row of (data ?? []) as ExerciseRow[]) map.set(row.id, row);
  return map;
}

export function formatSet(s: SetRow): string {
  if (s.kind === "strength") {
    const w = s.weight != null ? `${s.weight}${s.weight_unit ?? ""}` : "bw";
    return `${s.reps ?? "?"} × ${w}`;
  }
  if (s.kind === "cardio") {
    const parts: string[] = [];
    if (s.distance != null) parts.push(`${s.distance}${s.distance_unit ?? ""}`);
    if (s.duration_seconds != null) parts.push(formatDuration(s.duration_seconds));
    return parts.join(" · ") || "—";
  }
  // bodyweight
  if (s.reps != null) return `${s.reps} reps`;
  if (s.duration_seconds != null) return formatDuration(s.duration_seconds);
  return "—";
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}min`;
}
