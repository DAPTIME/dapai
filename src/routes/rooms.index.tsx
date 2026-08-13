import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Plus, LogIn, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import {
  createStudyRoom,
  joinStudyRoom,
  listMyStudyRooms,
} from "@/lib/study-rooms.functions";

export const Route = createFileRoute("/rooms/")({
  head: () => ({
    meta: [
      { title: "Study Rooms — live shared AI chat | DAP AI" },
      {
        name: "description",
        content:
          "Study Rooms let a group share one live DAP AI conversation — see who's online, who's typing, and every answer in real time.",
      },
      { property: "og:title", content: "Study Rooms — live shared AI chat | DAP AI" },
      {
        property: "og:description",
        content:
          "Create a room, share the code, and study together with DAP AI answering the whole group in real time.",
      },
      { property: "og:url", content: "https://dapai.lovable.app/rooms" },
    ],
    links: [{ rel: "canonical", href: "https://dapai.lovable.app/rooms" }],
  }),
  component: RoomsIndex,
});

function RoomsIndex() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const create = useServerFn(createStudyRoom);
  const join = useServerFn(joinStudyRoom);
  const listRooms = useServerFn(listMyStudyRooms);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const roomsQuery = useQuery({
    queryKey: ["study-rooms"],
    queryFn: () => listRooms(),
    enabled: !!user,
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name: name.trim() || undefined } }),
    onSuccess: (room) => navigate({ to: "/rooms/$code", params: { code: room.code } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const joinMut = useMutation({
    mutationFn: () => join({ data: { code: code.trim() } }),
    onSuccess: (room) => navigate({ to: "/rooms/$code", params: { code: room.code } }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Study Rooms</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        A shared live chat with DAP AI. Create a room, send the code to your
        group, and everyone sees the same conversation — plus who&apos;s in the
        room and who&apos;s typing, live.
      </p>

      {!user ? (
        <div className="mt-8 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Create account</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium">
                <Plus className="h-4 w-4" /> Start a room
              </h2>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Room name (e.g. Physics revision)"
                maxLength={60}
                className="mt-3"
              />
              <Button
                className="mt-3 w-full text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
                disabled={createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? "Creating…" : "Create room"}
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium">
                <LogIn className="h-4 w-4" /> Join with a code
              </h2>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={10}
                className="mt-3 tracking-[0.3em] uppercase"
              />
              <Button
                variant="outline"
                className="mt-3 w-full"
                disabled={joinMut.isPending || code.trim().length < 4}
                onClick={() => joinMut.mutate()}
              >
                {joinMut.isPending ? "Joining…" : "Join room"}
              </Button>
            </div>
          </div>

          <section className="mt-10">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Your rooms
            </h2>
            {roomsQuery.data && roomsQuery.data.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {roomsQuery.data.map((r) => (
                  <Link
                    key={r.id}
                    to="/rooms/$code"
                    params={{ code: r.code }}
                    className="rounded-2xl border border-border bg-card p-4 transition hover:border-ring/40"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium">{r.name}</span>
                      {r.isHost && (
                        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                          Host
                        </span>
                      )}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Radio className="h-3 w-3" />
                      Code {r.code} · {r.is_open ? "open" : "closed"}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                You haven&apos;t joined a study room yet.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
