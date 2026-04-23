import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLoggedExercises, type LoggedExercise } from "@/hooks/use-trend";

const CATEGORY_LABEL: Record<LoggedExercise["category"], string> = {
  strength: "Strength",
  cardio: "Cardio",
  bodyweight: "Bodyweight",
};

export default function TrendsScreen() {
  const { data, isLoading } = useLoggedExercises();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Trends</Text>
        <Text style={styles.subtitle}>Pick an exercise to see progression.</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#4f46e5" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ExerciseRow exercise={item} />}
          ListEmptyComponent={
            <Text style={styles.empty}>Log a workout first — trends appear here.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ExerciseRow({ exercise }: { exercise: LoggedExercise }) {
  return (
    <Link href={{ pathname: "/exercise/[id]", params: { id: exercise.id } }} asChild>
      <Pressable style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{exercise.canonical_name}</Text>
          <Text style={styles.meta}>
            {CATEGORY_LABEL[exercise.category]} · {exercise.session_count}{" "}
            {exercise.session_count === 1 ? "session" : "sessions"} · last{" "}
            {exercise.last_logged}
          </Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  header: { padding: 20, gap: 4 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1c",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  meta: { color: "#888", fontSize: 12, marginTop: 2 },
  chev: { color: "#555", fontSize: 22, paddingLeft: 8 },
  empty: { color: "#666", textAlign: "center", marginTop: 32, fontStyle: "italic" },
});
