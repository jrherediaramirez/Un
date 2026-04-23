import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMessages, useSendMessage } from "@/hooks/use-chat";
import { extractText, type MessageRow } from "@/lib/chat-types";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function toDisplay(rows: MessageRow[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const row of rows) {
    if (row.role === "tool") continue;
    const text = extractText(row.content);
    if (!text) continue;
    out.push({ id: row.id, role: row.role, text });
  }
  return out;
}

export default function ChatScreen() {
  const messagesQuery = useMessages();
  const send = useSendMessage();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  const display = useMemo(
    () => toDisplay(messagesQuery.data ?? []),
    [messagesQuery.data],
  );

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    setDraft("");
    send.mutate(text);
  }, [draft, send]);

  const onContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {messagesQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#4f46e5" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={display}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={onContentSizeChange}
            ListEmptyComponent={<Empty />}
          />
        )}
        {send.isError ? (
          <Text style={styles.error}>{(send.error as Error).message}</Text>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="e.g. bench 3x10 @135 and ran 2mi"
            placeholderTextColor="#666"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onSend}
            editable={!send.isPending}
            multiline
          />
          <Pressable
            style={[styles.send, (send.isPending || !draft.trim()) && styles.sendDisabled]}
            onPress={onSend}
            disabled={send.isPending || !draft.trim()}
          >
            {send.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Log your workouts.</Text>
      <Text style={styles.emptyBody}>
        Tell me what you did — I&apos;ll track it.{"\n\n"}
        Try: <Text style={styles.emptyMono}>bench 3x10 @135 and ran 2mi in 18 min</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowLeft: { justifyContent: "flex-start" },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: { backgroundColor: "#4f46e5" },
  bubbleAssistant: { backgroundColor: "#1a1a1c" },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextAssistant: { color: "#eee" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
    backgroundColor: "#0b0b0c",
  },
  input: {
    flex: 1,
    color: "#fff",
    backgroundColor: "#1a1a1c",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  send: {
    backgroundColor: "#4f46e5",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: "center",
    minWidth: 72,
    alignItems: "center",
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTitle: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  emptyBody: { color: "#888", fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyMono: { color: "#b5b5ff", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  error: { color: "#ff6b6b", padding: 8, textAlign: "center", fontSize: 12 },
});
