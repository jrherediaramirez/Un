// Compute per-workout trend points for a single exercise.

import type { SetRow, WorkoutRow } from "@/lib/workouts";

export type TrendMetric = "top_weight" | "total_volume" | "distance" | "pace" | "top_reps";

export type TrendPoint = {
  date: string; // YYYY-MM-DD
  value: number;
  label: string;
};

export type TrendSeries = {
  metric: TrendMetric;
  unit: string;
  points: TrendPoint[];
};

/**
 * Build a single trend series for an exercise from a list of workouts.
 * Each workout collapses to one point using the best metric for the kind.
 */
export function buildTrend(
  workouts: WorkoutRow[],
  exerciseId: string,
  kind: "strength" | "cardio" | "bodyweight",
  metric?: TrendMetric,
): TrendSeries {
  const resolvedMetric = metric ?? defaultMetric(kind);
  const unit = defaultUnit(resolvedMetric);
  const points: TrendPoint[] = [];

  // workouts arrive newest-first; reverse for chronological chart order.
  const ordered = [...workouts].reverse();
  for (const w of ordered) {
    const sets = w.sets.filter((s) => s.exercise_id === exerciseId);
    if (sets.length === 0) continue;
    const value = aggregateSets(sets, resolvedMetric);
    if (value == null) continue;
    points.push({
      date: w.performed_on,
      value,
      label: shortDate(w.performed_on),
    });
  }

  return { metric: resolvedMetric, unit, points };
}

function defaultMetric(kind: "strength" | "cardio" | "bodyweight"): TrendMetric {
  if (kind === "strength") return "top_weight";
  if (kind === "cardio") return "distance";
  return "top_reps";
}

function defaultUnit(metric: TrendMetric): string {
  switch (metric) {
    case "top_weight":
      return "lb";
    case "total_volume":
      return "lb·reps";
    case "distance":
      return "mi";
    case "pace":
      return "min/mi";
    case "top_reps":
      return "reps";
  }
}

function aggregateSets(sets: SetRow[], metric: TrendMetric): number | null {
  switch (metric) {
    case "top_weight": {
      const weights = sets.map((s) => s.weight ?? 0).filter((n) => n > 0);
      return weights.length > 0 ? Math.max(...weights) : null;
    }
    case "total_volume": {
      let vol = 0;
      for (const s of sets) vol += (s.reps ?? 0) * (s.weight ?? 0);
      return vol > 0 ? vol : null;
    }
    case "distance": {
      let d = 0;
      for (const s of sets) d += s.distance ?? 0;
      return d > 0 ? d : null;
    }
    case "pace": {
      let totalDist = 0;
      let totalSec = 0;
      for (const s of sets) {
        totalDist += s.distance ?? 0;
        totalSec += s.duration_seconds ?? 0;
      }
      if (totalDist <= 0 || totalSec <= 0) return null;
      // seconds per unit distance → minutes
      return totalSec / 60 / totalDist;
    }
    case "top_reps": {
      const reps = sets.map((s) => s.reps ?? 0).filter((n) => n > 0);
      return reps.length > 0 ? Math.max(...reps) : null;
    }
  }
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
