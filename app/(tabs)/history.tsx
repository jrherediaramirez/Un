import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";

import { useExercises, useMonthWorkouts } from "@/hooks/use-workouts";
import { formatSet, type WorkoutRow } from "@/lib/workouts";

const TODAY = new Date().toISOString().slice(0, 10);

const CALENDAR_THEME = {
  backgroundColor: "#0b0b0c",
  calendarBackground: "#0b0b0c",
  textSectionTitleColor: "#666",
  selectedDayBackgroundColor: "#4f46e5",
  selectedDayTextColor: "#fff",
  todayTextColor: "#8a8aff",
  dayTextColor: "#eee",
  textDisabledColor: "#333",
  monthTextColor: "#fff",
  arrowColor: "#8a8aff",
  dotColor: "#4f46e5",
  selectedDotColor: "#fff",
  textMonthFontWeight: "700" as const,
};

export default function HistoryScreen() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<string>(TODAY);

  const { data: workouts = [], isLoading } = useMonthWorkouts(anchor);

  const marked = useMemo(() => {
    const m: Record<string, { marked: boolean; selected?: boolean; selectedColor?: string }> = {};
    for (const w of workouts) m[w.performed_on] = { marked: true };
    m[selected] = { ...(m[selected] ?? { marked: false }), selected: true, selectedColor: "#4f46e5" };
    return m;
  }, [workouts, selected]);

  const selectedWorkouts = useMemo(
    () => workouts.filter((w) => w.performed_on === selected),
    [workouts, selected],
  );

  const exerciseIds = useMemo(
    () => [...new Set(selectedWorkouts.flatMap((w) => w.sets.map((s) => s.exercise_id)))],
    [selectedWorkouts],
  );
  const { data: exercisesById } = useExercises(exerciseIds);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Calendar
        current={anchor.toISOString().slice(0, 10)}
        markedDates={marked}
        theme={CALENDAR_THEME}
        onDayPress={(d: DateData) => setSelected(d.dateString)}
        onMonthChange={(d: DateData) =>
          setAnchor(new Date(d.year, d.month - 1, 1))
        }
        enableSwipeMonths
      />
      <View style={styles.divider} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.dateHeader}>{formatHeaderDate(selected)}</Text>
        {isLoading ? (
          <ActivityIndicator color="#4f46e5" style={styles.loader} />
        ) : selectedWorkouts.length === 0 ? (
          <Text style={styles.empty}>No workouts logged.</Text>
        ) : (
          selectedWorkouts.map((w) => (
            <WorkoutBlock
              key={w.id}
              workout={w}
              nameFor={(id) => exercisesById?.get(id)?.canonical_name ?? "…"}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkoutBlock({
  workout,
  nameFor,
}: {
  workout: WorkoutRow;
  nameFor: (exerciseId: string) => string;
}) {
  // Group sets by exercise, preserving insertion order.
  const groups = new Map<string, WorkoutRow["sets"]>();
  for (const s of workout.sets) {
    const arr = groups.get(s.exercise_id) ?? [];
    arr.push(s);
    groups.set(s.exercise_id, arr);
  }

  return (
    <View style={styles.card}>
      {workout.notes ? <Text style={styles.notes}>{workout.notes}</Text> : null}
      {[...groups.entries()].map(([exerciseId, sets]) => (
        <View key={exerciseId} style={styles.exerciseBlock}>
          <Text style={styles.exerciseName}>{nameFor(exerciseId)}</Text>
          {sets.map((s, idx) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={styles.setIndex}>{idx + 1}</Text>
              <Text style={styles.setText}>{formatSet(s)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function formatHeaderDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#222" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 12 },
  dateHeader: { color: "#fff", fontSize: 18, fontWeight: "600" },
  loader: { marginTop: 24 },
  empty: { color: "#666", fontStyle: "italic" },
  card: {
    backgroundColor: "#1a1a1c",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  notes: { color: "#aaa", fontSize: 13, fontStyle: "italic" },
  exerciseBlock: { gap: 4 },
  exerciseName: { color: "#fff", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  setRow: { flexDirection: "row", gap: 10 },
  setIndex: { color: "#555", fontSize: 13, width: 20 },
  setText: { color: "#eee", fontSize: 14 },
});
