import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChatSendResponse, MessageRow } from "@/lib/chat-types";
import { supabase } from "@/lib/supabase";

const MESSAGES_KEY = ["messages"] as const;
const WORKOUTS_KEY = ["workouts"] as const;

async function fetchMessages(): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

async function sendMessage(message: string): Promise<ChatSendResponse> {
  const { data, error } = await supabase.functions.invoke<ChatSendResponse>("chat", {
    body: { message },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("empty_response");
  return data;
}

export function useMessages() {
  return useQuery({ queryKey: MESSAGES_KEY, queryFn: fetchMessages });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendMessage,
    onMutate: async (message) => {
      await qc.cancelQueries({ queryKey: MESSAGES_KEY });
      const prev = qc.getQueryData<MessageRow[]>(MESSAGES_KEY) ?? [];
      const optimistic: MessageRow = {
        id: `pending-${Date.now()}`,
        user_id: "pending",
        role: "user",
        content: [{ type: "text", text: message }],
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<MessageRow[]>(MESSAGES_KEY, [...prev, optimistic]);
      return { prev };
    },
    onError: (_err, _msg, ctx) => {
      if (ctx?.prev) qc.setQueryData(MESSAGES_KEY, ctx.prev);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      if (res.inserted_workout_ids.length > 0) {
        qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
      }
    },
  });
}
