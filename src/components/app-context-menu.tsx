import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquarePlus, Sparkles, Settings as SettingsIcon } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useAuth } from "@/lib/auth";
import { createChat } from "@/lib/chats.functions";
import { toast } from "sonner";

/**
 * Global right-click menu. Replaces the browser default context menu so the
 * usual "Inspect element" / "View page source" entries aren't shown. Note:
 * this is a UX deterrent only — devtools can still be opened via the browser
 * menu. We also swallow a few common devtools keyboard shortcuts.
 */
export function AppContextMenu({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createChat);

  const createMut = useMutation({
    mutationFn: () => create(),
    onSuccess: (chat) => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      navigate({ to: "/c/$threadId", params: { threadId: chat.id } });
    },
    onError: (e: Error) => toast.error(e?.message || "Couldn't start a new chat."),
  });

  // Best-effort: block F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === "f12") {
        e.preventDefault();
        return;
      }
      if (mod && e.shiftKey && (k === "i" || k === "j" || k === "c")) {
        e.preventDefault();
        return;
      }
      if (mod && k === "u") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onNewChat = () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    createMut.mutate();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onNewChat} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => navigate({ to: "/daps" })}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          New DAP
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => navigate({ to: "/settings" })}
          className="gap-2"
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
