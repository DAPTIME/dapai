// DAP Track tile-grid editor.
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { THEMES, drawTrackThumbnail, type Season } from "@/lib/polytrack-engine";
import {
  isTrackData, validateForPublish, validateName, validateTrack,
  type TileType, type Tile, type Rot, type TrackData,
} from "@/lib/track-validation";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { createTrack, updateTrack, publishTrack, unpublishTrack, deleteTrack, getMyTrack, listMyTracks } from "@/lib/tracks.functions";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/games/polytrack/editor")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "DAP Track Editor" }] }),
  component: EditorPage,
});

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
const TILE_TYPES: { type: TileType; label: string; icon: string }[] = [
  { type: "straight", label: "Straight", icon: "▮" },
  { type: "curveL", label: "Curve L", icon: "↰" },
  { type: "curveR", label: "Curve R", icon: "↱" },
  { type: "rampUp", label: "Ramp Up", icon: "↗" },
  { type: "rampDown", label: "Ramp Down", icon: "↘" },
  { type: "checkpoint", label: "Checkpoint", icon: "◆" },
  { type: "start", label: "Start", icon: "S" },
  { type: "finish", label: "Finish", icon: "F" },
];

const GRID_W = 12, GRID_H = 10;
const DEFAULT_DATA: TrackData = {
  version: 2,
  tiles: [
    { type: "start", x: 3, z: 8, rot: 1 },
    { type: "straight", x: 4, z: 8, rot: 1 },
    { type: "straight", x: 5, z: 8, rot: 1 },
    { type: "finish", x: 6, z: 8, rot: 1 },
  ],
};

function EditorPage() {
  const { id } = useSearch({ from: "/games/polytrack/editor" });
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("My Track");
  const [season, setSeason] = useState<Season>("spring");
  const [data, setData] = useState<TrackData>(DEFAULT_DATA);
  const [goal, setGoal] = useState(30000);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tool, setTool] = useState<TileType>("straight");
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
        setGoal(row.goal);
        setIsPublic(row.is_public);
        if (isTrackData(row.params)) setData(row.params as TrackData);
        else { setData(DEFAULT_DATA); toast.warning("This is a legacy track. Rebuild it in the new editor to save."); }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, userId, fetchTrack]);

  const tileMap = useMemo(() => {
    const m = new Map<string, Tile>();
    for (const t of data.tiles) m.set(`${t.x},${t.z}`, t);
    return m;
  }, [data]);

  const paramErr = validateTrack(data);
  const nameErr = validateName(name);

  if (userId === undefined) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (userId === null) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card/40 p-6 text-center">
        <h1 className="text-xl font-bold">Sign in to build tracks</h1>
        <Link to="/login" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in</Link>
      </div>
    );
  }

  const placeTile = (x: number, z: number) => {
    setData((prev) => {
      const existing = prev.tiles.find((t) => t.x === x && t.z === z);
      let tiles = prev.tiles.filter((t) => !(t.x === x && t.z === z));
      // Enforce single start/finish
      if (tool === "start") tiles = tiles.filter((t) => t.type !== "start");
      if (tool === "finish") tiles = tiles.filter((t) => t.type !== "finish");
      const newTile: Tile = { type: tool, x, z, rot, elev: elev || undefined };
      // If click same tile with same type and rot, rotate instead
      if (existing && existing.type === tool && existing.rot === rot) {
        const nextRot = (((existing.rot + 1) % 4) as Rot);
        tiles.push({ ...existing, rot: nextRot });
      } else {
        tiles.push(newTile);
      }
      return { version: 2, tiles };
    });
  };
  const eraseTile = (x: number, z: number) => {
    setData((prev) => ({ version: 2, tiles: prev.tiles.filter((t) => !(t.x === x && t.z === z)) }));
  };

  const save = async () => {
    if (nameErr) { toast.error(nameErr); return; }
    if (paramErr) { toast.error(paramErr); return; }
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
    try { await publish({ data: { id } }); setIsPublic(true); toast.success("Track is public!"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const doUnpublish = async () => { if (!id) return; await unpublish({ data: { id } }); setIsPublic(false); toast.success("Unpublished."); };
  const doDelete = async () => {
    if (!id) return; if (!confirm("Delete this track?")) return;
    await remove({ data: { id } }); navigate({ to: "/games/polytrack/editor", search: {} });
    setData(DEFAULT_DATA); setName("My Track"); setIsPublic(false);
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
        <div className="mx-auto mb-2 flex max-w-3xl justify-end">
          <Button size="sm" variant="secondary" onClick={() => setTesting(false)}>← Back to editor</Button>
        </div>
        <PolyTrackRunner data={data} season={season} goal={goal} title={`${name} (test)`} onExit={() => setTesting(false)} exitLabel="Editor" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 animate-fade-in lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">✏️ DAP Track Editor</h1>
          <Link to="/games/polytrack" className="text-sm text-muted-foreground hover:text-foreground">← DAP Track</Link>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {TILE_TYPES.map((t) => (
            <button key={t.type} onClick={() => setTool(t.type)}
              className={`rounded-md border px-2 py-1 text-xs ${tool === t.type ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">Rot:
            <select value={rot} onChange={(e) => setRot(Number(e.target.value) as Rot)} className="rounded border border-border bg-background px-1 py-0.5">
              <option value={0}>↑</option><option value={1}>→</option><option value={2}>↓</option><option value={3}>←</option>
            </select>
          </label>
          <label className="flex items-center gap-1">Elev:
            <input type="number" min={0} max={4} value={elev} onChange={(e) => setElev(Number(e.target.value))}
              className="w-14 rounded border border-border bg-background px-1 py-0.5" />
          </label>
          <span className="ml-auto text-muted-foreground">Click to place · click same tile to rotate · right-click to erase</span>
        </div>

        <GridEditor width={GRID_W} height={GRID_H} tileMap={tileMap} onPlace={placeTile} onErase={eraseTile} season={season} data={data} />

        {paramErr && <p className="mt-2 text-xs text-destructive">{paramErr}</p>}
        {loading && <p className="mt-2 text-sm text-muted-foreground">Loading track…</p>}
      </div>

      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          {nameErr && <p className="mt-1 text-xs text-destructive">{nameErr}</p>}
        </div>
        <div>
          <Label>Season</Label>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {SEASONS.map((s) => (
              <button key={s} onClick={() => setSeason(s)}
                className={`rounded-md border px-2 py-1 text-sm ${season === s ? "border-primary bg-primary/10" : "border-border"}`}>
                {THEMES[s].emoji}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Target time (ms)</Label>
          <Input type="number" min={2000} max={600000} value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving}>{id ? "Save" : "Create"}</Button>
          <Button variant="secondary" onClick={() => setTesting(true)} disabled={!!paramErr}>Test drive</Button>
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
          <button onClick={() => { navigate({ to: "/games/polytrack/editor", search: {} }); setName("New Track"); setData(DEFAULT_DATA); setIsPublic(false); }}
            className="mt-2 w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            + New track
          </button>
        </div>
      </div>
    </div>
  );
}

function GridEditor({ width, height, tileMap, onPlace, onErase, season, data }: {
  width: number; height: number;
  tileMap: Map<string, Tile>;
  onPlace: (x: number, z: number) => void;
  onErase: (x: number, z: number) => void;
  season: Season;
  data: TrackData;
}) {
  const cellSize = 36;
  return (
    <div className="grid grid-cols-[1fr_140px] gap-3">
      <div
        className="relative overflow-auto rounded-lg border border-border bg-muted/20 p-2"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellSize}px)` }}>
          {Array.from({ length: width * height }).map((_, i) => {
            const x = i % width;
            const z = Math.floor(i / width);
            const t = tileMap.get(`${x},${z}`);
            return (
              <button
                key={i}
                onClick={() => onPlace(x, z)}
                onContextMenu={(e) => { e.preventDefault(); onErase(x, z); }}
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
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Preview</div>
        <ThumbCanvas data={data} season={season} />
        <div className="mt-2 text-xs text-muted-foreground">{data.tiles.length} tiles</div>
      </div>
    </div>
  );
}

function TileIcon({ tile }: { tile: Tile }) {
  const rot = `rotate(${tile.rot * 90}deg)`;
  const bg =
    tile.type === "start" ? "#22c55e" :
    tile.type === "finish" ? "#ef4444" :
    tile.type === "checkpoint" ? "#3b82f6" :
    tile.type === "rampUp" || tile.type === "rampDown" ? "#a855f7" :
    tile.type === "curveL" || tile.type === "curveR" ? "#64748b" :
    "#94a3b8";
  const label =
    tile.type === "straight" ? "▮" :
    tile.type === "curveL" ? "↰" :
    tile.type === "curveR" ? "↱" :
    tile.type === "rampUp" ? "↗" :
    tile.type === "rampDown" ? "↘" :
    tile.type === "checkpoint" ? "◆" :
    tile.type === "start" ? "S" : "F";
  return (
    <span
      className="absolute inset-0 grid place-items-center text-sm font-bold text-white"
      style={{ backgroundColor: bg, transform: rot, transition: "transform 0.15s" }}
      title={`${tile.type} rot ${tile.rot}${tile.elev ? ` elev ${tile.elev}` : ""}`}
    >
      {label}
    </span>
  );
}

function ThumbCanvas({ data, season }: { data: TrackData; season: Season }) {
  const ref = (node: HTMLCanvasElement | null) => {
    if (!node) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 140, h = 140;
    node.width = w * dpr; node.height = h * dpr;
    const ctx = node.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrackThumbnail(ctx, data, season, w, h);
  };
  return <canvas ref={ref} style={{ width: 140, height: 140 }} className="rounded border border-border" />;
}
