import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/lib/auth";
import { listChats, getProfile } from "@/lib/chats.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PendingState =
  | { kind: "confirm"; title: string }
  | { kind: "blocked" };

/**
 * Guards the creation of a new chat against the plan's saved-chat limit.
 *
 * When the account is already at its limit, `request()` resolves `false`
 * and shows a dialog first, rather than letting the caller create the chat
 * and quietly lose one:
 *
 *  - if there is an unpinned chat to retire, it names it and asks for
 *    confirmation. Accepting resolves the promise `true` so the caller can
 *    go ahead and create the chat (the server prunes the named one, or the
 *    next-oldest unpinned one if the list moved under the user).
 *  - if every saved chat is pinned, there is nothing safe to remove, so
 *    the dialog only explains that and blocks — the caller never proceeds.
 *
 * Render `dialog` once near the component's return so it can appear.
 */
export function useNewChatGuard() {
  const { user } = useAuth();
  const list = useServerFn(listChats);
  const fetchProfile = useServerFn(getProfile);

  const chatsQuery = useQuery({
    queryKey: ["chats", user?.id ?? "anon"],
    queryFn: () => list(),
    enabled: !!user,
    staleTime: 5_000,
  });
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 15_000,
  });

  const [pending, setPending] = useState<
    (PendingState & { resolve: (v: boolean) => void }) | null
  >(null);

  const request = useCallback((): Promise<boolean> => {
    const chats = (chatsQuery.data ?? []) as Array<{
      id: string;
      title: string | null;
      created_at: string;
      pinned?: boolean | null;
    }>;
    const limit = profileQuery.data?.chatLimit ?? Number.POSITIVE_INFINITY;

    if (!Number.isFinite(limit) || chats.length < limit) {
      return Promise.resolve(true);
    }

    const unpinned = chats
      .filter((c) => !c.pinned)
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    if (unpinned.length === 0) {
      return new Promise((resolve) => setPending({ kind: "blocked", resolve }));
    }

    const oldest = unpinned[0];
    return new Promise((resolve) =>
      setPending({
        kind: "confirm",
        title: oldest.title?.trim() || "Untitled chat",
        resolve,
      })
    );
  }, [chatsQuery.data, profileQuery.data]);

  const dialog = pending && (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          pending.resolve(false);
          setPending(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending.kind === "blocked" ? "Every saved chat is pinned" : "Saved-chat limit reached"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending.kind === "blocked"
              ? "You're at your plan's saved-chat limit and every chat you have is pinned, so there's nothing DAP AI can safely remove. Unpin or delete one, then start a new chat."
              : `You're at your plan's saved-chat limit. Starting a new chat will remove "${pending.title}" (your oldest chat that isn't pinned). Pin it first if you want to keep it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              pending.resolve(false);
              setPending(null);
            }}
          >
            Cancel
          </AlertDialogCancel>
          {pending.kind === "confirm" && (
            <AlertDialogAction
              onClick={() => {
                pending.resolve(true);
                setPending(null);
              }}
            >
              Remove it and continue
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { request, dialog };
}
