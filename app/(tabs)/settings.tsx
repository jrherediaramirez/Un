import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/use-auth";
import { useDeleteTemplate, useSaveTemplate, useTemplates } from "@/hooks/use-templates";
import type { TemplateRow } from "@/lib/quick-log";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data: templates = [], isLoading } = useTemplates();
  const save = useSaveTemplate();
  const del = useDeleteTemplate();
  const [newName, setNewName] = useState("");

  async function onSave() {
    const name = newName.trim();
    if (!name) return;
    try {
      await save.mutateAsync(name);
      setNewName("");
    } catch (e) {
      Alert.alert("Couldn't save template", (e as Error).message);
    }
  }

  function onDelete(t: TemplateRow) {
    Alert.alert("Delete template?", `"${t.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => del.mutate(t.id),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{session?.user.email ?? "—"}</Text>
        </View>

        <Text style={styles.sectionHeader}>Quick-log templates</Text>
        <Text style={styles.hint}>
          Save your last workout under a name, tap it from the chat bar to re-log.
        </Text>

        <View style={styles.saveRow}>
          <TextInput
            style={styles.input}
            placeholder="Name (e.g. Push Day)"
            placeholderTextColor="#666"
            value={newName}
            onChangeText={setNewName}
            editable={!save.isPending}
          />
          <Pressable
            style={[styles.saveBtn, (!newName.trim() || save.isPending) && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={!newName.trim() || save.isPending}
          >
            {save.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save last</Text>
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#4f46e5" style={{ marginTop: 12 }} />
        ) : templates.length === 0 ? (
          <Text style={styles.emptyTemplates}>No templates yet.</Text>
        ) : (
          <View style={{ gap: 6 }}>
            {templates.map((t) => (
              <View key={t.id} style={styles.templateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateName}>{t.name}</Text>
                  <Text style={styles.templateMeta}>
                    {t.payload.sets?.length ?? 0} sets
                  </Text>
                </View>
                <Pressable onPress={() => onDelete(t)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  inner: { flex: 1, padding: 20, gap: 12 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", marginBottom: 4 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#222" },
  label: { color: "#888", fontSize: 12, marginBottom: 4 },
  value: { color: "#fff", fontSize: 15 },
  sectionHeader: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
  },
  hint: { color: "#666", fontSize: 12 },
  saveRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    backgroundColor: "#1a1a1c",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    minWidth: 90,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  emptyTemplates: { color: "#666", fontStyle: "italic", fontSize: 13 },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1c",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  templateName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  templateMeta: { color: "#888", fontSize: 12, marginTop: 2 },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  deleteText: { color: "#ff6b6b", fontSize: 13 },
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
