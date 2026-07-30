// Poly Racer — 3D tile-track time trial runner (three.js, client-only).
// three is loaded via dynamic import inside useEffect so it never enters
// the SSR bundle or the main chat bundle.
//
// The render loop owns all gameplay state and writes the HUD straight to
// the DOM; React only handles discrete phase changes so a running race
// never re-renders the tree.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  THEMES, TILE, ROAD_HALF, LEVEL_H, ROAD_THICK, TERRAIN_Y, CURVE_R, curveSign, tileHeightAt,
  formatMs, formatDelta, makeSampler, medalFor, MEDAL_META, MEDAL_MULT,
  readPersonalBest, recordPersonalBest, readGhost, writeGhost,
  type GhostSample, type Medal, type Sampler, type Season, type Theme,
} from "@/lib/polytrack-engine";
import { isTrackData, type TrackData, type Tile } from "@/lib/track-validation";
import { createCar, resetCar, stepCar, STEP, SPEED_TO_KMH } from "@/lib/poly-physics";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";
import { Mesher, type V3 } from "@/lib/poly-mesh";

type Action = "left" | "right" | "gas" | "brake" | "handbrake" | "reset" | "restart" | "pause" | "camera";

const DEFAULTS: Record<Action, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  gas: ["ArrowUp", "w"],
  brake: ["ArrowDown", "s"],
  handbrake: [" "],
  reset: ["r"],
  restart: ["Enter"],
  pause: ["Escape", "p"],
  camera: ["c"],
};
const LABELS: Record<Action, string> = {
  left: "Steer left", right: "Steer right", gas: "Accelerate",
  brake: "Brake / reverse", handbrake: "Drift", reset: "Respawn at checkpoint",
  restart: "Restart run", pause: "Pause", camera: "Camera",
};

type Phase = "loading" | "ready" | "running" | "paused" | "finished";
type CameraMode = "chase" | "hood" | "far";
const CAMERA_MODES: CameraMode[] = ["chase", "hood", "far"];

export type RunResult = {
  timeMs: number;
  medal: Medal;
  isPersonalBest: boolean;
  previousBest: number | null;
};

type Props = {
  data: unknown;             // TrackData v2 (or legacy — shows fallback)
  season: Season;
  goal: number;              // author-medal target, ms
  title: string;
  onFinish?: (timeMs: number, result: RunResult) => void;
  onExit?: () => void;
  exitLabel?: string;
  trackRef?: string;
};

/** Everything the React shell can ask the running simulation to do. */
type EngineApi = {
  restart: () => void;
  respawn: () => void;
  togglePause: () => void;
  cycleCamera: () => void;
};

export function PolyTrackRunner(props: Props) {
  const { data, season, goal, title, onFinish, onExit, exitLabel, trackRef } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const controls = useGameControls<Action>("dap-track", DEFAULTS);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<RunResult | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("chase");
  const [offRoad, setOffRoad] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [best, setBest] = useState<number | null>(null);

  const apiRef = useRef<EngineApi | null>(null);
  const timerRef = useRef<HTMLDivElement | null>(null);
  const deltaRef = useRef<HTMLDivElement | null>(null);
  const speedRef = useRef<HTMLSpanElement | null>(null);
  const cpRef = useRef<HTMLSpanElement | null>(null);

  const legacy = !isTrackData(data);

  useEffect(() => { setBest(trackRef ? readPersonalBest(trackRef) : null); }, [trackRef]);

  useEffect(() => {
    if (legacy) return;
    const el = wrapRef.current;
    if (!el) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const track = data as TrackData;
      const theme = THEMES[season];
      const sampler = makeSampler(track);

      // ── Scene ──────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(theme.sky);
      scene.fog = new THREE.Fog(theme.sky, 90, 320);

      const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      const resize = () => {
        const w = el.clientWidth || 640;
        const h = el.clientHeight || 480;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      scene.add(new THREE.HemisphereLight(new THREE.Color(theme.sky), new THREE.Color(theme.ground), 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(60, 120, 40);
      scene.add(sun);

      // ── Track geometry ─────────────────────────────────────────────
      const built = buildTrack(THREE, track, sampler, theme);
      scene.add(built.group);

      const carMesh = buildCar(THREE, 0xef4444, false);
      scene.add(carMesh.group);
      const ghostCar = buildCar(THREE, 0xffffff, true);
      ghostCar.group.visible = false;
      scene.add(ghostCar.group);

      // ── Race state ─────────────────────────────────────────────────
      const startTile = track.tiles.find((t) => t.type === "start") ?? track.tiles[0];
      const cellOf = (t: Tile) => `${t.x},${t.y},${t.z}`;
      const finishTiles = new Set(track.tiles.filter((t) => t.type === "finish").map(cellOf));
      const totalCp = built.checkpoints.length;

      const spawn = spawnFrom(sampler, startTile);
      let respawnPoint = { ...spawn };

      const car = createCar(spawn.x, spawn.y, spawn.z, spawn.yaw);

      let elapsed = 0;
      let running = false;
      let finished = false;
      let paused = false;
      const cpHit = new Set<string>();

      const recording: GhostSample[] = [];
      let ghost = trackRef ? readGhost(trackRef) : null;
      let ghostIdx = 0;
      let personalBest = trackRef ? readPersonalBest(trackRef) : null;

      let camMode: CameraMode = "chase";
      let camInit = false;
      let wasOffRoad = false;

      const placeCar = (to: { x: number; y: number; z: number; yaw: number }) =>
        resetCar(car, to.x, to.y, to.z, to.yaw);

      const restart = () => {
        respawnPoint = { ...spawn };
        placeCar(spawn);
        cpHit.clear();
        built.setCheckpointsLit(cpHit);
        recording.length = 0;
        ghostIdx = 0;
        elapsed = 0;
        running = false;
        finished = false;
        paused = false;
        camInit = false;
        ghost = trackRef ? readGhost(trackRef) : null;
        setResult(null);
        setPhase("ready");
        writeHud();
      };

      const respawn = () => {
        placeCar(respawnPoint);
        if (!running && !finished) return;
        setPhase(paused ? "paused" : "running");
      };

      const beginRun = () => {
        running = true;
        finished = false;
        elapsed = 0;
        recording.length = 0;
        ghostIdx = 0;
        setPhase("running");
      };

      const finish = () => {
        running = false;
        finished = true;
        const timeMs = Math.round(elapsed);
        const previousBest = personalBest;
        const isPersonalBest = previousBest == null || timeMs < previousBest;
        if (trackRef) {
          if (isPersonalBest) {
            personalBest = recordPersonalBest(trackRef, timeMs);
            if (recording.length > 1) writeGhost(trackRef, recording);
          }
          setBest(personalBest);
        }
        const res: RunResult = { timeMs, medal: medalFor(timeMs, goal), isPersonalBest, previousBest };
        setResult(res);
        setPhase("finished");
        onFinishRef.current?.(timeMs, res);
      };

      const togglePause = () => {
        if (finished) return;
        paused = !paused;
        setPhase(paused ? "paused" : running ? "running" : "ready");
      };

      const cycleCamera = () => {
        camMode = CAMERA_MODES[(CAMERA_MODES.indexOf(camMode) + 1) % CAMERA_MODES.length];
        camInit = false;
        setCameraMode(camMode);
      };

      apiRef.current = { restart, respawn, togglePause, cycleCamera };

      // ── HUD (written directly, never through React) ────────────────
      const writeHud = () => {
        if (timerRef.current) timerRef.current.textContent = formatMs(elapsed);
        if (cpRef.current) cpRef.current.textContent = `${cpHit.size}/${totalCp}`;
        if (speedRef.current) {
          const speed = Math.hypot(car.vx, car.vz) * SPEED_TO_KMH;
          speedRef.current.textContent = String(Math.round(speed));
        }
      };

      /**
       * Time gap to the ghost at the same point on the track. The ghost
       * index only ever creeps forward, so a lap that doubles back on
       * itself can't snap the comparison to the wrong straight.
       */
      const ghostDelta = (): number | null => {
        if (!ghost || ghost.length < 2 || !running) return null;
        let bestIdx = ghostIdx;
        let bestD = Infinity;
        for (let i = ghostIdx; i < Math.min(ghost.length, ghostIdx + 60); i++) {
          const g = ghost[i];
          const d = (g.x - car.x) ** 2 + (g.z - car.z) ** 2;
          if (d < bestD) { bestD = d; bestIdx = i; }
        }
        ghostIdx = bestIdx;
        if (bestD > TILE * TILE * 4) return null;
        return elapsed - ghost[bestIdx].t;
      };

      // ── Physics ────────────────────────────────────────────────────
      const simulate = (dt: number) => {
        const p = controlsRef.current.pressed.current;
        if (!running && !finished && (p.gas || p.brake)) beginRun();

        const res = stepCar(car, {
          throttle: (p.gas ? 1 : 0) - (p.brake ? 1 : 0),
          steer: (p.left ? 1 : 0) - (p.right ? 1 : 0),
          drift: !!p.handbrake,
        }, dt, sampler);
        const onRoad = res.onRoad;

        // Progress: checkpoints, then the finish line.
        const tile = res.surface.tile;
        if (running && onRoad && tile) {
          if (tile.type === "checkpoint") {
            const key = cellOf(tile);
            if (!cpHit.has(key)) {
              cpHit.add(key);
              built.setCheckpointsLit(cpHit);
              respawnPoint = spawnFrom(sampler, tile, car.yaw);
            }
          } else if (tile.type === "start") {
            respawnPoint = spawnFrom(sampler, tile, car.yaw);
          } else if (finishTiles.has(cellOf(tile)) && cpHit.size >= totalCp) {
            finish();
          }
        }

        if (running) {
          elapsed += dt * 1000;
          const last = recording[recording.length - 1];
          if (!last || elapsed - last.t >= 40) {
            recording.push({ t: elapsed, x: car.x, y: car.y, z: car.z, ry: car.yaw });
          }
        }

        if (!onRoad !== wasOffRoad) {
          wasOffRoad = !onRoad;
          setOffRoad(wasOffRoad);
        }
      };

      // ── Camera ─────────────────────────────────────────────────────
      const camTarget = new THREE.Vector3();
      const camWanted = new THREE.Vector3();

      const updateCamera = (dt: number) => {
        const { x, y, z, yaw } = car;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const speed = Math.hypot(car.vx, car.vz);
        if (camMode === "hood") {
          camWanted.set(x + fx * 1.1, y + 1.75, z + fz * 1.1);
          camTarget.set(x + fx * 26, y + 1.5, z + fz * 26);
        } else if (camMode === "far") {
          camWanted.set(x - fx * 26, y + 16, z - fz * 26);
          camTarget.set(x, y + 1, z);
        } else {
          const back = 11 + speed * 0.09;
          camWanted.set(x - fx * back, y + 4.6 + speed * 0.02, z - fz * back);
          camTarget.set(x + fx * 6, y + 1.4, z + fz * 6);
        }
        if (!camInit) {
          camera.position.copy(camWanted);
          camInit = true;
        } else {
          const k = camMode === "hood" ? 1 : 1 - Math.pow(0.0009, dt);
          camera.position.lerp(camWanted, k);
        }
        // Duck under an overpass rather than clipping through its deck.
        const ceiling = sampler.ceilingAt(camera.position.x, camera.position.z, y + 0.6);
        if (Number.isFinite(ceiling) && camera.position.y > ceiling - 0.6) {
          camera.position.y = Math.max(y + 0.8, ceiling - 0.6);
        }
        camera.lookAt(camTarget);
      };

      // ── Loop ───────────────────────────────────────────────────────
      let acc = 0;
      let last = performance.now();
      let hudAcc = 0;
      setPhase("ready");
      writeHud();

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (disposed) return;
        const real = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (!paused) {
          acc += real;
          let steps = 0;
          while (acc >= STEP && steps < 12) { simulate(STEP); acc -= STEP; steps++; }
          if (steps === 12) acc = 0;
        }

        carMesh.group.position.set(car.x, car.y, car.z);
        carMesh.group.rotation.set(car.pitch, car.yaw, car.roll);
        carMesh.group.visible = camMode !== "hood";
        carMesh.spinWheels(car.wheelSpin, car.steer);

        if (ghost && ghost.length > 1 && (running || finished)) {
          const g = sampleGhost(ghost, elapsed);
          if (g) {
            ghostCar.group.position.set(g.x, g.y, g.z);
            ghostCar.group.rotation.set(0, g.ry, 0);
            ghostCar.group.visible = true;
          } else {
            ghostCar.group.visible = false;
          }
        } else {
          ghostCar.group.visible = false;
        }

        updateCamera(real);
        built.animate(now / 1000);

        hudAcc += real;
        if (hudAcc > 1 / 30) {
          hudAcc = 0;
          writeHud();
          const d = ghostDelta();
          if (deltaRef.current) {
            if (d == null) {
              deltaRef.current.textContent = "";
            } else {
              deltaRef.current.textContent = formatDelta(d);
              deltaRef.current.style.color = d <= 0 ? "#4ade80" : "#f87171";
            }
          }
        }

        renderer.render(scene, camera);
      };
      let raf = requestAnimationFrame(frame);

      // ── Discrete keys ──────────────────────────────────────────────
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        if (controlsRef.current.capture) return;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const bind = controlsRef.current.bindings;
        const hit = (action: Action) => bind[action]?.some((k) => (k.length === 1 ? k.toLowerCase() : k) === key);
        if (hit("reset")) { e.preventDefault(); respawn(); }
        else if (hit("restart")) { e.preventDefault(); restart(); }
        else if (hit("pause")) { e.preventDefault(); togglePause(); }
        else if (hit("camera")) { e.preventDefault(); cycleCamera(); }
      };
      window.addEventListener("keydown", onKey);

      const onBlur = () => {
        if (running && !paused) togglePause();
      };
      window.addEventListener("blur", onBlur);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("blur", onBlur);
        ro.disconnect();
        apiRef.current = null;
        built.dispose();
        carMesh.dispose();
        ghostCar.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      };
    })().catch((e: Error) => setErr(e.message));

    return () => {
      disposed = true;
      cleanup?.();
    };
    // The scene is rebuilt only when the track itself changes.
  }, [data, season, legacy, trackRef, goal]);

  const press = useCallback((a: Action, on: boolean) => controls.press(a, on), [controls]);

  if (legacy) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-lg font-semibold">Legacy track</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This track was built with the old 2D format and isn&apos;t playable in the 3D engine.
        </p>
        {onExit && <Button className="mt-4" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
      </div>
    );
  }

  const medalTargets = (["author", "gold", "silver", "bronze"] as const).map((m) => ({
    key: m, ...MEDAL_META[m], time: goal * MEDAL_MULT[m],
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{title}</div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            WASD / Arrows · Space drift · R respawn · Enter restart · C camera · Esc pause
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => apiRef.current?.cycleCamera()}>
            🎥 {cameraMode}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apiRef.current?.restart()}>↺ Restart</Button>
          {onExit && <Button size="sm" variant="outline" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative aspect-[16/10] w-full select-none overflow-hidden rounded-xl border border-border bg-black"
      >
        {/* HUD */}
        <div className="pointer-events-none absolute inset-0 p-3 font-mono text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          <div className="flex items-start justify-between">
            <div>
              <div ref={timerRef} className="text-3xl font-bold tabular-nums sm:text-4xl">0.00</div>
              <div ref={deltaRef} className="text-sm font-semibold tabular-nums" />
            </div>
            <div className="text-right text-xs sm:text-sm">
              <div>CP <span ref={cpRef}>0/0</span></div>
              <div className="opacity-80">PB {best != null ? formatMs(best) : "—"}</div>
              <div className="opacity-80">🎯 {formatMs(goal)}</div>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 flex items-baseline gap-1">
            <span ref={speedRef} className="text-2xl font-bold tabular-nums sm:text-3xl">0</span>
            <span className="text-xs opacity-80">km/h</span>
          </div>
          {offRoad && phase === "running" && (
            <div className="absolute bottom-3 right-3 rounded-md bg-amber-500/80 px-2 py-1 text-xs font-semibold text-black">
              Off track — press R
            </div>
          )}
        </div>

        {phase === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white">Loading track…</div>
        )}
        {phase === "ready" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 text-center text-white">
            <div>
              <div className="text-xl font-semibold">Press W / ↑ to start</div>
              <div className="mt-1 text-xs opacity-80">
                {best != null ? "Your ghost is on track — chase it." : "Set a time and your ghost will race you next lap."}
              </div>
            </div>
          </div>
        )}
        {phase === "paused" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-white">
            <div className="text-center">
              <div className="text-2xl font-semibold">Paused</div>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" onClick={() => apiRef.current?.togglePause()}>Resume</Button>
                <Button size="sm" variant="secondary" onClick={() => apiRef.current?.restart()}>Restart</Button>
              </div>
            </div>
          </div>
        )}
        {phase === "finished" && result && (
          <div className="absolute inset-0 grid place-items-center bg-black/65 text-white">
            <div className="text-center">
              <div className="text-sm uppercase tracking-widest opacity-80">Finish</div>
              <div className="font-mono text-4xl font-bold tabular-nums">{formatMs(result.timeMs)}</div>
              {result.medal ? (
                <div className="mt-2 text-lg font-semibold" style={{ color: MEDAL_META[result.medal].color }}>
                  {MEDAL_META[result.medal].emoji} {MEDAL_META[result.medal].label} medal
                </div>
              ) : (
                <div className="mt-2 text-sm opacity-80">
                  No medal — bronze is {formatMs(goal * MEDAL_MULT.bronze)}
                </div>
              )}
              {result.isPersonalBest && (
                <div className="mt-1 text-sm font-semibold text-emerald-400">
                  ⭐ New personal best
                  {result.previousBest != null && ` (${formatDelta(result.timeMs - result.previousBest)})`}
                </div>
              )}
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => apiRef.current?.restart()}>Race again ⏎</Button>
                {onExit && <Button size="sm" variant="secondary" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
              </div>
            </div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-sm text-red-300">
            {err}
          </div>
        )}
      </div>

      <TouchPad press={press} onRespawn={() => apiRef.current?.respawn()} />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Medals</span>
        {medalTargets.map((m) => (
          <span key={m.key} className="rounded-md border border-border px-2 py-0.5" style={{ color: m.color }}>
            {m.emoji} {formatMs(m.time)}
          </span>
        ))}
      </div>

      <div className="mt-2 hidden sm:block">
        <KeybindEditor controls={controls} labels={LABELS} />
      </div>
    </div>
  );
}

// ── Touch controls ──────────────────────────────────────────────────

function TouchPad({ press, onRespawn }: { press: (a: Action, on: boolean) => void; onRespawn: () => void }) {
  const hold = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      press(a, true);
    },
    onPointerUp: () => press(a, false),
    onPointerCancel: () => press(a, false),
    onLostPointerCapture: () => press(a, false),
  });
  const cls = "h-16 select-none rounded-xl bg-muted/70 text-lg font-semibold active:bg-primary/40";
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
      <button className={cls} {...hold("left")}>◀</button>
      <button className={cls} {...hold("brake")}>▼</button>
      <button className={cls} {...hold("gas")}>▲</button>
      <button className={cls} {...hold("right")}>▶</button>
      <button className={`${cls} col-span-2 h-12 text-sm`} {...hold("handbrake")}>Drift</button>
      <button className={`${cls} col-span-2 h-12 text-sm`} onClick={onRespawn}>Respawn</button>
    </div>
  );
}

// ── Ghost playback ──────────────────────────────────────────────────

function sampleGhost(samples: GhostSample[], t: number): GhostSample | null {
  if (t > samples[samples.length - 1].t + 500) return null;
  let lo = 0, hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const span = Math.max(1, b.t - a.t);
  const k = Math.max(0, Math.min(1, (t - a.t) / span));
  // Shortest-arc yaw blend so the ghost doesn't spin at the ±π seam.
  let dry = b.ry - a.ry;
  while (dry > Math.PI) dry -= Math.PI * 2;
  while (dry < -Math.PI) dry += Math.PI * 2;
  return {
    t,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    ry: a.ry + dry * k,
  };
}

// ── Spawn helpers ───────────────────────────────────────────────────

/** Place the car on a tile's centreline, facing along the road. */
function spawnFrom(sampler: Sampler, tile: Tile, travellingYaw?: number) {
  const c = sampler.tileCenter(tile);
  // Probe from the piece's own deck so a spawn under an overpass doesn't
  // land the car on the bridge above it.
  const surf = sampler.at(c.x, c.z, c.y);
  let yaw = tile.rot * (Math.PI / 2);
  if (surf.tile === tile) {
    yaw = Math.atan2(surf.dirX, surf.dirZ);
    // Keep the driver pointing the way they were actually going.
    if (travellingYaw != null) {
      let diff = travellingYaw - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > Math.PI / 2) yaw += Math.PI;
    }
  }
  return { x: c.x, y: Math.max(c.y, surf.onRoad ? surf.y : c.y), z: c.z, yaw };
}

// ── Scene construction ──────────────────────────────────────────────

type ThreeNS = typeof import("three");

type BuiltTrack = {
  group: import("three").Group;
  checkpoints: Tile[];
  setCheckpointsLit: (hit: Set<string>) => void;
  animate: (time: number) => void;
  dispose: () => void;
};

/** Centreline of a tile, in world space, as a polyline. */
function tilePath(sampler: Sampler, t: Tile): V3[] {
  const cx = sampler.worldX(t.x), cz = sampler.worldZ(t.z);
  const rot = t.rot;
  const local = (lx: number, lz: number): [number, number] => {
    switch (((rot % 4) + 4) % 4) {
      case 0: return [lx, lz];
      case 1: return [lz, -lx];
      case 2: return [-lx, -lz];
      default: return [-lz, lx];
    }
  };
  const pts: V3[] = [];
  if (t.type === "curveL" || t.type === "curveR") {
    const sign = curveSign(t.type);
    const ccx = sign * (TILE / 2), ccz = -TILE / 2;
    const segs = 10;
    const y = tileHeightAt(t, 0.5);
    for (let i = 0; i <= segs; i++) {
      // Sweep from the entry edge (radial pointing -sign·X) to the exit (+Z).
      const a = (Math.PI / 2) * (i / segs);
      const lx = ccx - sign * Math.cos(a) * CURVE_R;
      const lz = ccz + Math.sin(a) * CURVE_R;
      const [ox, oz] = local(lx, lz);
      pts.push({ x: cx + ox, y, z: cz + oz });
    }
    return pts;
  }
  const segs = t.type === "straight" || t.type === "start" || t.type === "finish"
    || t.type === "checkpoint" || t.type === "boost" ? 1 : 10;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const lz = -TILE / 2 + u * TILE;
    const [ox, oz] = local(0, lz);
    pts.push({ x: cx + ox, y: tileHeightAt(t, u), z: cz + oz });
  }
  return pts;
}

function buildTrack(THREE: ThreeNS, track: TrackData, sampler: Sampler, theme: Theme): BuiltTrack {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const road = new Mesher();
  const curb = new Mesher();
  const support = new Mesher();
  const boost = new Mesher();
  const props = new Mesher();

  const checkpoints: Tile[] = [];

  for (const t of track.tiles) {
    const pts = tilePath(sampler, t);
    road.ribbon(pts, ROAD_HALF, ROAD_THICK);

    // Raised lips down both edges, skipped where a gate crosses the road.
    const lipH = 0.34;
    for (const side of [-1, 1]) {
      curb.ribbon(
        Mesher.offset(pts, side * (ROAD_HALF + 0.16), lipH),
        0.22,
        ROAD_THICK + lipH,
      );
    }

    if (t.type === "boost") {
      boost.ribbon(Mesher.offset(pts, 0, 0.03), ROAD_HALF * 0.72, 0.02);
    }
    if (t.type === "checkpoint") checkpoints.push(t);

    // Supports down to the terrain for anything off the ground.
    const mid = sampler.tileCenter(t);
    if (mid.y > 0.6) {
      support.box(mid.x, (mid.y - ROAD_THICK + TERRAIN_Y) / 2, mid.z, 1.5, mid.y - ROAD_THICK - TERRAIN_Y, 1.5);
    }
  }

  const roadMat = new THREE.MeshLambertMaterial({ color: theme.road, flatShading: true });
  const curbMat = new THREE.MeshLambertMaterial({ color: theme.roadEdge, flatShading: true });
  const supportMat = new THREE.MeshLambertMaterial({ color: theme.support, flatShading: true });
  const boostMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const propMat = new THREE.MeshLambertMaterial({ color: theme.prop, flatShading: true });
  disposables.push(roadMat, curbMat, supportMat, boostMat, propMat);

  for (const [mesher, mat] of [
    [road, roadMat], [curb, curbMat], [support, supportMat], [boost, boostMat],
  ] as const) {
    if (mesher.isEmpty) continue;
    const geo = mesher.build(THREE);
    disposables.push(geo);
    group.add(new THREE.Mesh(geo, mat));
  }

  // ── Terrain + scatter ─────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
  disposables.push(groundGeo, groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = TERRAIN_Y;
  group.add(ground);

  // Deterministic scatter so a track always looks the same.
  let seed = track.tiles.length * 9301 + 49297;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const b = sampler.bounds;
  for (let i = 0; i < 120; i++) {
    const gx = b.minX - 6 + rnd() * (b.maxX - b.minX + 12);
    const gz = b.minZ - 6 + rnd() * (b.maxZ - b.minZ + 12);
    const h = 2.5 + rnd() * 5;
    const half = 1.4 + rnd() * 1.4;
    const wx = sampler.worldX(gx), wz = sampler.worldZ(gz);
    if (sampler.columnAt(wx, wz).length > 0) continue;
    // Keep the whole trunk clear of the tarmac — of every deck, at any
    // height, not just the one nearest the ground.
    const pad = half + 2;
    const clear = [[0, 0], [-pad, 0], [pad, 0], [0, -pad], [0, pad]]
      .every(([ox, oz]) => sampler.columnAt(wx + ox, wz + oz).length === 0);
    if (!clear) continue;
    props.pyramid(wx, TERRAIN_Y, wz, half, h);
  }
  if (!props.isEmpty) {
    const geo = props.build(THREE);
    disposables.push(geo);
    group.add(new THREE.Mesh(geo, propMat));
  }

  // ── Gates: start, finish, checkpoints ─────────────────────────────
  const gateMats: Array<import("three").MeshLambertMaterial> = [];
  const cpGates = new Map<string, import("three").MeshLambertMaterial>();

  const addGate = (t: Tile, color: number, key?: string) => {
    // Straddle the road at the piece's centre, square to the direction of
    // travel — the posts must end up either side of the tarmac.
    const p = sampler.tileCenter(t);
    const surf = sampler.at(p.x, p.z, p.y);
    const rotY = Math.atan2(surf.dirX, surf.dirZ);
    // An arch only fits where nothing crosses overhead.
    const headroom = sampler.ceilingAt(p.x, p.z, p.y + 0.5) - p.y;

    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    gateMats.push(mat);
    if (key) cpGates.set(key, mat);

    const m = new Mesher();
    const w = ROAD_HALF + 0.5;
    // Posts either side plus a bar overhead, built in tile-local space.
    // The arch clears GATE_H so the chase camera passes under it instead
    // of clipping through the bar as it crosses the line.
    const GATE_H = Math.min(6.8, headroom - 0.8);
    if (GATE_H > 2) {
      m.box(-w, GATE_H / 2, 0, 0.5, GATE_H, 0.5);
      m.box(w, GATE_H / 2, 0, 0.5, GATE_H, 0.5);
      m.box(0, GATE_H, 0, w * 2 + 0.5, 0.6, 0.55);
    } else {
      // No room to arch over: mark the line with kerbside blocks instead.
      m.box(-w, 0.7, 0, 0.6, 1.4, 0.6);
      m.box(w, 0.7, 0, 0.6, 1.4, 0.6);
    }
    m.box(0, 0.06, 0, w * 2, 0.12, 1.1);
    const geo = m.build(THREE);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = rotY;
    group.add(mesh);
  };

  const startTile = track.tiles.find((t) => t.type === "start");
  const finishTile = track.tiles.find((t) => t.type === "finish");
  if (startTile) addGate(startTile, 0x22c55e);
  if (finishTile) addGate(finishTile, 0xef4444);
  for (const cp of checkpoints) addGate(cp, 0x3b82f6, `${cp.x},${cp.y},${cp.z}`);

  const setCheckpointsLit = (hit: Set<string>) => {
    for (const [key, mat] of cpGates) {
      mat.color.setHex(hit.has(key) ? 0x22c55e : 0x3b82f6);
    }
  };

  const animate = (time: number) => {
    boostMat.color.setHSL(0.5, 0.9, 0.55 + Math.sin(time * 6) * 0.15);
  };

  return {
    group,
    checkpoints,
    setCheckpointsLit,
    animate,
    dispose: () => {
      for (const d of disposables) d.dispose();
      for (const m of gateMats) m.dispose();
    },
  };
}

// ── Car ─────────────────────────────────────────────────────────────

function buildCar(THREE: ThreeNS, color: number, ghostly: boolean) {
  const group = new THREE.Group();
  // Yaw first, then pitch and roll in the car's own frame.
  group.rotation.order = "YXZ";
  const disposables: Array<{ dispose: () => void }> = [];

  const mkMat = (c: number, basic = false) => {
    const m = basic
      ? new THREE.MeshBasicMaterial({ color: c, transparent: ghostly, opacity: ghostly ? 0.35 : 1 })
      : new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: ghostly, opacity: ghostly ? 0.35 : 1 });
    disposables.push(m);
    return m;
  };

  const bodyMesher = new Mesher();
  bodyMesher.box(0, 0.55, 0, 1.9, 0.55, 3.9);          // chassis
  bodyMesher.box(0, 1.02, -0.25, 1.5, 0.55, 1.8);      // cabin
  bodyMesher.box(0, 1.12, -1.75, 1.7, 0.16, 0.5);      // rear wing
  const bodyGeo = bodyMesher.build(THREE);
  disposables.push(bodyGeo);
  group.add(new THREE.Mesh(bodyGeo, mkMat(color)));

  const glassMesher = new Mesher();
  glassMesher.box(0, 1.05, -0.25, 1.54, 0.42, 1.5);
  const glassGeo = glassMesher.build(THREE);
  disposables.push(glassGeo);
  group.add(new THREE.Mesh(glassGeo, mkMat(0x1e293b)));

  const lightMesher = new Mesher();
  for (const sx of [-0.6, 0.6]) lightMesher.box(sx, 0.62, 1.92, 0.42, 0.22, 0.12);
  const lightGeo = lightMesher.build(THREE);
  disposables.push(lightGeo);
  group.add(new THREE.Mesh(lightGeo, mkMat(0xfff3c4, true)));

  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.42, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  disposables.push(wheelGeo);
  const wheelMat = mkMat(0x111318);
  const wheels: Array<{ mesh: import("three").Mesh; front: boolean }> = [];
  for (const [wx, wz, front] of [
    [-0.98, 1.25, true], [0.98, 1.25, true], [-0.98, -1.3, false], [0.98, -1.3, false],
  ] as const) {
    const mesh = new THREE.Mesh(wheelGeo, wheelMat);
    mesh.position.set(wx, 0.5, wz);
    group.add(mesh);
    wheels.push({ mesh, front });
  }

  return {
    group,
    spinWheels: (spin: number, steer: number) => {
      for (const w of wheels) {
        w.mesh.rotation.x = spin;
        w.mesh.rotation.y = w.front ? steer * 0.45 : 0;
      }
    },
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}
