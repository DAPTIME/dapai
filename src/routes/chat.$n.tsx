import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listChats } from "@/lib/chats.functions";
import { useAuth } from "@/lib/auth";

// Per-account short URL: /chat-1, /chat-2, ... resolves to the N-th most
// recently updated chat of the signed-in user. Different accounts see
// different chats at the same URL.
export const Route = createFileRoute("/chat/$n")({
  head: () => ({
    meta: [
      { title: "Chat — DAP AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChatShortcut,
});

function ChatShortcut() {
  const { n } = Route.useParams();
  const { user, ready, loading } = useAuth();
  const list = useServerFn(listChats);
  const chats = useQuery({
    queryKey: ["chats", user?.id ?? "anon"],
    queryFn: () => list(),
    enabled: !!user,
  });

  if (ready && !loading && !user) return <Navigate to="/login" />;

  const idx = Math.max(1, parseInt(n, 10) || 1) - 1;
  const target = chats.data?.[idx];

  if (chats.isLoading || !chats.data) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!target) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">No chat #{idx + 1}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You only have {chats.data.length} chat{chats.data.length === 1 ? "" : "s"} on this account.
        </p>
      </div>
    );
  }

  return <Navigate to="/c/$threadId" params={{ threadId: target.id }} replace />;
}
