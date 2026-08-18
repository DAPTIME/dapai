/**
 * Pure port of the SQL dispatch rule in
 * supabase/migrations/20260817160000_fastpass_queue.sql (queue_next_lane)
 * plus the counter-update rule from queue_claim.
 *
 * Kept here, in TypeScript, purely so it can be unit tested against the
 * exact sequences the spec calls out. The SQL is the source of truth at
 * runtime; this function — and its tests — exist to pin the algorithm down
 * so the SQL can be checked against it (see queue_pick_lane in the
 * migration, which is driven through the same scenarios).
 */

export type Lane = "pro" | "go" | "free";

export type LaneCounters = {
  proSinceGo: number;
  goSinceFree: number;
};

export type LaneWaiting = {
  pro: boolean;
  go: boolean;
  free: boolean;
};

export type LanePick = {
  lane: Lane | null;
  counters: LaneCounters;
};

/** Which lane goes next, and the counters after that dispatch. */
export function pickNextLane(
  waiting: LaneWaiting,
  counters: LaneCounters
): LanePick {
  const { pro, go, free } = waiting;
  const { proSinceGo, goSinceFree } = counters;

  const proBlocked =
    (proSinceGo >= 2 && go) ||
    (!go && free && proSinceGo >= 2 && goSinceFree >= 2);
  const goBlocked = goSinceFree >= 2 && free;

  let lane: Lane | null = null;
  if (pro && !proBlocked) lane = "pro";
  else if (go && !goBlocked) lane = "go";
  else if (free) lane = "free";
  else if (go) lane = "go";
  else if (pro) lane = "pro";

  if (lane === null) return { lane: null, counters };

  if (lane === "pro") {
    return {
      lane,
      counters: {
        proSinceGo: proSinceGo + 1,
        goSinceFree: go ? goSinceFree : goSinceFree + 1,
      },
    };
  }
  if (lane === "go") {
    return { lane, counters: { proSinceGo: 0, goSinceFree: goSinceFree + 1 } };
  }
  return { lane, counters: { proSinceGo: 0, goSinceFree: 0 } };
}

/**
 * Replays the dispatcher over fixed-size FIFO queues in each lane, starting
 * from given counters, and returns the sequence of lanes dispatched — one
 * per waiting request, in order.
 */
export function simulate(
  counts: { pro: number; go: number; free: number },
  counters: LaneCounters = { proSinceGo: 0, goSinceFree: 0 }
): Lane[] {
  let { pro, go, free } = counts;
  let c = counters;
  const out: Lane[] = [];
  for (;;) {
    const pick = pickNextLane({ pro: pro > 0, go: go > 0, free: free > 0 }, c);
    if (pick.lane === null) break;
    if (pick.lane === "pro") pro--;
    else if (pick.lane === "go") go--;
    else free--;
    c = pick.counters;
    out.push(pick.lane);
  }
  return out;
}
