// DAP Track level editor — pan/zoom canvas, selection tools, real persistence.
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
  analyzeTrack, autoLevel, toTrackData, validateForPublish, validateName,
  MAX_LEVEL, MAX_TILES, TILE_TYPES,
  type TileType, type Rot, type TrackData,
} from "@/lib/track-validation";
import {
  EMPTY_DOC, STARTER_DOC, deleteSelection, duplicateSelection, eraseAt, keyOf,
  moveSelection, placeTile, retypeSelection, rotateSelection, selectedTiles,
  setSelection, updateTile, type EditorDoc,
} from "@/lib/track-editor-model";
import { EditorCanvas, TILE_COLOR, TILE_GLYPH, type EditorTool } from "@/components/track-editor/editor-canvas";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { createTrack, updateTrack, publishTrack, unpublishTrack, deleteTrack, getMyTrack } from "@/lib/tracks.functions";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/games/daptrack/editor")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Track Editor — DAP Track" },
      { name: "description", content: "Build, test, and publish your own DAP Track levels with the tile editor." },
      { property: "og:title", content: "Track Editor — DAP Track" },
      { property: "og:description", content: "Build, test, and publish your own DAP Track levels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorPage,
});

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

const PIECES: { type: TileType; label: string; hint: string }[] = [
  { type: "straight", label: "Straight", hint: "Plain road" },
  { type: "curveL", label: "Left", hint: "90° left" },
  { type: "curveR", label: "Right", hint: "90° right" },
  { type: "rampUp", label: "Ramp up", hint: "Climb one level" },
  { type: "rampDown", label: "Ramp down", hint: "Drop one level" },
  { type: "jump", label: "Jump", hint: "Kicker — launches the car" },
  { type: "boost", label: "Boost", hint: "Speed pad" },
  { type: "checkpoint", label: "Checkpoint", hint: "Must be driven through" },
  { type: "start", label: "Start", hint: "One per track" },
  { type: "finish", label: "Finish", hint: "One per track" },
];

const ROT_LABEL: Record<Rot, string> = { 0: "↓", 1: "→", 2: "↑", 3: "←" };

const TOOL_BUTTONS: { tool: EditorTool; label: string; icon: string; key: string }[] = [
  { tool: "paint", label: "Paint", icon: "🖌", key: "B" },
  { tool: "select", label: "Select", icon: "⬚", key: "V" },
  { tool: "erase", label: "Erase", icon: "✕", key: "X" },
  { tool: "pan", label: "Pan", icon: "✋", key: "H" },
];

/** Author time in seconds → the millisecond range the server accepts. */
function clampGoal(seconds: string | number): number {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n)) return 30000;
  return Math.round(Math.max(2, Math.min(600, n)) * 1000);
}

const fingerprint = (d: TrackData, name: string, season: string, goal: number) =>
  JSON.stringify([name.trim(), season, goal, [...d.tiles].map((t) => [t.type, t.x, t.y, t.z, t.rot]).sort()]);

function EditorPage() {
  const { id } = useSearch({ from: "/games/daptrack/editor" });
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("My Track");
  const [season, setSeason] = useState<Season>("spring");
  const [goalText, setGoalText] = useState("30");
  const [isPublic, setIsPublic] = useState(false);

  const [doc, setDoc] = useState<EditorDoc>(STARTER_DOC);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);

  const [tool, setTool] = useState<EditorTool>("paint");
  const [activeType, setActiveType] = useState<TileType>("straight");
  const [rot, setRot] = useState<Rot>(1);
  const [level, setLevel] = useState(0);
  const [showGhosts, setShowGhosts] = useState(true);

  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedMark, setSavedMark] = useState<string | null>(null);

  const fetchTrack = useServerFn(getMyTrack);
  const create = useServerFn(createTrack);
  const update = useServerFn(updateTrack);
  const publish = useServerFn(publishTrack);
  const unpublish = useServerFn(unpublishTrack);
  const remove = useServerFn(deleteTrack);

  const goal = clampGoal(goalText);
  const data = doc.data;
  const report = useMemo(() => analyzeTrack(data), [data]);
  const nameErr = validateName(name);
  const mark = fingerprint(data, name, season, goal);
  const dirty = savedMark !== null ? savedMark !== mark : true;

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);

  /* ── load ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    if (!id) {
      setDoc(STARTER_DOC); setPast([]); setFuture([]);
      setName("My Track"); setSeason("spring"); setGoalText("30"); setIsPublic(false);
      setSavedMark(null); setLoading(false);
      return;
    }
    setLoading(true);
    fetchTrack({ data: { id } })
      .then((row) => {
        const parsed = toTrackData(row.params);
        setName(row.name);
        setSeason(row.season as Season);
        setGoalText((row.goal / 1000).toString());
        setIsPublic(row.is_public);
        setPast([]); setFuture([]);
        if (parsed) {
          setDoc({ data: parsed, selection: [] });
          setSavedMark(fingerprint(parsed, row.name, row.season, row.goal));
        } else {
          setDoc(EMPTY_DOC);
          setSavedMark(null);
          toast.warning("This is a legacy track. Rebuild it in the new editor to save.");
        }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, userId, fetchTrack]);

  /* ── history ────────────────────────────────────────────────────── */
  const commit = useCallback((fn: (prev: EditorDoc) => EditorDoc) => {
    setDoc((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      // Selection-only changes shouldn't burn an undo step.
      if (next.data === prev.data) return next;
      setPast((p) => [...p.slice(-79), prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      setDoc((cur) => { setFuture((f) => [cur, ...f.slice(0, 79)]); return prev; });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0]!;
      setDoc((cur) => { setPast((p) => [...p, cur]); return next; });
      return f.slice(1);
    });
  }, []);

  /* ── mutations ──────────────────────────────────────────────────── */
  const handlePaint = useCallback(
    (x: number, z: number) => commit((d) => placeTile(d, x, z, level, activeType, rot)),
    [commit, level, activeType, rot]
  );
  const handleErase = useCallback(
    (x: number, z: number) => commit((d) => eraseAt(d, x, z, level)),
    [commit, level]
  );
  const handleSelect = useCallback(
    (keys: string[], additive: boolean) =>
      setDoc((d) => setSelection(d, additive ? Array.from(new Set([...d.selection, ...keys])) : keys)),
    []
  );
  const handleMove = useCallback((dx: number, dz: number) => commit((d) => moveSelection(d, dx, dz)), [commit]);

  const selection = useMemo(() => selectedTiles(doc), [doc]);
  const single = selection.length === 1 ? selection[0]! : null;

  /* ── save / publish ─────────────────────────────────────────────── */
  const save = useCallback(async (): Promise<string | null> => {
    const err = validateName(name);
    if (err) { toast.error(err); return null; }
    if (report.error) { toast.error(report.error); return null; }
    setSaving(true);
    try {
      if (id) {
        await update({ data: { id, name, season, params: data, goal } });
        setIsPublic(false);
        setSavedMark(fingerprint(data, name, season, goal));
        toast.success("Saved. Republish when ready.");
        return id;
      }
      const { id: newId } = await create({ data: { name, season, params: data, goal } });
      setSavedMark(fingerprint(data, name, season, goal));
      toast.success("Track created.");
      navigate({ to: "/games/daptrack/editor", search: { id: newId } });
      return newId;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [id, name, season, data, goal, report.error, create, update, navigate]);

  const doPublish = async () => {
    let target = id;
    if (dirty || !target) {
      const saved = await save();
      if (!saved) return;
      target = saved;
    }
    const err = validateForPublish(name, data);
    if (err) { toast.error(err); return; }
    if (report.warning && !confirm(`${report.warning}\n\nPublish anyway?`)) return;
    try {
      await publish({ data: { id: target } });
      setIsPublic(true);
      toast.success("Track is public!");
    } catch (e) { toast.error((e as Error).message); }
  };

  const doUnpublish = async () => {
    if (!id) return;
    try { await unpublish({ data: { id } }); setIsPublic(false); toast.success("Unpublished."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const doDelete = async () => {
    if (!id) return;
    if (!confirm("Delete this track? This cannot be undone.")) return;
    try {
      await remove({ data: { id } });
      toast.success("Track deleted.");
      navigate({ to: "/games/daptrack/browse" });
    } catch (e) { toast.error((e as Error).message); }
  };

  const share = async () => {
    if (!id) { toast.error("Save the track first."); return; }
    const url = `${window.location.origin}/games/daptrack/track/${id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); }
    catch { toast.info(url); }
  };

  /* ── keyboard shortcuts ─────────────────────────────────────────── */
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "s") { e.preventDefault(); void saveRef.current(); return; }
      if (mod && k === "d") { e.preventDefault(); commit((d) => duplicateSelection(d)); return; }
      if (mod && k === "a") {
        e.preventDefault();
        setDoc((d) => setSelection(d, d.data.tiles.filter((t) => t.y === level).map(keyOf)));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); commit(deleteSelection); return; }
      if (e.key === "Escape") { setDoc((d) => setSelection(d, [])); return; }

      if (e.key >= "1" && e.key <= "9") { const p = PIECES[Number(e.key) - 1]; if (p) { setActiveType(p.type); setTool("paint"); } return; }
      if (e.key === "0") { setActiveType("finish"); setTool("paint"); return; }
      if (k === "b") { setTool("paint"); return; }
      if (k === "v") { setTool("select"); return; }
      if (k === "x") { setTool("erase"); return; }
      if (k === "h") { setTool("pan"); return; }
      if (k === "q" || k === "e") {
        const step = k === "e" ? 1 : -1;
        if (doc.selection.length > 0) commit((d) => rotateSelection(d, step));
        else setRot((r) => (((r + (step === 1 ? 1 : 3)) % 4) as Rot));
        return;
      }
      if (e.key === "[") { setLevel((l) => Math.max(0, l - 1)); return; }
      if (e.key === "]") { setLevel((l) => Math.min(MAX_LEVEL, l + 1)); return; }
      if (e.key.startsWith("Arrow") && doc.selection.length > 0) {
        e.preventDefault();
        const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        const dz = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        commit((d) => moveSelection(d, dx, dz));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, commit, doc.selection.length, level]);

  /* ── unsaved-work guard ─────────────────────────────────────────── */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

  return (
    <div className="mx-auto grid max-w-7xl gap-5 animate-fade-in lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">✏️ Track Editor</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading track…" : id ? (dirty ? "Unsaved changes" : "All changes saved") : "New track"}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link to="/games/daptrack/browse" className="rounded-lg border border-border px-3 py-1.5 hover:border-primary">Levels</Link>
            <Link to="/games/daptrack" className="rounded-lg border border-border px-3 py-1.5 hover:border-primary">← DAP Track</Link>
          </div>
        </div>

        {/* Tools */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {TOOL_BUTTONS.map((t) => (
            <button
              key={t.tool}
              onClick={() => setTool(t.tool)}
              title={`${t.label} (${t.key})`}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                tool === t.tool ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={undo} disabled={past.length === 0}>↶ Undo</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={redo} disabled={future.length === 0}>↷ Redo</Button>
          <Button
            size="sm" variant="ghost" className="h-7 px-2"
            onClick={() => { commit((d) => ({ data: autoLevel(d.data), selection: [] })); toast.success("Heights levelled along the track."); }}
          >⛰ Auto-level</Button>
          <button
            onClick={() => setShowGhosts((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs ${showGhosts ? "border-primary bg-primary/10" : "border-border"}`}
            title="Show pieces on other levels"
          >👁 Other levels</button>
        </div>

        {/* Pieces */}
        <div className="mb-2 flex flex-wrap gap-1">
          {PIECES.map((p, i) => (
            <button
              key={p.type}
              onClick={() => {
                if (doc.selection.length > 0 && tool === "select") commit((d) => retypeSelection(d, p.type));
                else { setActiveType(p.type); setTool("paint"); }
              }}
              title={`${p.hint} (${i === 9 ? 0 : i + 1})`}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                activeType === p.type && tool === "paint" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="grid h-4 w-4 place-items-center rounded-sm text-[10px] font-bold text-white" style={{ backgroundColor: TILE_COLOR[p.type] }}>
                {TILE_GLYPH[p.type]}
              </span>
              {p.label}
            </button>
          ))}
        </div>

        {/* Facing + level */}
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Facing</span>
            {([0, 1, 2, 3] as Rot[]).map((r) => (
              <button key={r} onClick={() => setRot(r)}
                className={`h-7 w-7 rounded border text-sm ${rot === r ? "border-primary bg-primary/10" : "border-border"}`}>
                {ROT_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Level</span>
            <button className="h-7 w-7 rounded border border-border disabled:opacity-40"
              onClick={() => setLevel((l) => Math.max(0, l - 1))} disabled={level === 0}>−</button>
            <span className="w-6 text-center font-semibold tabular-nums">{level}</span>
            <button className="h-7 w-7 rounded border border-border disabled:opacity-40"
              onClick={() => setLevel((l) => Math.min(MAX_LEVEL, l + 1))} disabled={level === MAX_LEVEL}>+</button>
          </div>
          <span className="text-muted-foreground">{data.tiles.length}/{MAX_TILES} pieces</span>
          {doc.selection.length > 0 && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{doc.selection.length} selected</span>
          )}
        </div>

        <EditorCanvas
          data={data}
          level={level}
          selection={doc.selection}
          tool={tool}
          activeType={activeType}
          rot={rot}
          showGhosts={showGhosts}
          onPaint={handlePaint}
          onErase={handleErase}
          onSelect={handleSelect}
          onMoveSelection={handleMove}
        />

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Wheel zooms · space or middle-drag pans · right-drag erases · <b>V</b> select, drag to marquee, arrows nudge,
          Ctrl+D duplicate, Del remove · <b>Q/E</b> rotate · <b>[ ]</b> change level · <b>Ctrl+S</b> save
        </p>

        {report.error && <p className="mt-2 text-xs font-medium text-destructive">⚠ {report.error}</p>}
        {!report.error && report.warning && <p className="mt-2 text-xs font-medium text-amber-500">⚠ {report.warning}</p>}
        {!report.error && !report.warning && (
          <p className="mt-2 text-xs text-emerald-500">
            ✓ Drivable — {report.walk.path.length} pieces from start to finish, {report.walk.checkpoints.length} checkpoint(s).
          </p>
        )}
      </div>

      {/* Inspector */}
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

        {/* Selection properties */}
        {doc.selection.length > 0 && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {single ? "Piece" : `${doc.selection.length} pieces`}
              </h3>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDoc((d) => setSelection(d, []))}>clear</button>
            </div>
            {single && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <select
                    value={single.type}
                    onChange={(e) => commit((d) => updateTile(d, keyOf(single), { type: e.target.value as TileType }))}
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {TILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["x", "z", "y"] as const).map((axis) => (
                    <div key={axis}>
                      <Label className="text-xs">{axis === "y" ? "level" : axis}</Label>
                      <Input
                        className="h-8"
                        type="number"
                        value={single[axis]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          commit((d) => updateTile(d, keyOf(single), { [axis]: v } as Record<string, number>));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => commit((d) => rotateSelection(d, 1))}>↻ Rotate</Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => commit((d) => duplicateSelection(d))}>⧉ Duplicate</Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => commit((d) => moveSelection(d, 0, 0, 1))} disabled={level >= MAX_LEVEL}>▲ Level up</Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => commit((d) => moveSelection(d, 0, 0, -1))}>▼ Level down</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => commit(deleteSelection)}>Delete</Button>
            </div>
          </div>
        )}

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

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => void save()} disabled={saving || !!report.error || !dirty}>
            {saving ? "Saving…" : id ? "Save" : "Create"}
          </Button>
          <Button variant="secondary" onClick={() => setTesting(true)} disabled={!!report.error}>🏁 Test drive</Button>
          {!isPublic && <Button variant="outline" onClick={doPublish}>Publish</Button>}
          {id && isPublic && <Button variant="outline" onClick={doUnpublish}>Unpublish</Button>}
          {id && <Button variant="ghost" onClick={share}>Copy link</Button>}
          {id && <Button variant="ghost" className="text-destructive" onClick={doDelete}>Delete</Button>}
        </div>
        {id && (
          <p className="text-xs text-muted-foreground">
            {isPublic ? "🌐 Public — anyone with the link can race it." : "🔒 Private. Editing a public track unpublishes it."}
          </p>
        )}
        <Link
          to="/games/daptrack/editor"
          search={{}}
          className="block rounded-md border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground hover:border-primary hover:text-foreground"
        >
          + Start a new track
        </Link>
      </div>
    </div>
  );
}

const LEGEND: Array<[string, string]> = [
  ["#22c55e", "Start"], ["#ef4444", "Finish"], ["#3b82f6", "Checkpoint"],
  ["#06b6d4", "Boost"], ["#a855f7", "Ramp"], ["#c026d3", "Jump"],
];

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
