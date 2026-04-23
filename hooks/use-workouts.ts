import { useQuery } from "@tanstack/react-query";

import {
  fetchExercisesByIds,
  fetchWorkoutsInRange,
  type ExerciseRow,
  type WorkoutRow,
} from "@/lib/workouts";

function monthRange(anchor: Date): { since: string; until: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const since = new Date(y, m, 1).toISOString().slice(0, 10);
  const until = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { since, until };
}

/** Fetch workouts for the month containing `anchor`, plus 30 days padding. */
export function useMonthWorkouts(anchor: Date) {
  const { since, until } = monthRange(anchor);
  const key = ["workouts", "month", since, until] as const;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchWorkoutsInRange(since, until),
  });
}

export function useExercises(ids: string[]) {
  const key = ["exercises", "byIds", [...ids].sort().join(",")] as const;
  return useQuery<Map<string, ExerciseRow>>({
    queryKey: key,
    queryFn: () => fetchExercisesByIds(ids),
    enabled: ids.length > 0,
  });
}

export type { WorkoutRow };
