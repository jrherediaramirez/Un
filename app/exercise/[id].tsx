import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";

import { useExerciseWorkouts, useLoggedExercises } from "@/hooks/use-trend";
import { buildTrend, type TrendMetric } from "@/lib/trends";
import { formatSet } from "@/lib/workouts";

const STRENGTH_METRICS: { key: TrendMetric; label: string }[] = [
  { key: "top_weight", label: "Top weight" },
  { key: "total_volume", label: "Volume" },
];
const CARDIO_METRICS: { key: TrendMetric; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "pace", label: "Pace" },
];
const BODYWEIGHT_METRICS: { key: TrendMetric; label: string }[] = [
  { key: "top_reps", label: "Top reps" },
];

export default function ExerciseTrendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const { data: loggedList } = useLoggedExercises();
  const exercise = loggedList?.find((e) => e.id === id);
  const kind = exercise?.category ?? "strength";

  const metrics =
    kind === "cardio"
      ? CARDIO_METRICS
      : kind === "bodyweight"
        ? BODYWEIGHT_METRICS
        : STRENGTH_METRICS;

  const [metric, setMetric] = useState<TrendMetric>(metrics[0].key);
  // Reset metric choice if we navigate to a different kind.
  const fallbackMetric = useMemo(() => {
    if (!metrics.some((m) => m.key === metric)) return metrics[0].key;
    return metric;
  }, [metrics, metric]);

  const { data: workouts = [], isLoading } = useExerciseWorkouts(id ?? "");

  const series = useMemo(
    () => (id ? buildTrend(workouts, id, kind, fallbackMetric) : null),
    [workouts, id, kind, fallbackMetric],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{exercise?.canonical_name ?? "Exercise"}</Text>
        <Text style={styles.subtitle}>
          {exercise ? `${capitalize(exercise.category)} · last 90 days` : "Last 90 days"}
        </Text>

        <View style={styles.metricRow}>
          {metrics.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMetric(m.key)}
              style={[styles.chip, fallbackMetric === m.key && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  fallbackMetric === m.key && styles.chipTextActive,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color="#4f46e5" style={{ marginTop: 40 }} />
        ) : !series || series.points.length === 0 ? (
          <Text style={styles.empty}>Not enough data yet.</Text>
        ) : (
          <View style={styles.chartWrap}>
            <LineChart
              data={series.points.map((p) => ({ value: p.value, label: p.label }))}
              width={width - 48}
              height={220}
              color="#8a8aff"
              thickness={3}
              dataPointsColor="#8a8aff"
              dataPointsRadius={4}
              yAxisColor="#333"
              xAxisColor="#333"
              yAxisTextStyle={{ color: "#888", fontSize: 10 }}
              xAxisLabelTextStyle={{ color: "#888", fontSize: 10 }}
              rulesColor="#1a1a1c"
              rulesType="solid"
              initialSpacing={10}
              endSpacing={10}
              adjustToWidth
              formatYLabel={(v) => formatChartNumber(Number(v))}
            />
            <Text style={styles.unit}>{series.unit}</Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>Recent sessions</Text>
        {workouts.slice(0, 10).map((w) => {
          const sets = w.sets.filter((s) => s.exercise_id === id);
          return (
            <View key={w.id} style={styles.card}>
              <Text style={styles.cardDate}>{w.performed_on}</Text>
              {sets.map((s, i) => (
                <Text key={s.id} style={styles.cardSet}>
                  {i + 1}. {formatSet(s)}
                </Text>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatChartNumber(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  scroll: { padding: 20, gap: 12, paddingBottom: 48 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 13 },
  metricRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  chipActive: { borderColor: "#4f46e5", backgroundColor: "#2a246f" },
  chipText: { color: "#aaa", fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  chartWrap: {
    backgroundColor: "#1a1a1c",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  unit: { color: "#666", fontSize: 11, marginTop: 4, textAlign: "right" },
  sectionHeader: { color: "#888", fontSize: 13, marginTop: 20, textTransform: "uppercase", letterSpacing: 1 },
  card: { backgroundColor: "#1a1a1c", borderRadius: 10, padding: 12, gap: 2 },
  cardDate: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  cardSet: { color: "#bbb", fontSize: 13 },
  empty: { color: "#666", fontStyle: "italic", marginTop: 32, textAlign: "center" },
});
