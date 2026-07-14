// Shared per-game keyboard-remapping + editor UI.
// - Desktop shows a "Customize keys" editor.
// - Mobile hides the editor (touch buttons already provided by each game).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Keyboard, RotateCcw, X } from "lucide-react";

export type Bindings<A extends string> = Record<A, string[]>;

const STORAGE_PREFIX = "game-controls:v1:";

function loadStored<A extends string>(gameId: string, defaults: Bindings<A>): Bindings<A> {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + gameId);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Bindings<A>>;
    const merged = { ...defaults } as Bindings<A>;
    (Object.keys(defaults) as A[]).forEach((a) => {
      const v = parsed[a];
      if (Array.isArray(v) && v.length > 0 && v.every((k) => typeof k === "string")) {
        merged[a] = v as string[];
      }
    });
    return merged;
  } catch {
    return defaults;
  }
}

function persist<A extends string>(gameId: string, bindings: Bindings<A>) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + gameId, JSON.stringify(bindings));
  } catch {
    /* ignore */
  }
}

function normalize(key: string) {
  if (key === " " || key === "Spacebar") return " ";
  return key.length === 1 ? key.toLowerCase() : key;
}

function displayKey(key: string) {
  if (key === " ") return "Space";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "Enter") return "Enter";
  if (key === "Escape") return "Esc";
  return key.length === 1 ? key.toUpperCase() : key;
}

export type GameControls<A extends string> = {
  gameId: string;
  bindings: Bindings<A>;
  defaults: Bindings<A>;
  pressed: React.MutableRefObject<Record<A, boolean>>;
  press: (action: A, on: boolean) => void;
  setBinding: (action: A, keys: string[]) => void;
  reset: () => void;
  capture: { action: A; index: number } | null;
  startCapture: (action: A, index: number) => void;
  cancelCapture: () => void;
};

type Options<A extends string> = {
  /** Called on a keydown that maps to an action (useful for discrete inputs). */
  onKeyDown?: (action: A, event: KeyboardEvent) => void;
  /** If true, preventDefault() on mapped keys (useful for Space to avoid scroll). */
  preventDefault?: boolean;
};

export function useGameControls<A extends string>(
  gameId: string,
  defaults: Bindings<A>,
  opts: Options<A> = {}
): GameControls<A> {
  const defaultsRef = useRef(defaults);
  const [bindings, setBindings] = useState<Bindings<A>>(() => loadStored(gameId, defaults));
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const pressed = useRef<Record<A, boolean>>(
    (Object.keys(defaults) as A[]).reduce((acc, a) => {
      acc[a] = false;
      return acc;
    }, {} as Record<A, boolean>)
  );

  const [capture, setCapture] = useState<{ action: A; index: number } | null>(null);
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const findAction = useCallback((key: string): A | null => {
    const nk = normalize(key);
    const map = bindingsRef.current as Record<string, string[]>;
    for (const action of Object.keys(map)) {
      if (map[action].some((k) => normalize(k) === nk)) return action as A;
    }
    return null;
  }, []);

  // Global key listeners for gameplay + remap capture.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onDown = (e: KeyboardEvent) => {
      // Remap capture takes priority.
      const cap = captureRef.current;
      if (cap) {
        e.preventDefault();
        if (e.key === "Escape") {
          setCapture(null);
          return;
        }
        const key = e.key;
        setBindings((prev) => {
          const next = { ...prev } as Bindings<A>;
          const list = [...(next[cap.action] ?? [])];
          // Remove key from other actions to avoid conflicts.
          (Object.keys(next) as A[]).forEach((a) => {
            next[a] = (next[a] ?? []).filter((k) => normalize(k) !== normalize(key) || a === cap.action);
          });
          list[cap.index] = key;
          next[cap.action] = list;
          persist(gameId, next);
          return next;
        });
        setCapture(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      const action = findAction(e.key);
      if (action == null) return;
      pressed.current[action] = true;
      if (optsRef.current.preventDefault) e.preventDefault();
      optsRef.current.onKeyDown?.(action, e);
    };
    const onUp = (e: KeyboardEvent) => {
      const action = findAction(e.key);
      if (action == null) return;
      pressed.current[action] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [findAction, gameId]);

  const press = useCallback((action: A, on: boolean) => {
    pressed.current[action] = on;
  }, []);

  const setBinding = useCallback(
    (action: A, keys: string[]) => {
      setBindings((prev) => {
        const next = { ...prev, [action]: keys } as Bindings<A>;
        persist(gameId, next);
        return next;
      });
    },
    [gameId]
  );

  const reset = useCallback(() => {
    setBindings(defaultsRef.current);
    persist(gameId, defaultsRef.current);
  }, [gameId]);

  const startCapture = useCallback((action: A, index: number) => {
    setCapture({ action, index });
  }, []);
  const cancelCapture = useCallback(() => setCapture(null), []);

  return useMemo(
    () => ({
      gameId,
      bindings,
      defaults: defaultsRef.current,
      pressed,
      press,
      setBinding,
      reset,
      capture,
      startCapture,
      cancelCapture,
    }),
    [gameId, bindings, capture, press, setBinding, reset, startCapture, cancelCapture]
  );
}

type EditorProps<A extends string> = {
  controls: GameControls<A>;
  labels: Record<A, string>;
  /** Max keys per action (default 3). */
  maxKeys?: number;
};

/** Desktop-only editor. Renders nothing on mobile. */
export function KeybindEditor<A extends string>({ controls, labels, maxKeys = 3 }: EditorProps<A>) {
  const [open, setOpen] = useState(false);
  const actions = Object.keys(controls.bindings) as A[];

  return (
    <div className="hidden md:block">
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Keyboard className="mr-1.5 h-3.5 w-3.5" />
          {open ? "Hide controls" : "Customize keys"}
        </Button>
        {open && (
          <Button size="sm" variant="ghost" onClick={controls.reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>
      {open && (
        <Card className="mt-2 p-3 animate-fade-in">
          <div className="space-y-2">
            {actions.map((action) => {
              const keys = controls.bindings[action] ?? [];
              return (
                <div key={action} className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{labels[action]}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {keys.map((k, i) => {
                      const capturing =
                        controls.capture?.action === action && controls.capture.index === i;
                      return (
                        <span key={i} className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant={capturing ? "default" : "secondary"}
                            className="h-7 min-w-14 px-2 font-mono text-xs"
                            onClick={() => controls.startCapture(action, i)}
                          >
                            {capturing ? "Press key…" : displayKey(k)}
                          </Button>
                          {keys.length > 1 && !capturing && (
                            <button
                              type="button"
                              aria-label="Remove key"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                controls.setBinding(
                                  action,
                                  keys.filter((_, j) => j !== i)
                                )
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {keys.length < maxKeys && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => controls.startCapture(action, keys.length)}
                      >
                        + Add
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Click a key to rebind, then press any key. Esc cancels. Bindings are saved to this device.
          </p>
        </Card>
      )}
    </div>
  );
}

export { displayKey };
