import { useCallback, useEffect, useRef, useState } from "react";
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

  const onNewChat = useCallback(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    createMut.mutate();
  }, [createMut, navigate, user]);

  // Best-effort: turn inspect/source/devtools shortcuts into a new chat.
  // Note: browsers (especially Chrome) often handle F12 at the chrome level
  // before JS sees it, so this cannot be fully prevented from a web page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = (e.key || "").toLowerCase();
      const code = e.code || "";
      const mod = e.ctrlKey || e.metaKey;
      const devtoolsLetter = k === "i" || k === "j" || k === "c" || k === "k";
      const isF12 = k === "f12" || code === "F12" || e.keyCode === 123;
      const inspectShortcut =
        isF12 ||
        (mod && devtoolsLetter && (e.shiftKey || e.altKey)) ||
        (mod && (k === "i" || k === "u"));

      if (!inspectShortcut) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onNewChat();
    };

    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKey, { capture: true });
    };
  }, [onNewChat]);


  // Radix's context menu is uncontrolled and only reads the cursor position
  // when it goes from closed to open. Right-clicking again while it was open
  // batched the dismiss and the reopen into one render, so the menu never
  // moved. Here we swallow that second right-click, close the menu for real,
  // and replay the click on the next frame so it reopens under the cursor.
  const replaying = useRef(false);
  const openRef = useRef(false);
  const closedAt = useRef(0);

  const handleContextMenuCapture = useCallback((e: React.MouseEvent) => {
    if (replaying.current) return;
    // The right-click's pointerdown dismisses the menu a beat before the
    // contextmenu event lands, so "was it open" has to include "it closed a
    // moment ago because of this very click".
    const wasOpen = openRef.current || Date.now() - closedAt.current < 200;
    if (!wasOpen) return;

    const { clientX, clientY } = e;
    const target = e.target as HTMLElement;
    e.preventDefault();
    e.stopPropagation();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        replaying.current = true;
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            button: 2,
          })
        );
        replaying.current = false;
      });
    });
  }, []);

  return (
    // modal={false} keeps the rest of the page interactive while the menu is
    // open, so the replayed right-click above actually reaches the trigger.
    <ContextMenu
      modal={false}
      onOpenChange={(o) => {
        openRef.current = o;
        if (!o) closedAt.current = Date.now();
      }}
    >
      <ContextMenuTrigger asChild>
        <div className="contents" onContextMenuCapture={handleContextMenuCapture}>
          {children}
        </div>
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
          New Custom AI
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
