import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Un</Text>
      <Text style={styles.subtitle}>Signed in as</Text>
      <Text style={styles.email}>{session?.user.email ?? "—"}</Text>
      <Text style={styles.note}>
        Chat, history, and trends land in the next milestones.
      </Text>
      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0b0b0c",
    gap: 8,
  },
  title: { color: "#fff", fontSize: 48, fontWeight: "700", marginBottom: 16 },
  subtitle: { color: "#aaa", fontSize: 14 },
  email: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 24 },
  note: { color: "#666", fontSize: 13, textAlign: "center", marginBottom: 24 },
  signOut: {
    borderWidth: 1,
    borderColor: "#4f46e5",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  signOutText: { color: "#8a8aff", fontWeight: "600" },
});
