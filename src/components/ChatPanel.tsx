import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileLite } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { uz } from "@/lib/uz";

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface ChatPanelProps {
  roomId: string;
  userId: string;
  profiles: Record<string, ProfileLite>;
}

export function ChatPanel({ roomId, userId, profiles }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("id, user_id, content, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages(data ?? []));

    const ch = supabase
      .channel(`room:${roomId}:chat`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const { error } = await supabase
      .from("chat_messages")
      .insert({ room_id: roomId, user_id: userId, content: trimmed.slice(0, 1000) });
    setSending(false);
    if (!error) setText("");
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">Hali xabarlar yo'q</p>
        )}
        {messages.map((m) => {
          const name = profiles[m.user_id]?.display_name ?? "Mehmon";
          const isMe = m.user_id === userId;
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-surface-2"}`}>
                {!isMe && <div className="text-[10px] opacity-70 mb-0.5">{name}</div>}
                <div className="break-words">{m.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t p-2 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uz.sendMessage}
          maxLength={1000}
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
