import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { fetchExercisesByIds, type WorkoutRow } from "@/lib/workouts";

const TREND_DAYS = 90;

export type LoggedExercise = {
  id: string;
  canonical_name: string;
  category: "strength" | "cardio" | "bodyweight";
  last_logged: string; // YYYY-MM-DD
  session_count: number;
};

/** Exercises the user has actually logged, sorted most-recent-first. */
export function useLoggedExercises() {
  return useQuery<LoggedExercise[]>({
    queryKey: ["exercises", "logged"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sets")
        .select("exercise_id, workout:workouts(performed_on)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      type SetRef = {
        exercise_id: string;
        // Supabase types nested selects as arrays even for single FKs;
        // at runtime it's a single object for many-to-one relationships.
        workout: { performed_on: string } | { performed_on: string }[] | null;
      };
      const rows = (data ?? []) as unknown as SetRef[];

      const byId = new Map<string, { last: string; count: number }>();
      for (const r of rows) {
        const workout = Array.isArray(r.workout) ? r.workout[0] : r.workout;
        const date = workout?.performed_on ?? "0000-00-00";
        const cur = byId.get(r.exercise_id);
        if (!cur) {
          byId.set(r.exercise_id, { last: date, count: 1 });
        } else {
          cur.count += 1;
          if (date > cur.last) cur.last = date;
        }
      }

      const ids = [...byId.keys()];
      const exMap = await fetchExercisesByIds(ids);
      const out: LoggedExercise[] = [];
      for (const [id, agg] of byId) {
        const ex = exMap.get(id);
        if (!ex) continue;
        out.push({
          id,
          canonical_name: ex.canonical_name,
          category: ex.category,
          last_logged: agg.last,
          session_count: agg.count,
        });
      }
      out.sort((a, b) => (a.last_logged < b.last_logged ? 1 : -1));
      return out;
    },
  });
}

/** Workouts containing a given exercise over the trend window. */
export function useExerciseWorkouts(exerciseId: string) {
  return useQuery<WorkoutRow[]>({
    queryKey: ["workouts", "exercise", exerciseId],
    enabled: !!exerciseId,
    queryFn: async () => {
      const since = new Date(Date.now() - TREND_DAYS * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("workouts")
        .select(
          "id, performed_on, notes, created_at, sets:sets!inner(id, workout_id, exercise_id, kind, set_index, reps, weight, weight_unit, distance, distance_unit, duration_seconds, rpe, created_at)",
        )
        .gte("performed_on", since)
        .eq("sets.exercise_id", exerciseId)
        .order("performed_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutRow[];
    },
  });
}
