// Fully-3D Poly Racer runner. Rolling terrain, banked curves, ramps,
// rumble strips, chase camera. TrackParams stays compatible with all
// existing built-in levels, the editor, and custom tracks.
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { THEMES, centerAt, formatMs, type Season } from "@/lib/polytrack-engine";
import type { TrackParams } from "@/lib/track-validation";
import { KeybindEditor, useGameControls } from "@/lib/game-controls";

type PolyAction = "left" | "right" | "gas" | "brake";
const POLY_DEFAULTS: Record<PolyAction, string[]> = {
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  gas: ["ArrowUp", "w"],
  brake: ["ArrowDown", "s"],
};
const POLY_LABELS: Record<PolyAction, string> = {
  left: "Steer left",
  right: "Steer right",
  gas: "Gas",
  brake: "Brake",
};

type Props = {
  params: TrackParams;
  season: Season;
  goal: number;
  title: string;
  onFinish?: (timeMs: number) => void;
  onExit?: () => void;
  exitLabel?: string;
};

const UNIT = 0.1; // 1 design-unit = 0.1 world-units

// Terrain / road elevation derived from track params so every level's
// hills feel unique but deterministic. Amplitude scales with amp1 so
// harder (curvier) levels also get more vertical drama.
function elevationAt(designZ: number, p: TrackParams): number {
  const base = Math.sin(designZ * (p.freq1 * 0.6) + p.phase * 0.7) * (p.amp1 * 0.035);
  const bump = Math.sin(designZ * 0.028 + p.phase) * 1.2;
  return base + bump;
}

// Ramp bumps at fixed intervals — a short raised wedge the car launches off.
// Returns extra height at designZ. Only appears on harder levels via `intensity`.
function rampBumpAt(designZ: number, intensity: number): number {
  if (intensity <= 0) return 0;
  const RAMP_SPACING = 260;
  const RAMP_LEN = 28;
  const local = ((designZ % RAMP_SPACING) + RAMP_SPACING) % RAMP_SPACING;
  if (local > RAMP_LEN) return 0;
  const t = local / RAMP_LEN; // 0..1
  // triangle wave: quick rise then quick fall
  const shape = t < 0.6 ? t / 0.6 : (1 - t) / 0.4;
  return Math.max(0, shape) * 1.6 * intensity;
}

export function PolyTrackRunner({ params, season, goal, title, onFinish, onExit, exitLabel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const stateRef = useRef({
    distanceZ: 0,
    lateral: 0,
    speed: 0,
    heading: 0,
    airY: 0,
    airVy: 0,
    startTs: 0,
    moved: false,
  });

  const controls = useGameControls<PolyAction>("polytrack", POLY_DEFAULTS);

  const start = useCallback(() => {
    stateRef.current = {
      distanceZ: 0, lateral: 0, speed: 0, heading: 0,
      airY: 0, airVy: 0, startTs: 0, moved: false,
    };
    setScore(0); setElapsed(0); setDead(false); setWon(false);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const mount = mountRef.current;
    if (!mount) return;
    const theme = THEMES[season];
    const p = params;
    // Ramps only on levels with tight turns (amp1 high or freq1 high).
    const rampIntensity = Math.min(1, Math.max(0, (p.amp1 - 60) / 80) + Math.max(0, (p.freq1 - 0.008) * 40));

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(theme.ground).lerp(new THREE.Color(0xffffff), 0.55);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(skyColor, 50, 180);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(40, 80, 30);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(skyColor.getHex(), theme.ground, 0.35);
    scene.add(hemi);

    // Terrain as a dynamic plane (subdivided) that follows the car.
    const TERRAIN_W = 220, TERRAIN_D = 260;
    const TERRAIN_SEG_X = 30, TERRAIN_SEG_Z = 60;
    const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, TERRAIN_SEG_X, TERRAIN_SEG_Z);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrain = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshLambertMaterial({ color: theme.ground, flatShading: true }),
    );
    scene.add(terrain);

    // Road ribbon
    const SEG_STEP = 2;
    const AHEAD = 240;
    const BEHIND = 40;
    const totalSamples = Math.ceil((AHEAD + BEHIND) / SEG_STEP);

    const roadColor = new THREE.Color(theme.road);
    const edgeColor = new THREE.Color(theme.roadEdge);
    const dashColor = new THREE.Color(theme.dash);
    const flecksColor = new THREE.Color(theme.fleck);

    const roadGeom = new THREE.BufferGeometry();
    const roadPositions = new Float32Array(totalSamples * 2 * 3);
    const roadIndices: number[] = [];
    for (let i = 0; i < totalSamples - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      roadIndices.push(a, c, b, b, c, d);
    }
    roadGeom.setAttribute("position", new THREE.BufferAttribute(roadPositions, 3));
    roadGeom.setIndex(roadIndices);
    const road = new THREE.Mesh(roadGeom, new THREE.MeshLambertMaterial({ color: roadColor, flatShading: true }));
    scene.add(road);

    // Rumble strips: alternating red/white boxes along each edge.
    const rumbleGroup = new THREE.Group();
    scene.add(rumbleGroup);
    const RUMBLES = 60;
    const rumbles: { mesh: THREE.Mesh; side: number; idx: number }[] = [];
    for (let i = 0; i < RUMBLES; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const color = (i >> 1) % 2 === 0 ? 0xef4444 : 0xffffff;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.15, 1.6),
        new THREE.MeshLambertMaterial({ color }),
      );
      rumbleGroup.add(m);
      rumbles.push({ mesh: m, side, idx: i });
    }

    // Center dash line
    const dashGeom = new THREE.BufferGeometry();
    const dashPositions = new Float32Array(totalSamples * 3);
    dashGeom.setAttribute("position", new THREE.BufferAttribute(dashPositions, 3));
    const dashLine = new THREE.LineSegments(dashGeom, new THREE.LineBasicMaterial({ color: dashColor }));
    scene.add(dashLine);

    // Scenery
    const sceneryGroup = new THREE.Group();
    scene.add(sceneryGroup);
    const sceneryGeo = season === "winter"
      ? new THREE.ConeGeometry(1.1, 3.2, 5)
      : season === "summer"
        ? new THREE.ConeGeometry(1.4, 1.8, 4)
        : new THREE.ConeGeometry(1.0, 3.0, 6);
    const sceneryMat = new THREE.MeshLambertMaterial({ color: flecksColor, flatShading: true });
    const SCENERY_COUNT = 70;
    const sceneryInstances: { mesh: THREE.Mesh; baseZ: number; side: number; offset: number }[] = [];
    for (let i = 0; i < SCENERY_COUNT; i++) {
      const m = new THREE.Mesh(sceneryGeo, sceneryMat);
      const side = i % 2 === 0 ? -1 : 1;
      const offset = 5 + (i * 1.37) % 18;
      const baseZ = (i / SCENERY_COUNT) * (AHEAD + BEHIND);
      m.scale.setScalar(0.6 + ((i * 13) % 10) * 0.09);
      sceneryGroup.add(m);
      sceneryInstances.push({ mesh: m, baseZ, side, offset });
    }

    // Ramps: raised wedge meshes placed at the same locations rampBumpAt() peaks.
    const rampGroup = new THREE.Group();
    scene.add(rampGroup);
    const rampMeshes: THREE.Mesh[] = [];
    if (rampIntensity > 0) {
      const rampMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b, flatShading: true });
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.half * UNIT * 1.6, 1.2 * rampIntensity, 2.6), rampMat);
        rampGroup.add(m);
        rampMeshes.push(m);
      }
    }

    // Finish line
    const finishGroup = new THREE.Group();
    const finishBar = new THREE.Mesh(
      new THREE.BoxGeometry(p.half * UNIT * 2.2, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    finishBar.position.y = 3;
    finishGroup.add(finishBar);
    const poleGeo = new THREE.BoxGeometry(0.2, 3, 0.2);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(sx * p.half * UNIT * 1.05, 1.5, 0);
      finishGroup.add(pole);
    }
    for (let i = 0; i < 10; i++) {
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(((p.half * UNIT * 2) / 10), 0.06, 0.7),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x000000 : 0xffffff }),
      );
      sq.position.x = -p.half * UNIT + ((p.half * UNIT * 2) / 10) * (i + 0.5);
      sq.position.y = 0.05;
      finishGroup.add(sq);
    }
    finishGroup.visible = false;
    scene.add(finishGroup);

    // Car (low-poly). Forward is -Z. Cabin toward +Z (rear), headlights at -Z.
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.6, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xef4444, flatShading: true }),
    );
    body.position.y = 0.5;
    car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.5, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    cabin.position.set(0, 0.95, 0.35);
    car.add(cabin);
    for (const hx of [-0.45, 0.45]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.15, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xfff2a8 }),
      );
      light.position.set(hx, 0.55, -1.28);
      car.add(light);
    }
    for (const [x, z] of [[-0.7, 0.9], [0.7, 0.9], [-0.7, -0.9], [0.7, -0.9]]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12),
        new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.3, z);
      car.add(w);
    }
    scene.add(car);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const worldXAt = (designZ: number, lateralOffset = 0) => {
      const cx = centerAt(designZ, p) - 240;
      return (cx + lateralOffset) * UNIT;
    };
    const roadYAt = (designZ: number) =>
      elevationAt(designZ, p) + rampBumpAt(designZ, rampIntensity);

    let raf = 0;
    const clock = new THREE.Clock();

    const loop = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const s = stateRef.current;
      const k = controls.pressed.current;
      const turn = (k.left ? -1 : 0) + (k.right ? 1 : 0);
      const gas = k.gas ? 1 : 0;
      const brake = k.brake ? 1 : 0;

      const onGround = s.airY <= 0.001;
      const targetAccel = onGround ? gas * 20 - brake * 15 : 0;
      s.speed += targetAccel * dt;
      s.speed *= Math.pow(0.5, dt * 0.75);
      s.speed = Math.max(0, Math.min(s.speed, 46));

      const steerAuthority = Math.min(1, s.speed / 6) * (onGround ? 1 : 0.35);
      s.heading += turn * 2.5 * steerAuthority * dt;
      s.heading *= Math.pow(0.5, dt * 4);

      const advance = s.speed * dt / UNIT;
      s.distanceZ += advance;
      s.lateral += Math.sin(s.heading) * s.speed * dt / UNIT;

      // Vertical: hills push the car up smoothly; ramps launch it.
      const groundY = roadYAt(s.distanceZ);
      const prevGroundY = roadYAt(s.distanceZ - advance * 0.5);
      const slope = (groundY - prevGroundY);
      // Ramp launch: if we just crossed the peak of a ramp with speed, kick vertical velocity.
      if (rampIntensity > 0 && slope < -0.05 && s.speed > 12 && onGround) {
        s.airVy = 6 + s.speed * 0.15;
      }
      s.airVy -= 22 * dt; // gravity
      s.airY = Math.max(0, s.airY + s.airVy * dt);
      if (s.airY <= 0) s.airVy = 0;

      if (!s.moved && (gas || brake || turn)) { s.moved = true; s.startTs = performance.now(); }
      if (s.moved) setElapsed(performance.now() - s.startTs);

      const cxDesign = centerAt(s.distanceZ, p);
      const carDesignX = cxDesign + s.lateral;
      if (carDesignX < 0 || carDesignX > 480 || Math.abs(s.lateral) > p.half) {
        setRunning(false); setDead(true); cancelAnimationFrame(raf); return;
      }

      const progress = Math.max(0, Math.floor(s.distanceZ / 10));
      setScore(progress);
      if (progress >= goal) {
        const finalMs = s.moved ? performance.now() - s.startTs : 0;
        setElapsed(finalMs); setRunning(false); setWon(true);
        onFinish?.(Math.max(500, Math.round(finalMs)));
        cancelAnimationFrame(raf); return;
      }

      // Update road ribbon with real Y from terrain + ramps.
      const startDesignZ = s.distanceZ - BEHIND;
      const rp = road.geometry.attributes.position as THREE.BufferAttribute;
      const dp = dashLine.geometry.attributes.position as THREE.BufferAttribute;
      const dashArr = dp.array as Float32Array;
      const dashPairs: number[] = [];
      for (let i = 0; i < totalSamples; i++) {
        const dz = startDesignZ + i * SEG_STEP;
        const cx = worldXAt(dz);
        const wz = -((dz - s.distanceZ) * UNIT);
        const halfW = p.half * UNIT;
        const y = roadYAt(dz) + 0.05;
        rp.setXYZ(i * 2, cx - halfW, y, wz);
        rp.setXYZ(i * 2 + 1, cx + halfW, y, wz);
        if (i < totalSamples - 1 && i % 3 === 0) {
          dashPairs.push(cx, y + 0.02, wz);
          const dz2 = startDesignZ + (i + 1) * SEG_STEP;
          const cx2 = worldXAt(dz2);
          const wz2 = -((dz2 - s.distanceZ) * UNIT);
          dashPairs.push(cx2, roadYAt(dz2) + 0.07, wz2);
        }
      }
      for (let i = 0; i < dashArr.length; i++) dashArr[i] = 0;
      for (let i = 0; i < dashPairs.length && i < dashArr.length; i++) dashArr[i] = dashPairs[i];
      rp.needsUpdate = true;
      dp.needsUpdate = true;
      road.geometry.computeVertexNormals();
      road.geometry.computeBoundingSphere();

      // Terrain heightmap update
      const tp = terrain.geometry.attributes.position as THREE.BufferAttribute;
      const carWorldX = worldXAt(s.distanceZ, s.lateral);
      for (let iz = 0; iz <= TERRAIN_SEG_Z; iz++) {
        for (let ix = 0; ix <= TERRAIN_SEG_X; ix++) {
          const idx = iz * (TERRAIN_SEG_X + 1) + ix;
          const localX = (ix / TERRAIN_SEG_X - 0.5) * TERRAIN_W;
          const localZ = (iz / TERRAIN_SEG_Z - 0.5) * TERRAIN_D;
          const worldZ = -localZ; // plane's local z becomes world z after rotation
          const dz = s.distanceZ - worldZ / UNIT;
          const baseY = roadYAt(dz);
          // Off-road wobble
          const wobble = Math.sin(localX * 0.15 + dz * 0.02) * 0.6 + Math.cos(localX * 0.07) * 0.4;
          tp.setXYZ(idx, localX + carWorldX, baseY - 0.2 + wobble, localZ);
        }
      }
      tp.needsUpdate = true;
      terrain.geometry.computeVertexNormals();

      // Rumble strips (short segments hugging both edges, spaced along track)
      const halfW = p.half * UNIT;
      for (const r of rumbles) {
        const spacing = (AHEAD + BEHIND) / (RUMBLES / 2);
        const relZ = ((r.idx >> 1) * spacing) - BEHIND;
        const dz = s.distanceZ + relZ;
        const cx = worldXAt(dz);
        const wz = -(relZ * UNIT);
        const y = roadYAt(dz) + 0.15;
        r.mesh.position.set(cx + r.side * (halfW + 0.4), y, wz);
      }

      // Ramps: place at nearest 8 ramp-locations
      if (rampMeshes.length) {
        const RAMP_SPACING = 260;
        const nearestBase = Math.floor((s.distanceZ - 60) / RAMP_SPACING) * RAMP_SPACING;
        for (let i = 0; i < rampMeshes.length; i++) {
          const dz = nearestBase + i * RAMP_SPACING;
          const relZ = dz - s.distanceZ;
          if (relZ < -40 || relZ > AHEAD) { rampMeshes[i].visible = false; continue; }
          rampMeshes[i].visible = true;
          const cx = worldXAt(dz + 14);
          const wz = -(relZ + 14) * UNIT;
          rampMeshes[i].position.set(cx, roadYAt(dz + 14) + 0.6 * rampIntensity, wz);
        }
      }

      // Scenery reposition
      const range = AHEAD + BEHIND;
      for (const inst of sceneryInstances) {
        const relZ = (inst.baseZ - (s.distanceZ % range) + range) % range - BEHIND;
        const dz = s.distanceZ + relZ;
        const cx = worldXAt(dz);
        const wz = -(relZ * UNIT);
        const x = cx + inst.side * (halfW + inst.offset);
        inst.mesh.position.set(x, roadYAt(dz) + inst.mesh.scale.y * 0.9, wz);
      }

      // Finish
      const remaining = goal - progress;
      if (remaining < 60) {
        const finishDesignZ = goal * 10;
        const cx = worldXAt(finishDesignZ);
        const wz = -((finishDesignZ - s.distanceZ) * UNIT);
        finishGroup.position.set(cx, roadYAt(finishDesignZ), wz);
        finishGroup.visible = true;
      } else {
        finishGroup.visible = false;
      }

      // Car placement + bank into turns
      const carX = worldXAt(s.distanceZ, s.lateral);
      const carY = groundY + s.airY;
      car.position.set(carX, carY, 0);
      car.rotation.set(0, -s.heading, 0);
      // pitch = slope, roll = steering bank
      const pitch = Math.atan2(-slope, SEG_STEP * UNIT);
      car.rotation.x = pitch;
      car.rotation.z = -turn * 0.15 * steerAuthority;

      // Chase camera follows behind + above, looks ahead
      const camBack = 7;
      const camHeight = 3.6;
      const lookAhead = 8;
      const lookY = roadYAt(s.distanceZ + lookAhead / UNIT);
      camera.position.set(
        carX - Math.sin(-s.heading) * 1.2,
        carY + camHeight,
        camBack,
      );
      camera.lookAt(worldXAt(s.distanceZ + lookAhead / UNIT), lookY + 0.8, -lookAhead);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      terrainGeo.dispose();
      roadGeom.dispose();
      dashGeom.dispose();
      sceneryGeo.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [running, params, season, goal, onFinish, controls]);

  const touchBtn = (a: PolyAction) => ({
    onTouchStart: () => controls.press(a, true),
    onTouchEnd: () => controls.press(a, false),
    onMouseDown: () => controls.press(a, true),
    onMouseUp: () => controls.press(a, false),
    onMouseLeave: () => controls.press(a, false),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{THEMES[season].emoji} {title}</h1>
        {onExit && (
          <Button size="sm" variant="ghost" onClick={onExit}>{exitLabel ?? "Back"}</Button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>Progress: <span className="font-semibold">{score} / {goal}</span> · <span className="font-mono">{formatMs(elapsed)}</span></div>
        <Button size="sm" variant="secondary" onClick={start}>
          {running ? "Restart" : won ? "Play again" : dead ? "Try again" : "Start"}
        </Button>
      </div>
      <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-black">
        <div ref={mountRef} className="absolute inset-0" />
        {!running && !won && !dead && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center">
            <div>
              <div className="text-lg font-semibold text-white">3D Poly Racer</div>
              <p className="mt-1 text-sm text-white/80">Rolling hills, rumble strips, and jump ramps on harder tracks.</p>
              <Button size="sm" className="mt-3" onClick={start}>Start</Button>
            </div>
          </div>
        )}
        {won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Finish! 🏁</div>
            <p className="mt-1 text-sm text-white/80 font-mono">{formatMs(elapsed)}</p>
            <Button size="sm" className="mt-3" onClick={start}>Play again</Button>
          </div>
        )}
        {dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center animate-game-over-in">
            <div className="text-2xl font-bold text-white">Off the road!</div>
            <Button size="sm" className="mt-3" onClick={start}>Try again</Button>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
        <Button variant="secondary" {...touchBtn("left")}>←</Button>
        <Button variant="secondary" {...touchBtn("gas")}>Gas</Button>
        <Button variant="secondary" {...touchBtn("brake")}>Brake</Button>
        <Button variant="secondary" {...touchBtn("right")}>→</Button>
      </div>
      <KeybindEditor controls={controls} labels={POLY_LABELS} />
      <p className="mt-3 text-xs text-muted-foreground">
        Original low-poly 3D racer inspired by Kodub's PolyTrack.
      </p>
    </div>
  );
}
