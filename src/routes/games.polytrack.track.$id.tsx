import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PolyTrackRunner } from "@/components/polytrack-runner";
import { Leaderboard, recordPersonalBest } from "@/components/track-leaderboard";
import type { Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";
import { getTrack, submitScore } from "@/lib/tracks.functions";

export const Route = createFileRoute("/games/polytrack/track/$id")({
  head: () => ({ meta: [{ title: "Custom Track — Poly Racer" }] }),
  component: TrackPage,
});

function TrackPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchTrack = useServerFn(getTrack);
  const submit = useServerFn(submitScore);
  const [track, setTrack] = useState<Awaited<ReturnType<typeof getTrack>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lbKey, setLbKey] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    fetchTrack({ data: { id } }).then(setTrack).catch((e: Error) => setErr(e.message));
  }, [id, fetchTrack]);

  if (err) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-destructive">{err}</p>
        <Link to="/games/polytrack/browse" className="mt-4 inline-block text-sm underline">Back to browse</Link>
      </div>
    );
  }
  if (!track) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const trackRef = `custom:${track.id}`;
  const isOwner = userId && userId === track.owner_id;

  const handleFinish = (ms: number) => {
    const prev = Number(localStorage.getItem(`dap.polytrack.pb.${trackRef}`) ?? "0");
    const improved = !prev || ms < prev;
    recordPersonalBest(trackRef, ms);
    setLbKey((k) => k + 1);
    if (improved) toast.success("New personal best!");
    if (!userId) { toast.info("Sign in to save to the site-wide leaderboard."); return; }
    submit({ data: { trackRef, timeMs: ms } }).catch(() => {});
  };

  const share = async () => {
    const url = `${window.location.origin}/games/polytrack/track/${track.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); }
    catch { toast.info(url); }
  };

  return (
    <div>
      <PolyTrackRunner
        params={track.params as unknown as TrackParams}
        season={track.season as Season}
        goal={track.goal}
        title={track.name}
        onFinish={handleFinish}
        onExit={() => navigate({ to: "/games/polytrack/browse" })}
        exitLabel="Browse"
      />
      <div className="mx-auto max-w-md">
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={share}>🔗 Copy link</Button>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => navigate({ to: "/games/polytrack/editor", search: { id: track.id } })}>
              ✏️ Edit
            </Button>
          )}
          {!track.is_public && (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">🔒 Private</span>
          )}
        </div>
        <Leaderboard trackRef={trackRef} refreshKey={lbKey} />
      </div>
    </div>
  );
}
