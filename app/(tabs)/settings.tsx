import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/use-auth";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{session?.user.email ?? "—"}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Units</Text>
          <Text style={styles.value}>Imperial (editable in M6)</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Quick-log templates</Text>
          <Text style={styles.value}>Added in M6</Text>
        </View>

        <Pressable style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  inner: { flex: 1, padding: 24, gap: 16 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#222" },
  label: { color: "#888", fontSize: 12, marginBottom: 4 },
  value: { color: "#fff", fontSize: 15 },
  signOut: {
    marginTop: "auto",
    borderWidth: 1,
    borderColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { color: "#8a8aff", fontWeight: "600" },
});
