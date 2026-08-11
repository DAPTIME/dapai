// DAP Track — 3D tile-track time trial runner (three.js, client-only).
// three is loaded via dynamic import inside useEffect so it never enters
// the SSR bundle or the main chat bundle.
//
// The render loop owns all gameplay state and writes the HUD straight to
// the DOM; React only handles discrete phase changes so a running race
// never re-renders the tree.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  THEMES, TILE, ROAD_HALF, ROAD_THICK, TERRAIN_Y, CURVE_R, curveSign, levelY, tileHeightAt,
  formatMs, formatDelta, makeSampler, medalFor, MEDAL_META, MEDAL_MULT,
  readPersonalBest, recordPersonalBest, readGhost, writeGhost,
  type GhostSample, type Medal, type Sampler, type Season, type Theme,
} from "@/lib/polytrack-engine";
import { isTrackData, type TrackData, type Tile } from "@/lib/track-validation";
import { createCar, resetCar, stepCar, STEP, SPEED_TO_KMH, MAX_SPEED } from "@/lib/poly-physics";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";
import { useTouchControls, isTouchOnly } from "@/lib/use-compact-screen";
import { Mesher, type V3 } from "@/lib/poly-mesh";

type Action = "left" | "right" | "gas" | "brake" | "handbrake" | "reset" | "restart" | "pause" | "camera" | "fullscreen";

const DEFAULTS: Record<Action, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  gas: ["ArrowUp", "w"],
  brake: ["ArrowDown", "s"],
  handbrake: [" "],
  reset: ["r"],
  restart: ["Enter", "t"],
  pause: ["Escape", "p"],
  camera: ["c"],
  fullscreen: ["f"],
};
const LABELS: Record<Action, string> = {
  left: "Steer left", right: "Steer right", gas: "Accelerate",
  brake: "Brake / reverse", handbrake: "Drift", reset: "Respawn at checkpoint (tap twice to restart)",
  restart: "Restart run", pause: "Pause", camera: "Camera",
  fullscreen: "Fullscreen",
};

type Phase = "loading" | "ready" | "running" | "paused" | "finished";
type CameraMode = "chase" | "hood" | "far";
const CAMERA_MODES: CameraMode[] = ["chase", "hood", "far"];

/** Lens at a standstill, and how far it opens up at full chat. */
const FOV_BASE = 68;
const FOV_RUSH = 13;

/** Two resets closer together than this count as a double tap. */
const DOUBLE_TAP_MS = 500;

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
  toggleFullscreen: () => void;
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
  /* On-screen controls follow the screen, not just the viewport width —
     and the player can overrule the guess, which is the only thing that
     works on an iPad set to request the desktop site. */
  const touch = useTouchControls();
  const compact = touch.show;
  // A device with a fine pointer has a keyboard worth rebinding, whatever
  // its size, so the key editor stays for compact laptops and hides only
  // where there is nothing to type on.
  const hasKeyboard = !isTouchOnly();

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
      // Barely any haze: it only softens the last stretch before the far
      // plane, so the plain keeps its colour all the way to the horizon.
      scene.fog = new THREE.Fog(theme.sky, 640, 1500);

      const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 1000);

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

      // High key and almost shadowless: a big flat ambient sets the
      // exposure so a face turned away from the sun is still bright,
      // and the sun adds only enough shaping to tell one plane from the
      // next. Depth comes from the palette, not from falloff.
      scene.add(new THREE.AmbientLight(0xffffff, 1.45));
      scene.add(new THREE.HemisphereLight(new THREE.Color(theme.sky), new THREE.Color(theme.ground), 0.75));
      const sun = new THREE.DirectionalLight(0xffffff, 0.95);
      sun.position.set(SUN.x, SUN.y, SUN.z);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xffffff, 0.25);
      fill.position.set(-70, 60, -50);
      scene.add(fill);

      // ── Track geometry ─────────────────────────────────────────────
      const built = buildTrack(THREE, track, sampler, theme);
      scene.add(built.group);

      const carMesh = buildCar(THREE, CAR_COLOR, false);
      scene.add(carMesh.group);
      const ghostCar = buildCar(THREE, 0xffffff, true);
      ghostCar.group.visible = false;
      scene.add(ghostCar.group);

      // The car's own shadow, thrown along the same sun the track's baked
      // shadows use. One flat disc is all it takes, and the gap it opens
      // up under the wheels is the only cue for how high a jump went.
      const blobM = new Mesher();
      const blobSides = 12;
      for (let i = 0; i < blobSides; i++) {
        const a0 = (i / blobSides) * Math.PI * 2, a1 = ((i + 1) / blobSides) * Math.PI * 2;
        blobM.tri(
          { x: 0, y: 0, z: 0 },
          { x: Math.sin(a0) * 1.28, y: 0, z: Math.cos(a0) * 2.05 },
          { x: Math.sin(a1) * 1.28, y: 0, z: Math.cos(a1) * 2.05 },
        );
      }
      const blobGeo = blobM.build(THREE);
      const blobMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false,
      });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.renderOrder = 1;
      scene.add(blob);

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

      /* Fullscreen targets the wrapper, not the canvas: the HUD, the
         touch pad and the pause overlay are siblings of the canvas, and
         taking only the canvas full-screen would leave every one of them
         behind. The ResizeObserver above already watches this element,
         so the camera aspect follows on its own. */
      const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.().catch(() => { /* denied or unsupported */ });
      };

      apiRef.current = { restart, respawn, togglePause, cycleCamera, toggleFullscreen };

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
      let camRoll = 0;
      let camTilt = 0;


      /**
       * Chase view: low and close behind the bumper, leaning back and
       * opening its lens as the speed builds, and aiming a little way
       * into the corner so you can see the exit before you reach it.
       */
      const updateCamera = (dt: number) => {
        const { x, y, z, yaw } = car;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const speed = Math.hypot(car.vx, car.vz);
        const rush = Math.min(1, speed / MAX_SPEED);
        let wantFov = FOV_BASE;
        let wantRoll = 0;

        if (camMode === "hood") {
          camWanted.set(x + fx * 0.6, y + 1.32, z + fz * 0.6);
          camTarget.set(x + fx * 30, y + 1.9, z + fz * 30);
          wantFov = FOV_BASE + 4 + rush * FOV_RUSH;
        } else if (camMode === "far") {
          camWanted.set(x - fx * 26, y + 15, z - fz * 26);
          camTarget.set(x, y + 1, z);
        } else {
          const back = 8.2 + rush * 3.6;
          // Lead the corner: swing the aim point round with the steering.
          const lead = yaw + car.steer * 0.30 * rush;
          const ahead = 9 + rush * 7;
          const ax = x + Math.sin(lead) * ahead;
          const az = z + Math.cos(lead) * ahead;
          // Read the road a little way ahead so the camera tilts with the
          // slope: it rises and looks down on descents, and drops back /
          // looks up as the track climbs away.
          const front = sampler.at(ax, az, y + 3);
          const frontY = front.onRoad ? front.y : y;
          const rise = Math.max(-14, Math.min(14, frontY - y));
          const slope = rise / ahead;
          camTilt += (slope - camTilt) * (1 - Math.pow(0.02, dt));
          // Higher, more overhead angle so the car and the next section of
          // track are both in frame at all times.
          const height = y + 5.1 + rush * 1.5 + Math.max(0, -camTilt) * ahead * 0.55;
          camWanted.set(x - fx * back, height - camTilt * back * 0.85, z - fz * back);
          camTarget.set(ax, y + 1.0 + rise * 0.55, az);
          wantFov = FOV_BASE + rush * FOV_RUSH;
          wantRoll = -car.steer * 0.05 * rush;
        }


        if (!camInit) {
          camera.position.copy(camWanted);
          camera.fov = wantFov;
          camRoll = wantRoll;
          camInit = true;
        } else {
          const k = camMode === "hood" ? 1 : 1 - Math.pow(0.0012, dt);
          camera.position.lerp(camWanted, k);
          const ease = 1 - Math.pow(0.02, dt);
          camera.fov += (wantFov - camera.fov) * ease;
          camRoll += (wantRoll - camRoll) * ease;
        }
        camera.updateProjectionMatrix();

        // Stay out of the scenery: above whatever is underfoot, and
        // ducked under an overpass rather than clipping through it.
        const under = sampler.at(camera.position.x, camera.position.z, camera.position.y);
        const floor = (under.onRoad ? under.y : TERRAIN_Y) + 1.15;
        if (camera.position.y < floor) camera.position.y = floor;
        // Ducking under an overpass probed upward from the car's height,
        // which finds the elevated road the car is *on* the moment the
        // camera trails off the back of it — and then pushed the camera
        // down to sit under that platform, so the shot became the
        // underside of a slab with the car nowhere in frame. Two things
        // fix it: probe from the camera's own floor rather than the
        // car's height, and ignore a ceiling with no headroom under it,
        // since that is the road itself and not something to duck below.
        const ceiling = sampler.ceilingAt(camera.position.x, camera.position.z, floor + 0.4);
        if (Number.isFinite(ceiling) && ceiling - floor > 2.2 && camera.position.y > ceiling - 0.6) {
          // Never below the floor: that clamp is what kept failing.
          camera.position.y = Math.max(floor, ceiling - 0.6);
        }
        camera.lookAt(camTarget);
        if (camRoll !== 0) camera.rotateZ(camRoll);
      };

      /** Height the shadow is thrown from — roughly the roofline. */
      const CAR_MID = 1.15;

      /**
       * Drop the car's shadow onto whatever is under it. Measuring the
       * throw from the middle of the body rather than the wheels is what
       * makes a car sitting flat on the road cast clear of itself.
       */
      const updateBlob = () => {
        const surf = sampler.at(car.x, car.z, car.y + 0.4);
        const gy = surf.onRoad ? surf.y : TERRAIN_Y;
        const throwY = car.y - gy + CAR_MID;
        const air = Math.max(0, Math.min(1, (car.y - gy) / 9));
        blob.position.set(car.x + throwY * SUN_SLIP_X, gy + 0.06, car.z + throwY * SUN_SLIP_Z);
        blob.rotation.y = car.yaw;
        const s = 1 - air * 0.3;
        blob.scale.set(s, 1, s);
        blobMat.opacity = 0.26 * (1 - air * 0.6);
        blob.visible = camMode !== "hood";
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

        updateBlob();
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
      let lastReset = 0;
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        if (controlsRef.current.capture) return;
        // A held key repeats; that is one press, not a double tap.
        if (e.repeat) return;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const bind = controlsRef.current.bindings;
        const hit = (action: Action) => bind[action]?.some((k) => (k.length === 1 ? k.toLowerCase() : k) === key);
        if (hit("reset")) {
          e.preventDefault();
          /* One press puts you back on the last checkpoint; two inside
             DOUBLE_TAP_MS restart the run. The respawn fires on the first
             press rather than waiting to see whether a second arrives —
             holding the common action back half a second to watch for the
             rare one would put lag on every recovery. A restart simply
             supersedes the respawn that preceded it. */
          const now = performance.now();
          if (now - lastReset < DOUBLE_TAP_MS) { lastReset = 0; restart(); }
          else { lastReset = now; respawn(); }
        }
        else if (hit("restart")) { e.preventDefault(); restart(); }
        else if (hit("pause")) { e.preventDefault(); togglePause(); }
        else if (hit("camera")) { e.preventDefault(); cycleCamera(); }
        else if (hit("fullscreen")) { e.preventDefault(); toggleFullscreen(); }
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
        blobGeo.dispose();
        blobMat.dispose();
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
            WASD / Arrows · Space drift · R respawn (RR restart) · T restart · F fullscreen · C camera · Esc pause
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={touch.mode === "auto" ? "secondary" : "default"}
            onClick={touch.cycle}
            title={
              touch.mode === "auto"
                ? "Touch controls: automatic — tap to force on"
                : touch.mode === "on"
                  ? "Touch controls: always on — tap to force off"
                  : "Touch controls: off — tap to go back to automatic"
            }
          >
            🎮 Buttons: {touch.mode === "auto" ? (compact ? "auto (on)" : "auto (off)") : touch.mode === "on" ? "on" : "off"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apiRef.current?.toggleFullscreen()}
                  title="Fullscreen (F)">⛶</Button>
          <Button size="sm" variant="secondary" onClick={() => apiRef.current?.cycleCamera()}>
            🎥 {cameraMode}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apiRef.current?.restart()}>↺ Restart</Button>
          {onExit && <Button size="sm" variant="outline" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
        </div>
      </div>

      {/* 16:10 is right on a desktop and wrong on a phone: letterboxing a
          landscape box into a portrait screen left the track about a
          third of the height, with the touch pad crowding what was left.
          Small screens get a portrait aspect instead, which roughly
          quadruples the play area without widening the page. */}
      <div
        ref={wrapRef}
        className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-xl border border-border bg-black sm:aspect-[16/10]"
      >
        {/* HUD */}
        {/* A single soft drop shadow held up fine over grass and tarmac but
            washed out over snow, where the timer sits on a near-white sky.
            The tight halo underneath keeps it legible on every season. */}
        <div className="pointer-events-none absolute inset-0 p-3 font-mono text-white [text-shadow:0_0_2px_rgba(0,0,0,0.95),0_2px_6px_rgba(0,0,0,0.85)]">
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
          <div className={`absolute left-3 flex items-baseline gap-1 ${compact ? "bottom-[10.5rem]" : "bottom-3"}`}>
            <span ref={speedRef} className="text-2xl font-bold tabular-nums sm:text-3xl">0</span>
            <span className="text-xs opacity-80">km/h</span>
          </div>
          {offRoad && phase === "running" && (
            <div className={`absolute right-3 rounded-md bg-amber-500/80 px-2 py-1 text-xs font-semibold text-black ${compact ? "bottom-[10.5rem]" : "bottom-3"}`}>
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
              {/* Naming keys to someone holding a tablet is no help; when
                  the pad is up, point at the button that is actually there. */}
              <div className="text-xl font-semibold">
                {compact ? "Tap ▲ to start" : "Press W / ↑ to start"}
              </div>
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

        {/* Controls sit on the game rather than under it. Below the canvas
            they ate a third of a phone screen and put the thumbs off the
            picture; over it they cost nothing but the strip of foreground
            they cover, which is the least useful part of a chase view. */}
        {compact && <TouchPad press={press} onRespawn={() => apiRef.current?.respawn()} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Medals</span>
        {medalTargets.map((m) => (
          <span key={m.key} className="rounded-md border border-border px-2 py-0.5" style={{ color: m.color }}>
            {m.emoji} {formatMs(m.time)}
          </span>
        ))}
      </div>

      <div className={compact && !hasKeyboard ? "hidden" : "mt-2 block"}>
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
  /* Translucent so the track still reads underneath, and generous: a
     thumb is about 45px of contact, so a 5rem target is comfortable
     without aiming. The container ignores pointer events so a drag that
     misses a button still reaches the game. */
  const base =
    "pointer-events-auto flex select-none items-center justify-center rounded-2xl " +
    "border border-white/25 bg-black/45 font-semibold text-white backdrop-blur-sm " +
    "transition-colors active:bg-primary/70 active:border-white/50";
  const big = `${base} h-20 flex-1 text-3xl`;
  const small = `${base} h-11 flex-1 text-sm`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3">
      <div className="flex gap-2">
        <button className={small} {...hold("handbrake")}>Drift</button>
        <button className={small} onClick={onRespawn}>Respawn</button>
      </div>
      {/* Forward, reverse, then the steering pair with left before right. */}
      <div className="flex gap-2">
        <button className={big} {...hold("gas")}>▲</button>
        <button className={big} {...hold("brake")}>▼</button>
        <button className={big} {...hold("left")}>◀</button>
        <button className={big} {...hold("right")}>▶</button>
      </div>
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

/**
 * The sun, fixed for every season. Keeping it in one place matters
 * because the raised road's shadow is baked into the terrain geometry
 * from exactly this direction.
 */
const SUN = { x: 66, y: 120, z: 50 };
/** Ground offset a shadow slides per unit of height. */
const SUN_SLIP_X = SUN.x / SUN.y;
const SUN_SLIP_Z = SUN.z / SUN.y;

/** Multiply a hex colour toward black. */
function shade(hex: string, k: number): number {
  const n = parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((n >> shift) & 255) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * Which way is the outside of a bend, as a sign for Mesher.offset: the
 * side whose rail comes out longer. Straights give 0. Comparing lengths
 * beats reasoning about winding, and cannot get the sign backwards.
 */
function outerSide(pts: V3[]): -1 | 0 | 1 {
  const a = Mesher.arcLength(Mesher.offset(pts, 1));
  const b = Mesher.arcLength(Mesher.offset(pts, -1));
  if (Math.abs(a - b) < 1e-3) return 0;
  return a > b ? 1 : -1;
}

/**
 * Push a piece's two end points a hair further out along the road.
 * Neighbouring slabs then overlap by a fraction of a unit instead of
 * meeting exactly, which is what stops a hairline of the dark end cap
 * showing through at every joint. The overlap is the same grey on both
 * sides, so nothing can be seen of it.
 */
function stretched(pts: V3[], by: number): V3[] {
  const n = pts.length;
  if (n < 2) return pts;
  const out = pts.slice();
  const push = (a: V3, b: V3): V3 => {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: a.x + (dx / len) * by, y: a.y + (dy / len) * by, z: a.z + (dz / len) * by };
  };
  out[0] = push(pts[0], pts[1]);
  out[n - 1] = push(pts[n - 1], pts[n - 2]);
  return out;
}

/**
 * Pillars under a raised piece: a footing, a slightly tapered shaft and
 * a collar tucked under the deck. Ramps get two, spaced along the climb,
 * so a slope doesn't look propped up by a single stick in the middle.
 *
 * A pillar lands on whatever is actually beneath it — the terrain, or a
 * lower deck sharing the column at a crossing.
 */
function addSupports(m: Mesher, sampler: Sampler, t: Tile, pts: V3[]): void {
  const ramp = t.type === "rampUp" || t.type === "rampDown";
  const spots = ramp ? [0.32, 0.72] : [0.5];
  for (const u of spots) {
    const i = Math.min(pts.length - 1, Math.round(u * (pts.length - 1)));
    const p = pts[i];
    const top = p.y - ROAD_THICK;

    let base = TERRAIN_Y;
    for (const other of sampler.columnAt(p.x, p.z)) {
      if (other === t) continue;
      const deck = levelY(other.y);
      if (deck < top - 1.2 && deck > base) base = deck;
    }
    const span = top - base;
    if (span < 1.4) continue;

    const foot = Math.min(0.45, span * 0.16);
    const collar = Math.min(0.38, span * 0.14);
    m.frustum(p.x, p.z, base, base + foot, 1.02, 1.02, 0.84, 0.84);
    m.frustum(p.x, p.z, base + foot, top - collar, 0.72, 0.72, 0.58, 0.58);
    m.frustum(p.x, p.z, top - collar, top, 0.66, 0.66, 0.98, 0.98);
  }
}

function buildTrack(THREE: ThreeNS, track: TrackData, sampler: Sampler, theme: Theme): BuiltTrack {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const road = new Mesher();     // tarmac surface
  const roadSide = new Mesher(); // flanks, underside and the top edge trim
  const line = new Mesher();     // painted edge and centre markings
  const support = new Mesher();
  const boost = new Mesher();
  const props = new Mesher();
  const shadow = new Mesher();   // baked sun shadow of raised road
  const checkerLight = new Mesher();
  const checkerDark = new Mesher();

  const checkpoints: Tile[] = [];

  for (const t of track.tiles) {
    const pts = tilePath(sampler, t);
    // Everything that runs the full length of a piece is built on the
    // stretched path, so neighbouring pieces overlap rather than abut.
    const slab = stretched(pts, 0.05);
    const bend = t.type === "curveL" || t.type === "curveR";
    // Surface and flanks are separate buffers so the slab edge can be
    // darker than the tarmac — that contrast is what makes each piece
    // read as a solid block rather than a painted stripe on the ground.
    road.ribbon(slab, ROAD_HALF, ROAD_THICK, roadSide);
    // A dark sliver along the very lip, so the slab keeps its edge even
    // when you are looking flat down the road and the flank is hidden.
    for (const side of [-1, 1]) {
      roadSide.stripe(Mesher.offset(slab, side * (ROAD_HALF - 0.07), 0.02), 0.07);
    }

    // Painted lines just inside both edges — except on the outside of a
    // bend, which gets a kerb instead.
    const kerbSide = bend ? outerSide(pts) : 0;
    for (const side of [-1, 1] as const) {
      if (side === kerbSide) continue;
      line.stripe(Mesher.offset(slab, side * (ROAD_HALF - 0.32), 0.035), 0.21);
    }
    if (kerbSide !== 0) {
      // Alternating blocks, sized so a whole number of them fits the arc.
      const rail = Mesher.offset(pts, kerbSide * (ROAD_HALF - 0.46), 0.04);
      const cells = Math.max(4, Math.round(Mesher.arcLength(rail) / 1.15));
      const block = Mesher.arcLength(rail) / cells;
      checkerLight.dashed(rail, 0.42, block, block, 0);
      checkerDark.dashed(rail, 0.42, block, block, -block);
    } else if (t.type !== "boost") {
      // Dashed centre line. The period divides TILE exactly, so the
      // rhythm carries across the joint between two straights.
      line.dashed(Mesher.offset(pts, 0, 0.035), 0.15, 1.3, 1.2, 0);
    }

    if (t.type === "boost") {
      boost.ribbon(Mesher.offset(pts, 0, 0.03), ROAD_HALF * 0.72, 0.02);
    }
    if (t.type === "checkpoint") checkpoints.push(t);

    addSupports(support, sampler, t, pts);

    // Cast the piece onto the terrain along the sun. A hard-edged
    // projection is cheap, matches the flat look, and is what makes a
    // flyover read as being in the air rather than pasted on the sky.
    if (pts.some((p) => p.y > TERRAIN_Y + 1.6)) {
      shadow.stripe(pts.map((p) => ({
        x: p.x + (p.y - TERRAIN_Y) * SUN_SLIP_X,
        y: TERRAIN_Y + 0.03,
        z: p.z + (p.y - TERRAIN_Y) * SUN_SLIP_Z,
      })), ROAD_HALF);
    }
  }

  const roadMat = new THREE.MeshLambertMaterial({ color: theme.road });
  const roadSideMat = new THREE.MeshLambertMaterial({ color: theme.roadSide });
  const lineMat = new THREE.MeshBasicMaterial({ color: theme.roadLine });
  const supportMat = new THREE.MeshLambertMaterial({ color: theme.support });
  const boostMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const propMat = new THREE.MeshLambertMaterial({ color: theme.prop, flatShading: true });
  // Lit exactly like the terrain and simply darker, so a shadow is a
  // constant fraction of the ground under every season's light.
  const shadowMat = new THREE.MeshLambertMaterial({ color: shade(theme.ground, 0.68) });
  const checkLightMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f7 });
  const checkDarkMat = new THREE.MeshBasicMaterial({ color: 0x272d33 });
  disposables.push(roadMat, roadSideMat, lineMat, supportMat, boostMat, propMat,
                   shadowMat, checkLightMat, checkDarkMat);

  // ── Terrain ───────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
  disposables.push(groundGeo, groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = TERRAIN_Y;
  group.add(ground);

  // Deterministic scatter so a track always looks the same. Kept sparse
  // and low: an empty plain is the look, clutter is not.
  let seed = track.tiles.length * 9301 + 49297;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const b = sampler.bounds;
  for (let i = 0; i < 34; i++) {
    const gx = b.minX - 7 + rnd() * (b.maxX - b.minX + 14);
    const gz = b.minZ - 7 + rnd() * (b.maxZ - b.minZ + 14);
    const h = 1.5 + rnd() * 1.7;
    const half = 0.8 + rnd() * 0.6;
    const wx = sampler.worldX(gx), wz = sampler.worldZ(gz);
    if (sampler.columnAt(wx, wz).length > 0) continue;
    // Keep a whole empty tile between a tree and the tarmac — of every
    // deck, at any height, not just the one nearest the ground. Anything
    // you can hit while running wide is a nasty surprise, not scenery.
    const pad = half + 7;
    const clear = [[0, 0], [-pad, 0], [pad, 0], [0, -pad], [0, pad]]
      .every(([ox, oz]) => sampler.columnAt(wx + ox, wz + oz).length === 0);
    if (!clear) continue;
    // Two stacked tiers read as a deliberate low-poly conifer rather
    // than a stray triangle on the ground.
    props.pyramid(wx, TERRAIN_Y, wz, half, h * 0.66);
    props.pyramid(wx, TERRAIN_Y + h * 0.34, wz, half * 0.68, h * 0.7);
  }

  // ── Gates: start, finish, checkpoints ─────────────────────────────
  const gateMats: Array<import("three").Material> = [];
  const cpGates = new Map<string, {
    frame: import("three").MeshLambertMaterial;
    pane: import("three").MeshBasicMaterial;
  }>();

  /** Where a piece sits and which way it faces, for anything laid on it. */
  const placeOn = (t: Tile) => {
    const p = sampler.tileCenter(t);
    const surf = sampler.at(p.x, p.z, p.y);
    return { p, rotY: Math.atan2(surf.dirX, surf.dirZ) };
  };

  /**
   * A checkpoint gate: two slim uprights and a translucent panel you
   * drive straight through. The panel turns green once collected.
   */
  const addGate = (t: Tile, color: number, key?: string) => {
    const { p, rotY } = placeOn(t);
    // A gate only fits where nothing crosses overhead.
    const headroom = sampler.ceilingAt(p.x, p.z, p.y + 0.5) - p.y;
    const h = Math.min(4.5, headroom - 0.9);
    if (h < 1.6) return;   // under a flyover: the road marking alone marks it

    const holder = new THREE.Group();
    holder.position.set(p.x, p.y, p.z);
    holder.rotation.y = rotY;

    const w = ROAD_HALF + 0.3;
    const frameMat = new THREE.MeshLambertMaterial({ color });
    const paneMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    gateMats.push(frameMat);
    if (key) cpGates.set(key, { frame: frameMat, pane: paneMat });

    // Slim uprights on a wider foot, so the gate frames the road
    // without becoming the biggest thing on the track.
    const fm = new Mesher();
    for (const sx of [-w, w]) {
      fm.frustum(sx, 0, 0, h, 0.32, 0.32, 0.22, 0.22);
      fm.box(sx, 0.16, 0, 0.72, 0.32, 0.72);
    }
    fm.box(0, h - 0.13, 0, w * 2 + 0.22, 0.26, 0.26);
    const frameGeo = fm.build(THREE);

    const pm = new Mesher();
    pm.quad(
      { x: -w, y: 0.05, z: 0 }, { x: w, y: 0.05, z: 0 },
      { x: w, y: h, z: 0 }, { x: -w, y: h, z: 0 },
    );
    const paneGeo = pm.build(THREE);

    disposables.push(frameGeo, paneGeo, paneMat);
    holder.add(new THREE.Mesh(frameGeo, frameMat));
    holder.add(new THREE.Mesh(paneGeo, paneMat));
    group.add(holder);
  };

  /**
   * Tile-local (across, along) → world, on the road surface and facing
   * the way the piece is driven. Everything painted on a piece uses it.
   */
  const painterFor = (t: Tile, lift: number) => {
    const { p, rotY } = placeOn(t);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    return (lx: number, lz: number): V3 => ({
      x: p.x + lx * cos + lz * sin,
      y: p.y + lift,
      z: p.z - lx * sin + lz * cos,
    });
  };

  /** Black-and-white squares laid across the road for start and finish. */
  const addCheckerLine = (t: Tile) => {
    const at = painterFor(t, 0.045);
    const cols = 8, rows = 2;
    const cw = (ROAD_HALF * 2) / cols, cd = 0.85;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = -ROAD_HALF + c * cw, x1 = x0 + cw;
        const z0 = (r - rows / 2) * cd, z1 = z0 + cd;
        const target = (r + c) % 2 === 0 ? checkerLight : checkerDark;
        target.quad(at(x0, z0), at(x0, z1), at(x1, z1), at(x1, z0));
      }
    }
  };

  /** Three white chevrons pointing down the road, on a boost pad. */
  const addBoostArrows = (t: Tile) => {
    const at = painterFor(t, 0.055);
    const w = 1.55, depth = 1.15, thick = 0.5;
    for (const lz of [-3.1, -0.5, 2.1]) {
      checkerLight.quad(
        at(w, lz), at(0, lz + depth), at(0, lz + depth + thick), at(w, lz + thick),
      );
      checkerLight.quad(
        at(-w, lz), at(-w, lz + thick), at(0, lz + depth + thick), at(0, lz + depth),
      );
    }
  };

  const startTile = track.tiles.find((t) => t.type === "start");
  const finishTile = track.tiles.find((t) => t.type === "finish");
  if (startTile) { addCheckerLine(startTile); addGate(startTile, 0x2fbf4a); }
  if (finishTile) { addCheckerLine(finishTile); addGate(finishTile, 0xe63946); }
  for (const cp of checkpoints) addGate(cp, 0x2f80ed, `${cp.x},${cp.y},${cp.z}`);
  for (const t of track.tiles) if (t.type === "boost") addBoostArrows(t);

  for (const [mesher, mat] of [
    [shadow, shadowMat], [road, roadMat], [roadSide, roadSideMat], [line, lineMat],
    [support, supportMat], [boost, boostMat], [props, propMat],
    [checkerLight, checkLightMat], [checkerDark, checkDarkMat],
  ] as const) {
    if (mesher.isEmpty) continue;
    const geo = mesher.build(THREE);
    disposables.push(geo);
    group.add(new THREE.Mesh(geo, mat));
  }

  const setCheckpointsLit = (hit: Set<string>) => {
    for (const [key, mats] of cpGates) {
      const c = hit.has(key) ? 0x2fbf4a : 0x2f80ed;
      mats.frame.color.setHex(c);
      mats.pane.color.setHex(c);
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

/** Bright flat shell colour. Everything else on the car is fixed. */
const CAR_COLOR = 0xf3402f;
const CAR_TRIM = 0x272e37;   // splitter, diffuser, wing posts
const CAR_GLASS = 0x3a4a5c;
const CAR_TYRE = 0x15191e;
const CAR_HUB = 0xc2cad2;
const CAR_LAMP = 0xfff1c9;
const CAR_TAIL = 0xff5347;

const P = (x: number, y: number, z: number): V3 => ({ x, y, z });

/**
 * A small low-poly car: a wedge tub with the nose dropped, a dark
 * glasshouse capped by a body-coloured roof, and four fat wheels that
 * stand proud of the sills. It is deliberately narrow — about a third of
 * the road — so the track always reads wider than the thing on it.
 *
 * Every panel is flat-shaded by construction; the only round part is the
 * ten-sided wheel.
 */
function buildCar(THREE: ThreeNS, color: number, ghostly: boolean) {
  const group = new THREE.Group();
  // Yaw first, then pitch and roll in the car's own frame.
  group.rotation.order = "YXZ";
  const disposables: Array<{ dispose: () => void }> = [];

  // A ghost is one flat silhouette, so every part shares one material.
  let ghostMat: import("three").Material | null = null;
  const mkMat = (c: number, basic = false) => {
    if (ghostly) {
      if (!ghostMat) {
        ghostMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
        disposables.push(ghostMat);
      }
      return ghostMat;
    }
    const m = basic
      ? new THREE.MeshBasicMaterial({ color: c })
      : new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    disposables.push(m);
    return m;
  };

  const shell = new Mesher();
  // Tub: narrow at the floor, flared over the sills, nose raked down.
  shell.hull(
    [P(-0.62, 0.20, -1.50), P(-0.55, 0.20, 1.58), P(0.55, 0.20, 1.58), P(0.62, 0.20, -1.50)],
    [P(-0.84, 0.74, -1.62), P(-0.70, 0.56, 1.66), P(0.70, 0.56, 1.66), P(0.84, 0.74, -1.62)],
  );
  // Roof panel over the glasshouse.
  shell.hull(
    [P(-0.56, 1.08, -1.20), P(-0.50, 1.08, -0.32), P(0.50, 1.08, -0.32), P(0.56, 1.08, -1.20)],
    [P(-0.52, 1.20, -1.15), P(-0.47, 1.20, -0.38), P(0.47, 1.20, -0.38), P(0.52, 1.20, -1.15)],
  );
  shell.box(0, 1.13, -1.50, 1.30, 0.09, 0.36);          // wing blade
  // Arches, so the wheels hang off the car instead of beside it.
  for (const sx of [-1, 1]) {
    shell.box(sx * 0.74, 0.64, 1.02, 0.38, 0.17, 1.08);
    shell.box(sx * 0.82, 0.75, -1.06, 0.38, 0.17, 1.08);
  }
  const shellGeo = shell.build(THREE);
  disposables.push(shellGeo);
  group.add(new THREE.Mesh(shellGeo, mkMat(color)));

  // Glasshouse: dark all round, raked windscreen.
  const glass = new Mesher();
  glass.hull(
    [P(-0.72, 0.56, -1.34), P(-0.64, 0.56, 0.36), P(0.64, 0.56, 0.36), P(0.72, 0.56, -1.34)],
    [P(-0.56, 1.09, -1.20), P(-0.50, 1.09, -0.32), P(0.50, 1.09, -0.32), P(0.56, 1.09, -1.20)],
  );
  const glassGeo = glass.build(THREE);
  disposables.push(glassGeo);
  group.add(new THREE.Mesh(glassGeo, mkMat(CAR_GLASS)));

  // Splitter, diffuser and the posts under the wing.
  const trim = new Mesher();
  trim.box(0, 0.20, 1.62, 1.42, 0.11, 0.42);
  trim.box(0, 0.25, -1.56, 1.28, 0.18, 0.30);
  for (const sx of [-0.44, 0.44]) trim.box(sx, 0.94, -1.49, 0.11, 0.40, 0.16);
  const trimGeo = trim.build(THREE);
  disposables.push(trimGeo);
  group.add(new THREE.Mesh(trimGeo, mkMat(CAR_TRIM)));

  const lamps = new Mesher();
  for (const sx of [-0.42, 0.42]) lamps.box(sx, 0.43, 1.64, 0.32, 0.14, 0.11);
  const lampGeo = lamps.build(THREE);
  disposables.push(lampGeo);
  group.add(new THREE.Mesh(lampGeo, mkMat(CAR_LAMP, true)));

  const tails = new Mesher();
  for (const sx of [-0.48, 0.48]) tails.box(sx, 0.58, -1.59, 0.34, 0.12, 0.10);
  const tailGeo = tails.build(THREE);
  disposables.push(tailGeo);
  group.add(new THREE.Mesh(tailGeo, mkMat(CAR_TAIL, true)));

  // Wheels: a ten-sided tyre with a pale hub, so rotation actually reads.
  const tyreGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.32, 10);
  tyreGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.34, 8);
  hubGeo.rotateZ(Math.PI / 2);
  disposables.push(tyreGeo, hubGeo);
  const tyreMat = mkMat(CAR_TYRE);
  const hubMat = mkMat(CAR_HUB);
  const wheels: Array<{ hold: import("three").Group; front: boolean }> = [];
  for (const [wx, wz, front] of [
    [-0.80, 1.02, true], [0.80, 1.02, true], [-0.80, -1.06, false], [0.80, -1.06, false],
  ] as const) {
    const hold = new THREE.Group();
    // Steering is the outer rotation, spin the inner one.
    hold.rotation.order = "YXZ";
    hold.position.set(wx, 0.40, wz);
    hold.add(new THREE.Mesh(tyreGeo, tyreMat));
    hold.add(new THREE.Mesh(hubGeo, hubMat));
    group.add(hold);
    wheels.push({ hold, front });
  }

  return {
    group,
    spinWheels: (spin: number, steer: number) => {
      for (const w of wheels) {
        w.hold.rotation.x = spin;
        w.hold.rotation.y = w.front ? steer * 0.42 : 0;
      }
    },
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}
