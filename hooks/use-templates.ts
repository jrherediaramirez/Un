import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  applyTemplate,
  deleteTemplate,
  hasLastWorkout,
  listTemplates,
  repeatLastWorkout,
  saveLastWorkoutAsTemplate,
  type TemplateRow,
} from "@/lib/quick-log";

const TEMPLATES_KEY = ["templates"] as const;
const WORKOUTS_KEY = ["workouts"] as const;
const HAS_LAST_KEY = ["has-last-workout"] as const;

export function useTemplates() {
  return useQuery<TemplateRow[]>({
    queryKey: TEMPLATES_KEY,
    queryFn: listTemplates,
  });
}

export function useHasLastWorkout() {
  return useQuery({
    queryKey: HAS_LAST_KEY,
    queryFn: hasLastWorkout,
    staleTime: 60_000,
  });
}

function invalidateWorkoutViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
  qc.invalidateQueries({ queryKey: HAS_LAST_KEY });
  qc.invalidateQueries({ queryKey: ["exercises", "logged"] });
}

export function useRepeatLastWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repeatLastWorkout,
    onSuccess: () => invalidateWorkoutViews(qc),
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => applyTemplate(templateId),
    onSuccess: () => invalidateWorkoutViews(qc),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => saveLastWorkoutAsTemplate(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}
