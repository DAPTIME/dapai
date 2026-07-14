import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { drawPreview, THEMES, W, H, type Season } from "@/lib/polytrack-engine";
import { validateForPublish, validateName, validateParams, type TrackParams } from "@/lib/track-validation";
import {
  createTrack,
  updateTrack,
  publishTrack,
  unpublishTrack,
  deleteTrack,
  getMyTrack,
  listMyTracks,
} from "@/lib/tracks.functions";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/games/polytrack/editor")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Poly Racer Editor — DAP AI" }] }),
  component: EditorPage,
});

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

const DEFAULT_PARAMS: TrackParams = {
  amp1: 60, freq1: 0.006, amp2: 20, freq2: 0.018, half: 90, phase: 1.2,
};

function EditorPage() {
  const { id } = useSearch({ from: "/games/polytrack/editor" });
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("My Track");
  const [season, setSeason] = useState<Season>("spring");
  const [params, setParams] = useState<TrackParams>(DEFAULT_PARAMS);
  const [goal, setGoal] = useState(1000);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [myTracks, setMyTracks] = useState<Awaited<ReturnType<typeof listMyTracks>>>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchMine = useServerFn(listMyTracks);
  const fetchTrack = useServerFn(getMyTrack);
  const create = useServerFn(createTrack);
  const update = useServerFn(updateTrack);
  const publish = useServerFn(publishTrack);
  const unpublish = useServerFn(unpublishTrack);
  const remove = useServerFn(deleteTrack);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

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
        setParams(row.params as unknown as TrackParams);
        setGoal(row.goal);
        setIsPublic(row.is_public);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, userId, fetchTrack]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    drawPreview(ctx, params, season, goal);
  }, [params, season, goal]);

  const paramErr = validateParams(params, goal);
  const nameErr = validateName(name);

  if (userId === undefined) return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">Loading…</div>;
  if (userId === null) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card/40 p-6 text-center">
        <h1 className="text-xl font-bold">Sign in to build tracks</h1>
        <p className="mt-2 text-sm text-muted-foreground">The editor saves your levels to your account.</p>
        <Link to="/login" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in</Link>
      </div>
    );
  }

  const save = async () => {
    if (nameErr) { toast.error(nameErr); return; }
    if (paramErr) { toast.error(paramErr); return; }
    setSaving(true);
    try {
      if (id) {
        await update({ data: { id, name, season, params, goal } });
        toast.success("Saved. Publishing status reset — republish when ready.");
        setIsPublic(false);
      } else {
        const { id: newId } = await create({ data: { name, season, params, goal } });
        toast.success("Track saved.");
        navigate({ to: "/games/polytrack/editor", search: { id: newId } });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    if (!id) { toast.error("Save the track first."); return; }
    const err = validateForPublish(name, params, goal);
    if (err) { toast.error(err); return; }
    try {
      await publish({ data: { id } });
      setIsPublic(true);
      toast.success("Track is now public!");
    } catch (e) { toast.error((e as Error).message); }
  };

  const doUnpublish = async () => {
    if (!id) return;
    try { await unpublish({ data: { id } }); setIsPublic(false); toast.success("Track unpublished."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const doDelete = async () => {
    if (!id) return;
    if (!confirm("Delete this track? This cannot be undone.")) return;
    try {
      await remove({ data: { id } });
      toast.success("Deleted.");
      navigate({ to: "/games/polytrack/editor", search: {} });
      setName("My Track"); setSeason("spring"); setParams(DEFAULT_PARAMS); setGoal(1000); setIsPublic(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const share = async () => {
    if (!id) return;
    const url = `${window.location.origin}/games/polytrack/track/${id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); }
    catch { toast.info(url); }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 animate-fade-in lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">✏️ Level Editor</h1>
          <Link to="/games/polytrack" className="text-sm text-muted-foreground hover:text-foreground">← Poly Racer</Link>
        </div>
        <div className="relative">
          <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-xl border border-border" />
          <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
            Preview
          </div>
        </div>
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
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`rounded-md border px-2 py-1 text-sm ${season === s ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {THEMES[s].emoji}
              </button>
            ))}
          </div>
        </div>

        <SliderRow label="Goal length" value={goal} min={400} max={3000} step={50} onChange={setGoal} />
        <SliderRow label="Road width" value={params.half} min={55} max={110} step={1} onChange={(v) => setParams((p) => ({ ...p, half: v }))} />
        <SliderRow label="Curve amp 1" value={params.amp1} min={0} max={150} step={1} onChange={(v) => setParams((p) => ({ ...p, amp1: v }))} />
        <SliderRow label="Curve freq 1" value={params.freq1} min={0.001} max={0.02} step={0.0005} onChange={(v) => setParams((p) => ({ ...p, freq1: v }))} format={(v) => v.toFixed(4)} />
        <SliderRow label="Wobble amp 2" value={params.amp2} min={0} max={80} step={1} onChange={(v) => setParams((p) => ({ ...p, amp2: v }))} />
        <SliderRow label="Wobble freq 2" value={params.freq2} min={0.001} max={0.04} step={0.001} onChange={(v) => setParams((p) => ({ ...p, freq2: v }))} format={(v) => v.toFixed(3)} />
        <SliderRow label="Phase" value={params.phase} min={0} max={6.28} step={0.05} onChange={(v) => setParams((p) => ({ ...p, phase: v }))} format={(v) => v.toFixed(2)} />

        {paramErr && <p className="text-xs text-destructive">{paramErr}</p>}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving}>{id ? "Save" : "Create"}</Button>
          {id && (
            <Button variant="secondary" onClick={() => navigate({ to: "/games/polytrack/track/$id", params: { id } })}>
              Playtest
            </Button>
          )}
          {id && !isPublic && <Button variant="outline" onClick={doPublish}>Publish</Button>}
          {id && isPublic && <Button variant="outline" onClick={doUnpublish}>Unpublish</Button>}
          {id && <Button variant="ghost" onClick={share}>Copy link</Button>}
          {id && <Button variant="ghost" className="text-destructive" onClick={doDelete}>Delete</Button>}
        </div>
        {id && (
          <p className="text-xs text-muted-foreground">
            {isPublic ? "🌐 This track is public." : "🔒 Private — only you can play it via the link. Editing an already-published track will unpublish it."}
          </p>
        )}

        <div className="pt-4">
          <h3 className="mb-2 text-sm font-semibold">Your tracks</h3>
          {myTracks.length === 0 && <p className="text-xs text-muted-foreground">No tracks yet.</p>}
          <div className="space-y-1">
            {myTracks.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate({ to: "/games/polytrack/editor", search: { id: t.id } })}
                className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm hover:border-primary ${t.id === id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <span className="truncate">{THEMES[t.season as Season].emoji} {t.name}</span>
                <span className="text-xs text-muted-foreground">{t.is_public ? "🌐" : "🔒"}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { navigate({ to: "/games/polytrack/editor", search: {} }); setName("New Track"); setParams(DEFAULT_PARAMS); setGoal(1000); setSeason("spring"); setIsPublic(false); }}
            className="mt-2 w-full rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            + New track
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, format,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <Label>{label}</Label>
        <span className="font-mono text-muted-foreground">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
