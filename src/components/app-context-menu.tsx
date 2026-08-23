import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  TextSelect,
  Crown,
  Settings as SettingsIcon,
  Gamepad2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { ProDialog } from "@/components/pro-dialog";

/**
 * Global right-click menu. Replaces the browser default context menu so the
 * usual "Inspect element" / "View page source" entries aren't shown. Note:
 * this is a UX deterrent only — devtools can still be opened via the browser
 * menu. We also swallow a few common devtools keyboard shortcuts.
 */
export function AppContextMenu({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [proOpen, setProOpen] = useState(false);

  const onSelectAll = useCallback(() => {
    const sel = window.getSelection?.();
    if (!sel) return;
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(document.body);
    sel.addRange(range);
  }, []);

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
    };

    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKey, { capture: true });
    };
  }, []);

  const replaying = useRef(false);
  const openRef = useRef(false);
  const closedAt = useRef(0);

  const handleContextMenuCapture = useCallback((e: React.MouseEvent) => {
    if (replaying.current) return;
    const wasOpen = openRef.current || Date.now() - closedAt.current < 250;
    if (!wasOpen) return;

    const { clientX, clientY } = e;
    const target = e.target as HTMLElement;
    e.preventDefault();
    e.stopPropagation();

    const start = Date.now();
    const replay = () => {
      const stillThere = document.querySelector("[data-radix-menu-content]");
      if (stillThere && Date.now() - start < 600) {
        requestAnimationFrame(replay);
        return;
      }
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
    };
    requestAnimationFrame(replay);
  }, []);

  return (
    <>
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
        <ContextMenuItem onSelect={() => navigate({ to: "/games" })} className="gap-2">
          <Gamepad2 className="h-4 w-4" />
          Arcade
        </ContextMenuItem>
        <ContextMenuItem onSelect={onSelectAll} className="gap-2">
          <TextSelect className="h-4 w-4" />
          Select all
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setProOpen(true)} className="gap-2">
          <Crown className="h-4 w-4" />
          Upgrade
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => navigate({ to: "/settings" })}
          className="gap-2"
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
      <ProDialog open={proOpen} onOpenChange={setProOpen} />
    </>
  );
}
