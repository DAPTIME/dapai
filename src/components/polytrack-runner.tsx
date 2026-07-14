// 3D Poly Racer runner using Three.js. Low-poly third-person racer.
// Same TrackParams interface as the 2D engine so existing levels, editor,
// and custom tracks work unchanged.
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

// Convert design-space (2D engine) horizontal center to a world X offset.
// The 2D engine uses W=480. We treat 1 design-unit = 0.1 world units so a
// half-width of ~96 becomes a ~19 unit wide road (nice scale for the car).
const UNIT = 0.1;

export function PolyTrackRunner({ params, season, goal, title, onFinish, onExit, exitLabel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const stateRef = useRef({
    // distanceZ = how far along the track we've driven (in design-space units, matches 2D engine "trackOffset")
    distanceZ: 0,
    // lateral offset from track centerline in design-space units
    lateral: 0,
    speed: 0,       // forward speed (design units / frame)
    heading: 0,     // steering heading offset (radians)
    startTs: 0,
    moved: false,
  });

  const controls = useGameControls<PolyAction>("polytrack", POLY_DEFAULTS);

  const start = useCallback(() => {
    stateRef.current = {
      distanceZ: 0,
      lateral: 0,
      speed: 0,
      heading: 0,
      startTs: 0,
      moved: false,
    };
    setScore(0);
    setElapsed(0);
    setDead(false);
    setWon(false);
    setRunning(true);
  }, []);

  // Build & tear down the three.js scene per run.
  useEffect(() => {
    if (!running) return;
    const mount = mountRef.current;
    if (!mount) return;
    const theme = THEMES[season];
    const p = params;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.ground);
    scene.fog = new THREE.Fog(theme.ground, 40, 160);

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    // Ground plane (large, tiles with camera)
    const groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Build the road as a long ribbon of segments following centerAt().
    // We build enough ahead of the car and recycle by shifting geometry.
    const SEG_STEP = 2;         // design-units between samples
    const AHEAD = 220;          // design-units of road drawn in front
    const BEHIND = 40;          // design-units drawn behind
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
    const road = new THREE.Mesh(roadGeom, new THREE.MeshLambertMaterial({ color: roadColor, side: THREE.DoubleSide }));
    scene.add(road);

    // Center dash line
    const dashGeom = new THREE.BufferGeometry();
    const dashPositions = new Float32Array(totalSamples * 3);
    dashGeom.setAttribute("position", new THREE.BufferAttribute(dashPositions, 3));
    const dashLine = new THREE.LineSegments(dashGeom, new THREE.LineBasicMaterial({ color: dashColor }));
    scene.add(dashLine);

    // Edge lines
    const leftEdgeGeom = new THREE.BufferGeometry();
    const leftEdgePos = new Float32Array(totalSamples * 3);
    leftEdgeGeom.setAttribute("position", new THREE.BufferAttribute(leftEdgePos, 3));
    const leftEdge = new THREE.Line(leftEdgeGeom, new THREE.LineBasicMaterial({ color: edgeColor }));
    scene.add(leftEdge);

    const rightEdgeGeom = new THREE.BufferGeometry();
    const rightEdgePos = new Float32Array(totalSamples * 3);
    rightEdgeGeom.setAttribute("position", new THREE.BufferAttribute(rightEdgePos, 3));
    const rightEdge = new THREE.Line(rightEdgeGeom, new THREE.LineBasicMaterial({ color: edgeColor }));
    scene.add(rightEdge);

    // Scenery: low-poly cones/pyramids scattered on either side (trees/rocks/dunes).
    const sceneryGroup = new THREE.Group();
    scene.add(sceneryGroup);
    const sceneryGeo = season === "winter"
      ? new THREE.ConeGeometry(1.1, 3.2, 5)
      : season === "summer"
        ? new THREE.ConeGeometry(1.4, 1.8, 4)   // dunes
        : new THREE.ConeGeometry(1.0, 3.0, 6);  // trees
    const sceneryMat = new THREE.MeshLambertMaterial({ color: flecksColor });
    const SCENERY_COUNT = 60;
    const sceneryInstances: { mesh: THREE.Mesh; baseZ: number; side: number; offset: number }[] = [];
    for (let i = 0; i < SCENERY_COUNT; i++) {
      const m = new THREE.Mesh(sceneryGeo, sceneryMat);
      const side = i % 2 === 0 ? -1 : 1;
      const offset = 4 + (i * 1.37) % 14;
      const baseZ = (i / SCENERY_COUNT) * (AHEAD + BEHIND);
      m.scale.setScalar(0.6 + ((i * 13) % 10) * 0.08);
      sceneryGroup.add(m);
      sceneryInstances.push({ mesh: m, baseZ, side, offset });
    }

    // Finish line group (built once, positioned when in view)
    const finishGroup = new THREE.Group();
    const finishBar = new THREE.Mesh(
      new THREE.BoxGeometry(p.half * UNIT * 2, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    finishBar.position.y = 0.2;
    finishGroup.add(finishBar);
    for (let i = 0; i < 8; i++) {
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(((p.half * UNIT * 2) / 8), 0.05, 0.6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x000000 : 0xffffff }),
      );
      sq.position.x = -p.half * UNIT + ((p.half * UNIT * 2) / 8) * (i + 0.5);
      sq.position.y = 0.03;
      finishGroup.add(sq);
    }
    finishGroup.visible = false;
    scene.add(finishGroup);

    // Car (third-person). Low-poly boxes.
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.6, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xef4444 }),
    );
    body.position.y = 0.5;
    car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.5, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    // Forward is -Z, so the cabin sits toward +Z (behind the hood).
    cabin.position.set(0, 0.95, 0.35);
    car.add(cabin);
    // Small headlights on the front (-Z) so the facing direction is obvious.
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

    // Handle resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // Helper: world X from design-space centerAt + lateral offset.
    const worldXAt = (designZ: number, lateralOffset = 0) => {
      const cx = centerAt(designZ, p) - 240; // 240 = W/2, so centerline hovers around x=0
      return (cx + lateralOffset) * UNIT;
    };

    let raf = 0;
    const clock = new THREE.Clock();

    const loop = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const s = stateRef.current;
      const k = controls.pressed.current;
      const turn = (k.left ? -1 : 0) + (k.right ? 1 : 0);
      const gas = k.gas ? 1 : 0;
      const brake = k.brake ? 1 : 0;

      // Acceleration model (frame-rate independent, tuned to feel like the 2D game)
      const targetAccel = gas * 18 - brake * 14;
      s.speed += targetAccel * dt;
      s.speed *= Math.pow(0.5, dt * 0.8); // drag
      s.speed = Math.max(0, Math.min(s.speed, 42));

      // Steering (only bites when moving)
      const steerAuthority = Math.min(1, s.speed / 6);
      s.heading += turn * 2.4 * steerAuthority * dt;
      s.heading *= Math.pow(0.5, dt * 4); // self-center

      // Advance along track. distanceZ matches the 2D "trackOffset" units.
      // Speed 42 world-units/s over UNIT=0.1 → 420 design-units/s (progress ~42/frame at 100fps display)
      const advance = s.speed * dt / UNIT;
      s.distanceZ += advance;
      s.lateral += Math.sin(s.heading) * s.speed * dt / UNIT;

      if (!s.moved && (gas || brake || turn)) {
        s.moved = true;
        s.startTs = performance.now();
      }
      if (s.moved) setElapsed(performance.now() - s.startTs);

      // Off-road / off-screen check (matches 2D engine semantics).
      const cxDesign = centerAt(s.distanceZ, p);
      const carDesignX = cxDesign + s.lateral;
      if (carDesignX < 0 || carDesignX > 480 || Math.abs(s.lateral) > p.half) {
        setRunning(false);
        setDead(true);
        cancelAnimationFrame(raf);
        return;
      }

      const progress = Math.max(0, Math.floor(s.distanceZ / 10));
      setScore(progress);

      if (progress >= goal) {
        const finalMs = s.moved ? performance.now() - s.startTs : 0;
        setElapsed(finalMs);
        setRunning(false);
        setWon(true);
        onFinish?.(Math.max(500, Math.round(finalMs)));
        cancelAnimationFrame(raf);
        return;
      }

      // Update road geometry to follow car.
      const startDesignZ = s.distanceZ - BEHIND;
      const rp = road.geometry.attributes.position as THREE.BufferAttribute;
      const dp = dashLine.geometry.attributes.position as THREE.BufferAttribute;
      const lp = leftEdge.geometry.attributes.position as THREE.BufferAttribute;
      const rrp = rightEdge.geometry.attributes.position as THREE.BufferAttribute;
      const dashArr = dp.array as Float32Array;
      const dashPairs: number[] = [];
      for (let i = 0; i < totalSamples; i++) {
        const dz = startDesignZ + i * SEG_STEP;
        const cx = worldXAt(dz);
        // world Z: relative to car position (car sits at world z = 0)
        const wz = -((dz - s.distanceZ) * UNIT);
        const halfW = p.half * UNIT;
        rp.setXYZ(i * 2, cx - halfW, 0.01, wz);
        rp.setXYZ(i * 2 + 1, cx + halfW, 0.01, wz);
        lp.setXYZ(i, cx - halfW, 0.02, wz);
        rrp.setXYZ(i, cx + halfW, 0.02, wz);
        // dash as line segments: draw every-other sample as a pair
        if (i < totalSamples - 1 && i % 2 === 0) {
          dashPairs.push(cx, 0.03, wz);
          const dz2 = startDesignZ + (i + 1) * SEG_STEP;
          const cx2 = worldXAt(dz2);
          const wz2 = -((dz2 - s.distanceZ) * UNIT);
          dashPairs.push(cx2, 0.03, wz2);
        }
      }
      // pad the dash buffer if needed
      for (let i = 0; i < dashArr.length; i++) dashArr[i] = 0;
      for (let i = 0; i < dashPairs.length && i < dashArr.length; i++) dashArr[i] = dashPairs[i];
      rp.needsUpdate = true;
      dp.needsUpdate = true;
      lp.needsUpdate = true;
      rrp.needsUpdate = true;
      road.geometry.computeBoundingSphere();

      // Reposition scenery
      const range = AHEAD + BEHIND;
      for (const inst of sceneryInstances) {
        let relZ = (inst.baseZ - (s.distanceZ % range) + range) % range - BEHIND;
        const dz = s.distanceZ + relZ;
        const cx = worldXAt(dz);
        const wz = -(relZ * UNIT);
        const halfW = p.half * UNIT;
        const x = cx + inst.side * (halfW + inst.offset);
        inst.mesh.position.set(x, inst.mesh.scale.y * 0.9, wz);
      }

      // Finish line
      const remaining = goal - progress;
      if (remaining < 60) {
        const finishDesignZ = goal * 10;
        const cx = worldXAt(finishDesignZ);
        const wz = -((finishDesignZ - s.distanceZ) * UNIT);
        finishGroup.position.set(cx, 0, wz);
        finishGroup.visible = true;
      } else {
        finishGroup.visible = false;
      }

      // Position car in world (car centered laterally at car offset)
      const carX = worldXAt(s.distanceZ, s.lateral);
      car.position.set(carX, 0, 0);
      car.rotation.y = -s.heading;

      // Chase camera
      const camBack = 6;
      const camHeight = 3.2;
      camera.position.set(
        carX - Math.sin(-s.heading) * camBack * 0.3,
        camHeight,
        camBack,
      );
      camera.lookAt(carX, 1, -6);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      roadGeom.dispose();
      dashGeom.dispose();
      leftEdgeGeom.dispose();
      rightEdgeGeom.dispose();
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
              <p className="mt-1 text-sm text-white/80">Press Start to begin.</p>
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
      <p className="mt-3 text-xs text-muted-foreground hidden md:block">3D low-poly racer. Timer starts on your first move.</p>
      <p className="mt-3 text-xs text-muted-foreground md:hidden">Use the on-screen buttons. Timer starts on your first move.</p>
    </div>
  );
}
