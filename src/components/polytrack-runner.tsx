// 3D DAP Track runner (three.js, client-only).
// three is loaded via dynamic import inside useEffect so it never
// enters the SSR bundle or the main chat bundle.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { THEMES, TILE, ROAD_HALF, RAMP_H, formatMs, rotateXZ, type Season } from "@/lib/polytrack-engine";
import { isTrackData, type TrackData, type Tile } from "@/lib/track-validation";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

type Action = "left" | "right" | "gas" | "brake" | "handbrake" | "reset" | "pause";
const DEFAULTS: Record<Action, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  gas: ["ArrowUp", "w"],
  brake: ["ArrowDown", "s"],
  handbrake: [" "],
  reset: ["r"],
  pause: ["Escape", "p"],
};
const LABELS: Record<Action, string> = {
  left: "Steer left", right: "Steer right", gas: "Accelerate",
  brake: "Brake / reverse", handbrake: "Handbrake", reset: "Reset to checkpoint", pause: "Pause",
};

type Props = {
  data: unknown;             // TrackData v2 (or legacy — shows fallback)
  season: Season;
  goal: number;
  title: string;
  onFinish?: (timeMs: number) => void;
  onExit?: () => void;
  exitLabel?: string;
};

type GhostSample = { t: number; px: number; py: number; pz: number; ry: number };

const PB_KEY = (trackRef?: string) => trackRef ? `dap.track.ghost.${trackRef}` : null;

export function PolyTrackRunner(props: Props & { trackRef?: string }) {
  const { data, season, title, onFinish, onExit, exitLabel, trackRef } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const controls = useGameControls<Action>("dap-track", DEFAULTS);
  const [timeMs, setTimeMs] = useState(0);
  const [status, setStatus] = useState<"ready" | "running" | "finished" | "paused">("ready");
  const [err, setErr] = useState<string | null>(null);

  const legacy = !isTrackData(data);

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

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(theme.sky);
      scene.fog = new THREE.Fog(theme.sky, 60, 220);

      const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
      camera.position.set(0, 8, 12);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = false;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      const resize = () => {
        const w = el.clientWidth || 480;
        const h = el.clientHeight || 640;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(30, 60, 20);
      scene.add(sun);

      // Ground
      const groundGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.position.y = -0.05;
      scene.add(ground);

      // Build tiles.
      const roadMat = new THREE.MeshLambertMaterial({ color: theme.road, flatShading: true });
      const edgeMat = new THREE.MeshLambertMaterial({ color: theme.roadEdge, flatShading: true });
      const startMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const finishMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const cpMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });

      const tileMap = new Map<string, Tile>();
      for (const t of track.tiles) tileMap.set(`${t.x},${t.z}`, t);

      const roadTiles: Tile[] = [];
      const checkpoints: Tile[] = [];
      let startTile: Tile | null = null;
      let finishTile: Tile | null = null;

      // Compute center for camera framing.
      let cx = 0, cz = 0;
      for (const t of track.tiles) { cx += t.x; cz += t.z; }
      cx = cx / track.tiles.length; cz = cz / track.tiles.length;

      for (const t of track.tiles) {
        if (t.type === "start") startTile = t;
        else if (t.type === "finish") finishTile = t;
        else if (t.type === "checkpoint") checkpoints.push(t);
        roadTiles.push(t);
      }

      const worldX = (gx: number) => (gx - cx) * TILE;
      const worldZ = (gz: number) => (gz - cz) * TILE;
      const elevY = (t: Tile) => (t.elev ?? 0) * RAMP_H;

      // Build simple road slabs per tile.
      for (const t of track.tiles) {
        const wx = worldX(t.x), wz = worldZ(t.z);
        const y = elevY(t);
        if (t.type === "curveL" || t.type === "curveR") {
          // Quarter-torus segment
          const sign = t.type === "curveL" ? 1 : -1;
          const geom = new THREE.RingGeometry(TILE / 2 - ROAD_HALF, TILE / 2 + ROAD_HALF, 24, 1, 0, Math.PI / 2);
          geom.rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geom, roadMat);
          mesh.position.set(wx + sign * TILE / 2, y + 0.02, wz + TILE / 2);
          mesh.rotation.y = ((t.rot * Math.PI) / 2) + (sign > 0 ? Math.PI : Math.PI / 2);
          scene.add(mesh);
        } else if (t.type === "rampUp" || t.type === "rampDown") {
          const geom = new THREE.PlaneGeometry(ROAD_HALF * 2, TILE);
          geom.rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geom, roadMat);
          const rotY = (t.rot * Math.PI) / 2;
          mesh.rotation.y = rotY;
          const tilt = t.type === "rampUp" ? -0.22 : 0.22;
          // Pitch about local X after Y-rotation via group
          const g = new THREE.Group();
          g.position.set(wx, y + RAMP_H / 2 + 0.02, wz);
          g.rotation.y = rotY;
          const inner = new THREE.Mesh(geom, roadMat);
          inner.rotation.x = tilt;
          g.add(inner);
          scene.add(g);
        } else {
          // Straight / start / finish / checkpoint — flat slab
          const geom = new THREE.PlaneGeometry(ROAD_HALF * 2, TILE);
          geom.rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geom, roadMat);
          mesh.position.set(wx, y + 0.02, wz);
          mesh.rotation.y = (t.rot * Math.PI) / 2;
          scene.add(mesh);

          // Stripe overlays
          if (t.type === "start" || t.type === "finish" || t.type === "checkpoint") {
            const stripeGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, 0.6);
            stripeGeo.rotateX(-Math.PI / 2);
            const mat = t.type === "start" ? startMat : t.type === "finish" ? finishMat : cpMat;
            const stripe = new THREE.Mesh(stripeGeo, mat);
            stripe.position.set(wx, y + 0.06, wz);
            stripe.rotation.y = (t.rot * Math.PI) / 2;
            scene.add(stripe);
          }
        }
        // Curb edges for straights
        if (t.type !== "curveL" && t.type !== "curveR") {
          const curbGeo = new THREE.BoxGeometry(0.4, 0.3, TILE);
          for (const side of [-1, 1]) {
            const curb = new THREE.Mesh(curbGeo, edgeMat);
            const [ex, ez] = rotateXZ(side * (ROAD_HALF + 0.2), 0, t.rot);
            curb.position.set(wx + ex, y + 0.15, wz + ez);
            curb.rotation.y = (t.rot * Math.PI) / 2;
            scene.add(curb);
          }
        }
      }

      // Car
      const car = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(1.6, 0.5, 3);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xef4444, flatShading: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      car.add(body);
      const cabGeo = new THREE.BoxGeometry(1.3, 0.5, 1.4);
      const cab = new THREE.Mesh(cabGeo, new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true }));
      cab.position.set(0, 0.95, -0.2);
      car.add(cab);
      // Front markers
      const hlGeo = new THREE.BoxGeometry(0.3, 0.2, 0.15);
      const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff5b8 });
      for (const sx of [-0.5, 0.5]) {
        const hl = new THREE.Mesh(hlGeo, hlMat);
        hl.position.set(sx, 0.55, 1.55);
        car.add(hl);
      }
      scene.add(car);

      // Ghost car
      const ghost = new THREE.Group();
      const gBody = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      gBody.position.y = 0.5;
      ghost.add(gBody);
      ghost.visible = false;
      scene.add(ghost);

      // State
      let sx = 0, sy = 0, sz = 0, sYaw = 0;
      if (startTile) {
        sx = worldX(startTile.x);
        sz = worldZ(startTile.z);
        sy = elevY(startTile) + 0.4;
        sYaw = (startTile.rot * Math.PI) / 2;
      }
      let px = sx, py = sy, pz = sz, yaw = sYaw;
      let vel = 0;             // forward velocity
      let vy = 0;              // vertical velocity
      let steer = 0;
      let lastCheckpoint = { x: sx, y: sy, z: sz, yaw: sYaw };

      const cpHit = new Set<string>();
      const totalCheckpoints = checkpoints.length;
      let finishArmed = totalCheckpoints === 0; // if none, finishing anytime works
      let raceStart = 0;
      let elapsed = 0;
      let running = false;
      let paused = false;
      let finished = false;

      // Ghost load
      let ghostSamples: GhostSample[] = [];
      const gKey = PB_KEY(trackRef);
      if (gKey) {
        try {
          const raw = localStorage.getItem(gKey);
          if (raw) ghostSamples = JSON.parse(raw) as GhostSample[];
        } catch { /* ignore */ }
      }
      const recording: GhostSample[] = [];

      const resetToCheckpoint = () => {
        px = lastCheckpoint.x; py = lastCheckpoint.y + 0.5; pz = lastCheckpoint.z;
        yaw = lastCheckpoint.yaw; vel = 0; vy = 0;
      };
      const fullReset = () => {
        px = sx; py = sy; pz = sz; yaw = sYaw; vel = 0; vy = 0;
        lastCheckpoint = { x: sx, y: sy, z: sz, yaw: sYaw };
        cpHit.clear(); finishArmed = totalCheckpoints === 0;
        raceStart = performance.now(); elapsed = 0; recording.length = 0;
        running = true; finished = false;
        setStatus("running");
      };

      // Point-in-tile lookup
      const tileAt = (wx: number, wz: number): Tile | null => {
        const gx = Math.round(wx / TILE + cx);
        const gz = Math.round(wz / TILE + cz);
        return tileMap.get(`${gx},${gz}`) ?? null;
      };

      // Camera fly-in
      let flyIn = 1.0;

      let last = performance.now();
      const step = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (!paused) {
          // Inputs
          const p = controls.pressed.current;
          const throttle = (p.gas ? 1 : 0) - (p.brake ? 1 : 0);
          const steerIn = (p.left ? 1 : 0) - (p.right ? 1 : 0);
          const handbrake = !!p.handbrake;

          if (!running && !finished && (p.gas || p.brake)) {
            fullReset();
          }

          const maxSpeed = 32;
          const accel = 18;
          const brakeStr = 26;
          const drag = 0.6;
          if (throttle > 0) vel += accel * dt;
          else if (throttle < 0) vel -= brakeStr * dt;
          vel -= vel * drag * dt;
          if (handbrake) vel -= vel * 1.5 * dt;
          vel = Math.max(-12, Math.min(maxSpeed, vel));

          steer += (steerIn * 2.6 - steer) * Math.min(1, dt * 8);
          const grip = handbrake ? 0.55 : 1;
          yaw += steer * (vel / maxSpeed) * 2.4 * dt * grip;

          const fx = Math.sin(yaw);
          const fz = Math.cos(yaw);
          px += fx * vel * dt;
          pz += fz * vel * dt;

          // Ground contact — tile-aware
          const t = tileAt(px, pz);
          let groundY = 0;
          let onRoad = false;
          if (t) {
            onRoad = true;
            groundY = elevY(t);
            if (t.type === "rampUp" || t.type === "rampDown") {
              // Local Z within tile (-TILE/2..TILE/2) in tile-local rotation
              const wx0 = worldX(t.x), wz0 = worldZ(t.z);
              // Inverse rotate the offset by -rot
              const [lx, lz] = rotateXZ(px - wx0, pz - wz0, (4 - t.rot) % 4);
              const norm = Math.max(0, Math.min(1, (lz + TILE / 2) / TILE));
              const rise = t.type === "rampUp" ? norm : (1 - norm);
              groundY = elevY(t) + rise * RAMP_H;
              // silence unused
              void lx;
            }
          }

          vy -= 30 * dt;
          py += vy * dt;
          if (py <= groundY + 0.4) {
            py = groundY + 0.4;
            if (vy < 0) vy = 0;
          }

          if (!onRoad && running) {
            // Fell off — slow the car dramatically to encourage reset
            vel *= 0.92;
          }

          // Checkpoint / finish detection
          if (t) {
            if (t.type === "checkpoint") {
              const k = `${t.x},${t.z}`;
              if (!cpHit.has(k)) {
                cpHit.add(k);
                lastCheckpoint = { x: worldX(t.x), y: elevY(t), z: worldZ(t.z), yaw };
              }
              if (cpHit.size >= totalCheckpoints) finishArmed = true;
            } else if (t.type === "start" && running) {
              // start also acts as a soft checkpoint
              lastCheckpoint = { x: worldX(t.x), y: elevY(t), z: worldZ(t.z), yaw };
            } else if (t.type === "finish" && running && finishArmed && !finished) {
              finished = true;
              running = false;
              const total = performance.now() - raceStart;
              // Ghost save if PB
              if (gKey) {
                try {
                  const prev = localStorage.getItem(`dap.track.pb.${trackRef}`);
                  const prevN = prev ? Number(prev) : Infinity;
                  if (total < prevN) {
                    localStorage.setItem(`dap.track.pb.${trackRef}`, String(Math.round(total)));
                    localStorage.setItem(gKey, JSON.stringify(recording));
                  }
                } catch { /* ignore */ }
              }
              setStatus("finished");
              setTimeMs(total);
              onFinish?.(Math.round(total));
            }
          }

          if (running) {
            elapsed = performance.now() - raceStart;
            setTimeMs(elapsed);
            // Record ghost sample every ~50ms
            const lastRec = recording[recording.length - 1];
            if (!lastRec || elapsed - lastRec.t > 50) {
              recording.push({ t: elapsed, px, py, pz, ry: yaw });
            }
          }
        }

        // Update car mesh
        car.position.set(px, py, pz);
        car.rotation.y = yaw;

        // Ghost playback
        if (ghostSamples.length > 1 && running) {
          const et = elapsed;
          let i = 0;
          while (i < ghostSamples.length - 1 && ghostSamples[i + 1].t < et) i++;
          const a = ghostSamples[i], b = ghostSamples[Math.min(i + 1, ghostSamples.length - 1)];
          const span = Math.max(1, b.t - a.t);
          const k = Math.max(0, Math.min(1, (et - a.t) / span));
          ghost.position.set(a.px + (b.px - a.px) * k, a.py + (b.py - a.py) * k, a.pz + (b.pz - a.pz) * k);
          ghost.rotation.y = a.ry + (b.ry - a.ry) * k;
          ghost.visible = true;
        } else {
          ghost.visible = false;
        }

        // Chase camera
        const behind = 9, above = 5;
        const camTargetX = px - Math.sin(yaw) * behind;
        const camTargetZ = pz - Math.cos(yaw) * behind;
        const camTargetY = py + above;
        // Fly-in blends from an angled starting position
        flyIn = Math.max(0, flyIn - dt * 0.5);
        const flyLift = flyIn * 10;
        const lerp = 1 - Math.pow(0.001, dt);
        camera.position.x += (camTargetX - camera.position.x) * lerp;
        camera.position.z += (camTargetZ - camera.position.z) * lerp;
        camera.position.y += (camTargetY + flyLift - camera.position.y) * lerp;
        camera.lookAt(px, py + 1, pz);

        renderer.render(scene, camera);
        raf = requestAnimationFrame(step);
      };
      let raf = requestAnimationFrame(step);

      // Keyboard: reset + pause outside the useGameControls "pressed" model
      const onKey = (e: KeyboardEvent) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (controls.bindings.reset.includes(k)) {
          if (running) resetToCheckpoint();
          else if (finished) fullReset();
        }
        if (controls.bindings.pause.includes(k)) {
          paused = !paused;
          setStatus(paused ? "paused" : running ? "running" : finished ? "finished" : "ready");
          if (!paused) last = performance.now();
        }
      };
      window.addEventListener("keydown", onKey);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        ro.disconnect();
        renderer.dispose();
        el.removeChild(renderer.domElement);
        scene.traverse((o) => {
          const m = o as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
          m.geometry?.dispose?.();
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose?.());
          else m.material?.dispose?.();
        });
      };
    })().catch((e: Error) => setErr(e.message));

    return () => {
      disposed = true;
      cleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, season, legacy]);

  if (legacy) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-lg font-semibold">Legacy track</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This track was built with the old 2D format and isn't playable in the new 3D engine.
        </p>
        {onExit && <Button className="mt-4" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">WASD/Arrows · Space handbrake · R reset · Esc pause</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-black/60 px-3 py-1 font-mono text-sm text-white">{formatMs(timeMs)}</div>
          {onExit && <Button size="sm" variant="secondary" onClick={onExit}>{exitLabel ?? "Back"}</Button>}
        </div>
      </div>
      <div ref={wrapRef} className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-black">
        {status === "ready" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 text-center text-white">
            <div>
              <div className="text-lg font-semibold">Press W or ↑ to start</div>
              <div className="mt-1 text-xs opacity-80">Chase the ghost of your best run.</div>
            </div>
          </div>
        )}
        {status === "paused" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50 text-white">
            <div className="text-lg font-semibold">Paused</div>
          </div>
        )}
        {status === "finished" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50 text-white">
            <div className="text-center">
              <div className="text-lg font-semibold">Finish!</div>
              <div className="mt-1 font-mono">{formatMs(timeMs)}</div>
              <div className="mt-1 text-xs opacity-80">Press R to run it again.</div>
            </div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm text-red-300">
            {err}
          </div>
        )}
      </div>

      <TouchPad controls={controls} />
      <div className="mt-4 hidden sm:block">
        <KeybindEditor controls={controls} labels={LABELS} />
      </div>
    </div>
  );
}

function TouchPad({ controls }: { controls: ReturnType<typeof useGameControls<Action>> }) {
  const hold = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); controls.press(a, true); },
    onPointerUp:   (e: React.PointerEvent) => { controls.press(a, false); },
    onPointerCancel: () => controls.press(a, false),
    onPointerLeave: () => controls.press(a, false),
  });
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
      <button className="col-span-1 h-14 rounded-lg bg-muted/70 text-lg" {...hold("left")}>◀</button>
      <button className="col-span-1 h-14 rounded-lg bg-muted/70 text-lg" {...hold("gas")}>▲</button>
      <button className="col-span-1 h-14 rounded-lg bg-muted/70 text-lg" {...hold("brake")}>▼</button>
      <button className="col-span-1 h-14 rounded-lg bg-muted/70 text-lg" {...hold("right")}>▶</button>
      <button className="col-span-2 h-12 rounded-lg bg-muted/70 text-sm" {...hold("handbrake")}>Handbrake</button>
      <button className="col-span-2 h-12 rounded-lg bg-muted/70 text-sm" onClick={() => { controls.press("reset", true); setTimeout(() => controls.press("reset", false), 50); }}>Reset</button>
    </div>
  );
}
