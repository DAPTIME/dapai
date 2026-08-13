import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Users, Lock, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { firstName } from "@/lib/utils";
import { MarkdownMessage } from "@/components/markdown-message";
import {
  getStudyRoom,
  joinStudyRoom,
  postStudyRoomMessage,
  setStudyRoomOpen,
} from "@/lib/study-rooms.functions";

export const Route = createFileRoute("/rooms/$code")({
  head: () => ({
    meta: [
      { title: "Study Room — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { user, ready, loading } = useAuth();
  const qc = useQueryClient();
  const fetchRoom = useServerFn(getStudyRoom);
  const join = useServerFn(joinStudyRoom);
  const post = useServerFn(postStudyRoomMessage);
  const setOpen = useServerFn(setStudyRoomOpen);

  const [text, setText] = useState("");
  const [typing, setTyping] = useState<string[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !loading && !user) navigate({ to: "/login" });
  }, [ready, loading, user, navigate]);

  const roomQuery = useQuery({
    queryKey: ["study-room", code],
    queryFn: () => fetchRoom({ data: { code } }),
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  const roomId = roomQuery.data?.room?.id;
  const joined = roomQuery.data?.room?.joined;
  const me = firstName(user?.name ?? user?.email, "Guest");

  // Live transcript + presence/typing over Supabase Realtime.
  useEffect(() => {
    if (!roomId || !joined || !user) return;
    const channel = supabase
      .channel(`study-room-${roomId}`, { config: { presence: { key: user.id } } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "study_room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["study-room", code] })
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string; typing: boolean }>();
        const people = Object.values(state).flat();
        setOnline(
          Array.from(new Set(people.map((p) => p.name).filter(Boolean)))
        );
        setTyping(
          Array.from(
            new Set(
              people.filter((p) => p.typing && p.name !== me).map((p) => p.name)
            )
          )
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: me, typing: false });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, joined, user, code, qc, me]);

  // Broadcast typing state (debounced off after 2s of stillness).
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalTyping = () => {
    if (!roomId || !user) return;
    const channel = supabase.getChannels().find((c) => c.topic === `realtime:study-room-${roomId}`);
    if (!channel) return;
    void channel.track({ name: me, typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void channel.track({ name: me, typing: false });
    }, 2000);
  };

  const joinMut = useMutation({
    mutationFn: () => join({ data: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-room", code] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: (value: string) =>
      post({ data: { roomId: roomId!, text: value, askAi: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-room", code] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const messages = roomQuery.data?.messages ?? [];
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const memberNames = useMemo(
    () => (roomQuery.data?.members ?? []).map((m) => m.display_name),
    [roomQuery.data?.members]
  );

  if (!user || roomQuery.isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (roomQuery.error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Room not found</h1>
        <p className="mt-2 text-muted-foreground">
          {(roomQuery.error as Error).message}
        </p>
        <Button className="mt-6" asChild>
          <Link to="/rooms">Back to Study Rooms</Link>
        </Button>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Join this Study Room?</h1>
        <p className="mt-2 text-muted-foreground">
          Room code <span className="font-mono">{code}</span>. Everyone in the
          room shares one live conversation with DAP AI.
        </p>
        <Button
          className="mt-6 text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
          disabled={joinMut.isPending}
          onClick={() => joinMut.mutate()}
        >
          {joinMut.isPending ? "Joining…" : "Join room"}
        </Button>
      </div>
    );
  }

  const room = roomQuery.data!.room;

  return (
    <div className="chat-page-enter flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">{room.name}</h1>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(code).then(
              () => toast.success("Room code copied."),
              () => {}
            );
          }}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-mono text-xs"
        >
          {code} <Copy className="h-3 w-3" />
        </button>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Private
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {online.length > 0 ? `${online.length} online` : `${memberNames.length} member${memberNames.length === 1 ? "" : "s"}`}
        </span>
        {"isHost" in room && room.isHost && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1.5 rounded-full px-3 text-xs"
            onClick={() =>
              setOpen({ data: { roomId: room.id, open: !room.is_open } }).then(
                () => qc.invalidateQueries({ queryKey: ["study-room", code] })
              )
            }
          >
            <Lock className="h-3.5 w-3.5" />
            {room.is_open ? "Close room" : "Reopen room"}
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Nobody has said anything yet. Ask DAP AI a question — everyone in
              the room will see the answer.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="message-in">
              <div className="text-xs font-medium text-muted-foreground">
                {m.role === "assistant" ? "DAP AI" : m.author_name}
              </div>
              {m.role === "assistant" ? (
                <div className="mt-1 text-foreground">
                  <MarkdownMessage content={m.content} />
                </div>
              ) : (
                <div className="user-bubble mt-1 inline-block whitespace-pre-wrap">
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {(sendMut.isPending || typing.length > 0) && (
            <p className="text-xs text-muted-foreground">
              {sendMut.isPending
                ? "DAP AI is replying…"
                : `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`}
            </p>
          )}
        </div>
      </div>

      <form
        className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value || sendMut.isPending) return;
          setText("");
          sendMut.mutate(value);
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              signalTyping();
            }}
            placeholder={room.is_open ? "Message the room…" : "This room is closed"}
            disabled={!room.is_open || sendMut.isPending}
            className="text-base font-medium"
          />
          <Button
            type="submit"
            disabled={!room.is_open || sendMut.isPending || !text.trim()}
            className="text-primary-foreground"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
          DAP AI is AI and can make mistakes. Everyone in this room sees these
          messages.
        </p>
      </form>
    </div>
  );
}
