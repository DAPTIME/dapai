// Poly Racer tile-grid track editor.
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { THEMES, drawTrackThumbnail, formatMs, type Season } from "@/lib/polytrack-engine";
import {
  analyzeTrack, autoLevel, isTrackData, validateForPublish, validateName,
  MAX_ELEV, MAX_TILES,
  type TileType, type Tile, type Rot, type TrackData,
} from "@/lib/track-validation";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { createTrack, updateTrack, publishTrack, unpublishTrack, deleteTrack, getMyTrack, listMyTracks } from "@/lib/tracks.functions";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/games/polytrack/editor")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Track Editor — Poly Racer" }] }),
  component: EditorPage,
});

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

type Tool = TileType | "erase";

const TOOLS: { tool: Tool; label: string; icon: string; hint: string }[] = [
  { tool: "straight", label: "Straight", icon: "▮", hint: "Plain road" },
  { tool: "curveL", label: "Left", icon: "↰", hint: "90° left" },
  { tool: "curveR", label: "Right", icon: "↱", hint: "90° right" },
  { tool: "rampUp", label: "Ramp up", icon: "↗", hint: "Climb one level" },
  { tool: "rampDown", label: "Ramp down", icon: "↘", hint: "Drop one level" },
  { tool: "jump", label: "Jump", icon: "⤴", hint: "Kicker — launches the car" },
  { tool: "boost", label: "Boost", icon: "»", hint: "Speed pad" },
  { tool: "checkpoint", label: "Checkpoint", icon: "◆", hint: "Must be driven through" },
  { tool: "start", label: "Start", icon: "S", hint: "One per track" },
  { tool: "finish", label: "Finish", icon: "F", hint: "One per track" },
  { tool: "erase", label: "Erase", icon: "✕", hint: "Remove a piece" },
];

const ROT_LABEL: Record<Rot, string> = { 0: "↓", 1: "→", 2: "↑", 3: "←" };

/** Author time in seconds → the millisecond range the server accepts. */
function clampGoal(seconds: string | number): number {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n)) return 30000;
  return Math.round(Math.max(2, Math.min(600, n)) * 1000);
}

const GRID_W = 16, GRID_H = 13;
const DEFAULT_DATA: TrackData = {
  version: 2,
  tiles: [
    { type: "start", x: 3, z: 9, rot: 1 },
    { type: "straight", x: 4, z: 9, rot: 1 },
    { type: "straight", x: 5, z: 9, rot: 1 },
    { type: "finish", x: 6, z: 9, rot: 1 },
  ],
};

function EditorPage() {
  const { id } = useSearch({ from: "/games/polytrack/editor" });
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("My Track");
  const [season, setSeason] = useState<Season>("spring");
  const [data, setData] = useState<TrackData>(DEFAULT_DATA);
  const [past, setPast] = useState<TrackData[]>([]);
  const [future, setFuture] = useState<TrackData[]>([]);
  const [goalText, setGoalText] = useState("30");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tool, setTool] = useState<Tool>("straight");
  const [rot, setRot] = useState<Rot>(1);
  const [elev, setElev] = useState(0);
  const [myTracks, setMyTracks] = useState<Awaited<ReturnType<typeof listMyTracks>>>([]);

  const fetchMine = useServerFn(listMyTracks);
  const fetchTrack = useServerFn(getMyTrack);
  const create = useServerFn(createTrack);
  const update = useServerFn(updateTrack);
  const publish = useServerFn(publishTrack);
  const unpublish = useServerFn(unpublishTrack);
  const remove = useServerFn(deleteTrack);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  useEffect(() => {
    if (!userId) return;
    fetchMine({}).then((rows) => setMyTracks(rows)).catch(() => {});
  }, [userId, fetchMine, saving]);

  useEffect(() => {
    if (!id || !userId) { setLoading(false); return; }
    setLoading(true);
    fetchTrack({ data: { id } })
      .then((row) => {
        setName(row.name);
        setSeason(row.season as Season);
        setGoalText((row.goal / 1000).toString());
        setIsPublic(row.is_public);
        setPast([]); setFuture([]);
        if (isTrackData(row.params)) setData(row.params as TrackData);
        else { setData(DEFAULT_DATA); toast.warning("This is a legacy track. Rebuild it in the new editor to save."); }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, userId, fetchTrack]);

  const commit = useCallback((next: TrackData | ((prev: TrackData) => TrackData)) => {
    setData((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value === prev) return prev;
      setPast((p) => [...p.slice(-59), prev]);
      setFuture([]);
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setData((cur) => { setFuture((f) => [cur, ...f.slice(0, 59)]); return prev; });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setData((cur) => { setPast((p) => [...p, cur]); return next; });
      return f.slice(1);
    });
  }, []);

  const tileMap = useMemo(() => {
    const m = new Map<string, Tile>();
    for (const t of data.tiles) m.set(`${t.x},${t.z}`, t);
    return m;
  }, [data]);

  const report = useMemo(() => analyzeTrack(data), [data]);
  const goal = clampGoal(goalText);

  const placeTile = useCallback((x: number, z: number, forceTool?: Tool) => {
    const active = forceTool ?? tool;
    commit((prev) => {
      if (active === "erase") {
        if (!prev.tiles.some((t) => t.x === x && t.z === z)) return prev;
        return { version: 2, tiles: prev.tiles.filter((t) => !(t.x === x && t.z === z)) };
      }
      if (prev.tiles.length >= MAX_TILES && !prev.tiles.some((t) => t.x === x && t.z === z)) {
        return prev;
      }
      const existing = prev.tiles.find((t) => t.x === x && t.z === z);
      let tiles = prev.tiles.filter((t) => !(t.x === x && t.z === z));
      // Start and finish are unique — placing a new one moves it.
      if (active === "start") tiles = tiles.filter((t) => t.type !== "start");
      if (active === "finish") tiles = tiles.filter((t) => t.type !== "finish");
      // Clicking an identical piece spins it instead of replacing it.
      if (existing && existing.type === active && existing.rot === rot && (existing.elev ?? 0) === elev) {
        tiles.push({ ...existing, rot: (((existing.rot + 1) % 4) as Rot) });
      } else {
        tiles.push({ type: active, x, z, rot, elev: elev || undefined });
      }
      return { version: 2, tiles };
    });
  }, [commit, tool, rot, elev]);

  // Keyboard shortcuts — number keys pick a piece, Q/E spin it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const t = TOOLS[Number(e.key) - 1];
        if (t) setTool(t.tool);
      } else if (e.key.toLowerCase() === "q") setRot((r) => (((r + 3) % 4) as Rot));
      else if (e.key.toLowerCase() === "e") setRot((r) => (((r + 1) % 4) as Rot));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (userId === undefined) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (userId === null) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card/40 p-6 text-center">
        <h1 className="text-xl font-bold">Sign in to build tracks</h1>
        <p className="mt-2 text-sm text-muted-foreground">Track building and publishing needs an account.</p>
        <Link to="/login" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in</Link>
      </div>
    );
  }

  const save = async () => {
    const nameErr = validateName(name);
    if (nameErr) { toast.error(nameErr); return; }
    if (report.error) { toast.error(report.error); return; }
    setSaving(true);
    try {
      if (id) {
        await update({ data: { id, name, season, params: data, goal } });
        toast.success("Saved. Republish when ready.");
        setIsPublic(false);
      } else {
        const { id: newId } = await create({ data: { name, season, params: data, goal } });
        toast.success("Track saved.");
        navigate({ to: "/games/polytrack/editor", search: { id: newId } });
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const doPublish = async () => {
    if (!id) { toast.error("Save first."); return; }
    const err = validateForPublish(name, data);
    if (err) { toast.error(err); return; }
    if (report.warning && !confirm(`${report.warning}\n\nPublish anyway?`)) return;
    try { await publish({ data: { id } }); setIsPublic(true); toast.success("Track is public!"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const doUnpublish = async () => { if (!id) return; await unpublish({ data: { id } }); setIsPublic(false); toast.success("Unpublished."); };
  const doDelete = async () => {
    if (!id) return;
    if (!confirm("Delete this track?")) return;
    await remove({ data: { id } });
    navigate({ to: "/games/polytrack/editor", search: {} });
    setData(DEFAULT_DATA); setPast([]); setFuture([]); setName("My Track"); setIsPublic(false);
  };
  const share = async () => {
    if (!id) return;
    const url = `${window.location.origin}/games/polytrack/track/${id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); }
    catch { toast.info(url); }
  };

  if (testing) {
    return (
      <div>
        <div className="mx-auto mb-2 flex max-w-4xl justify-end">
          <Button size="sm" variant="secondary" onClick={() => setTesting(false)}>← Back to editor</Button>
        </div>
        <PolyTrackRunner
          data={data}
          season={season}
          goal={goal}
          title={`${name} (test drive)`}
          trackRef={id ? `custom:${id}` : undefined}
          onExit={() => setTesting(false)}
          exitLabel="Editor"
        />
      </div>
    );
  }

  const nameErr = validateName(name);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 animate-fade-in lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">✏️ Track Editor</h1>
          <Link to="/games/polytrack" className="text-sm text-muted-foreground hover:text-foreground">← Poly Racer</Link>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {TOOLS.map((t, i) => (
            <button
              key={t.tool}
              onClick={() => setTool(t.tool)}
              title={`${t.hint}${i < 9 ? ` (${i + 1})` : ""}`}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                tool === t.tool ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Facing</span>
            {([0, 1, 2, 3] as Rot[]).map((r) => (
              <button
                key={r}
                onClick={() => setRot(r)}
                className={`h-7 w-7 rounded border text-sm ${rot === r ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {ROT_LABEL[r]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Height</span>
            <input
              type="number" min={0} max={MAX_ELEV} value={elev}
              onChange={(e) => setElev(Math.max(0, Math.min(MAX_ELEV, Number(e.target.value) || 0)))}
              className="w-14 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={undo} disabled={past.length === 0}>↶ Undo</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={redo} disabled={future.length === 0}>↷ Redo</Button>
          <Button
            size="sm" variant="ghost" className="h-7 px-2"
            onClick={() => { commit(autoLevel(data)); toast.success("Heights levelled along the track."); }}
          >
            ⛰ Auto-level
          </Button>
          <span className="ml-auto text-muted-foreground">
            {data.tiles.length}/{MAX_TILES} pieces · drag to paint · right-click erases · Q/E rotate
          </span>
        </div>

        <GridEditor width={GRID_W} height={GRID_H} tileMap={tileMap} onPaint={placeTile} />

        {report.error && <p className="mt-2 text-xs font-medium text-destructive">⚠ {report.error}</p>}
        {!report.error && report.warning && (
          <p className="mt-2 text-xs font-medium text-amber-500">⚠ {report.warning}</p>
        )}
        {!report.error && !report.warning && (
          <p className="mt-2 text-xs text-emerald-500">
            ✓ Drivable — {report.walk.path.length} pieces from start to finish, {report.walk.checkpoints.length} checkpoint(s).
          </p>
        )}
        {loading && <p className="mt-2 text-sm text-muted-foreground">Loading track…</p>}
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex gap-3">
            <ThumbCanvas data={data} season={season} />
            <div className="grid flex-1 grid-cols-1 gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {LEGEND.map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          {nameErr && <p className="mt-1 text-xs text-destructive">{nameErr}</p>}
        </div>
        <div>
          <Label>Season</Label>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {SEASONS.map((s) => (
              <button key={s} onClick={() => setSeason(s)} title={THEMES[s].label}
                className={`rounded-md border px-2 py-1 text-sm ${season === s ? "border-primary bg-primary/10" : "border-border"}`}>
                {THEMES[s].emoji}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Author medal time</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number" min={2} max={600} step={0.5}
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              onBlur={() => setGoalText((clampGoal(goalText) / 1000).toString())}
            />
            <span className="text-sm text-muted-foreground">sec</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Gold {formatMs(goal * 1.2)} · Silver {formatMs(goal * 1.5)} · Bronze {formatMs(goal * 2)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving || !!report.error}>{id ? "Save" : "Create"}</Button>
          <Button variant="secondary" onClick={() => setTesting(true)} disabled={!!report.error}>🏁 Test drive</Button>
          {id && !isPublic && <Button variant="outline" onClick={doPublish}>Publish</Button>}
          {id && isPublic && <Button variant="outline" onClick={doUnpublish}>Unpublish</Button>}
          {id && <Button variant="ghost" onClick={share}>Copy link</Button>}
          {id && <Button variant="ghost" className="text-destructive" onClick={doDelete}>Delete</Button>}
        </div>
        {id && (
          <p className="text-xs text-muted-foreground">
            {isPublic ? "🌐 Public." : "🔒 Private. Editing a public track unpublishes it."}
          </p>
        )}

        <div className="pt-4">
          <h3 className="mb-2 text-sm font-semibold">Your tracks</h3>
          {myTracks.length === 0 && <p className="text-xs text-muted-foreground">No tracks yet.</p>}
          <div className="space-y-1">
            {myTracks.map((t) => (
              <button key={t.id} onClick={() => navigate({ to: "/games/polytrack/editor", search: { id: t.id } })}
                className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm hover:border-primary ${t.id === id ? "border-primary bg-primary/5" : "border-border"}`}>
                <span className="truncate">{THEMES[t.season as Season].emoji} {t.name}</span>
                <span className="text-xs text-muted-foreground">{t.is_public ? "🌐" : "🔒"}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              navigate({ to: "/games/polytrack/editor", search: {} });
              setName("New Track"); setData(DEFAULT_DATA); setPast([]); setFuture([]); setIsPublic(false);
            }}
            className="mt-2 w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            + New track
          </button>
        </div>
      </div>
    </div>
  );
}

function GridEditor({ width, height, tileMap, onPaint }: {
  width: number; height: number;
  tileMap: Map<string, Tile>;
  onPaint: (x: number, z: number, forceTool?: Tool) => void;
}) {
  const cellSize = 32;
  // Painting is pointer-driven so a drag lays a whole run of road.
  const painting = useRef<Tool | null>(null);

  useEffect(() => {
    const stop = () => { painting.current = null; };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  return (
    <div
      className="relative overflow-auto rounded-lg border border-border bg-muted/20 p-2"
      onContextMenu={(e) => e.preventDefault()}
    >
        <div className="grid w-max" style={{ gridTemplateColumns: `repeat(${width}, ${cellSize}px)` }}>
          {Array.from({ length: width * height }).map((_, i) => {
            const x = i % width;
            const z = Math.floor(i / width);
            const t = tileMap.get(`${x},${z}`);
            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  const erase = e.button === 2 || e.ctrlKey;
                  painting.current = erase ? "erase" : null;
                  onPaint(x, z, erase ? "erase" : undefined);
                }}
                onPointerEnter={(e) => {
                  if (e.buttons === 0) return;
                  onPaint(x, z, painting.current ?? undefined);
                }}
                onContextMenu={(e) => e.preventDefault()}
                className="relative border border-border/40 bg-background/40 transition-colors hover:bg-primary/10"
                style={{ width: cellSize, height: cellSize }}
                aria-label={`Tile ${x},${z}`}
              >
                {t && <TileIcon tile={t} />}
              </button>
            );
          })}
        </div>
    </div>
  );
}

const LEGEND: Array<[string, string]> = [
  ["#22c55e", "Start"], ["#ef4444", "Finish"], ["#3b82f6", "Checkpoint"],
  ["#06b6d4", "Boost"], ["#a855f7", "Ramp"], ["#c026d3", "Jump"],
];

const TILE_COLOR: Record<TileType, string> = {
  start: "#22c55e",
  finish: "#ef4444",
  checkpoint: "#3b82f6",
  boost: "#06b6d4",
  rampUp: "#a855f7",
  rampDown: "#a855f7",
  jump: "#c026d3",
  curveL: "#64748b",
  curveR: "#64748b",
  straight: "#94a3b8",
};

const TILE_GLYPH: Record<TileType, string> = {
  straight: "▮", curveL: "↰", curveR: "↱", rampUp: "↗", rampDown: "↘",
  jump: "⤴", boost: "»", checkpoint: "◆", start: "S", finish: "F",
};

function TileIcon({ tile }: { tile: Tile }) {
  const elev = tile.elev ?? 0;
  return (
    <span
      className="absolute inset-0 grid place-items-center text-sm font-bold text-white"
      style={{
        backgroundColor: TILE_COLOR[tile.type],
        // The grid's +z runs down the screen, so a +rot turn reads clockwise.
        transform: `rotate(${tile.rot * 90}deg)`,
        transition: "transform 0.12s",
      }}
      title={`${tile.type} facing ${ROT_LABEL[tile.rot]}${elev ? ` · height ${elev}` : ""}`}
    >
      {TILE_GLYPH[tile.type]}
      {elev > 0 && (
        <span
          className="absolute right-0 top-0 rounded-bl bg-black/60 px-0.5 text-[9px] leading-tight"
          style={{ transform: `rotate(${-tile.rot * 90}deg)` }}
        >
          {elev}
        </span>
      )}
    </span>
  );
}

function ThumbCanvas({ data, season }: { data: TrackData; season: Season }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 150, h = 150;
    node.width = w * dpr; node.height = h * dpr;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrackThumbnail(ctx, data, season, w, h);
  }, [data, season]);
  return <canvas ref={ref} style={{ width: 150, height: 150 }} className="rounded border border-border" />;
}
