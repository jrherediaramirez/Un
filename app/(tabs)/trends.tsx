import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TrendsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <Text style={styles.title}>Trends</Text>
        <Text style={styles.note}>Per-exercise charts arrive in M5.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  inner: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 8 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  note: { color: "#888", fontSize: 14 },
});
