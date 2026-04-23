import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  useApplyTemplate,
  useHasLastWorkout,
  useRepeatLastWorkout,
  useTemplates,
} from "@/hooks/use-templates";

/**
 * Horizontal chip bar above the chat composer. Lets the user re-log
 * yesterday's workout or apply a saved template without typing.
 */
export function QuickLogBar({ onLogged }: { onLogged?: () => void }) {
  const { data: templates = [] } = useTemplates();
  const { data: hasLast = false } = useHasLastWorkout();
  const repeat = useRepeatLastWorkout();
  const apply = useApplyTemplate();

  const busy = repeat.isPending || apply.isPending;
  if (!hasLast && templates.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {hasLast ? (
          <Chip
            label="Repeat last"
            onPress={async () => {
              await repeat.mutateAsync();
              onLogged?.();
            }}
            busy={busy}
          />
        ) : null}
        {templates.map((t) => (
          <Chip
            key={t.id}
            label={t.name}
            onPress={async () => {
              await apply.mutateAsync(t.id);
              onLogged?.();
            }}
            busy={busy}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  return (
    <Pressable style={[styles.chip, busy && styles.chipBusy]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.chipText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
    backgroundColor: "#0b0b0c",
  },
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    backgroundColor: "#1a1a1c",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  chipBusy: { opacity: 0.6 },
  chipText: { color: "#b5b5ff", fontSize: 13, fontWeight: "500" },
});
