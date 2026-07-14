// DAP Stunt Racer — original 3D time-trial + grid editor.
// Three.js rendering, custom arcade car physics with surface-normal alignment.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

export const Route = createFileRoute("/games/stunt")({
  head: () => ({
    meta: [
      { title: "Stunt Racer — DAP Arcade" },
      { name: "description", content: "3D time-trial stunt racer with a grid-based track editor, loops, drift, and ghost cars." },
    ],
  }),
  component: StuntGame,
});

// ============================== TRACK MODEL ==============================
type BlockType = "start" | "finish" | "straight" | "ramp" | "curveL" | "curveR" | "boost" | "wall" | "checkpoint" | "loop";
type Block = { t: BlockType; x: number; y: number; z: number; r: 0 | 1 | 2 | 3 };
type Track = { name: string; theme: "summer" | "desert" | "winter"; blocks: Block[] };

const CELL = 8; // grid size in world units
const BLOCK_CODES: Record<BlockType, string> = {
  start: "S", finish: "F", straight: "-", ramp: "^", curveL: "L", curveR: "R", boost: "B", wall: "W", checkpoint: "C", loop: "O",
};
const CODE_TO_BLOCK: Record<string, BlockType> = Object.fromEntries(Object.entries(BLOCK_CODES).map(([k, v]) => [v, k as BlockType]));

function encodeTrack(t: Track): string {
  const parts = t.blocks.map(b => `${BLOCK_CODES[b.t]}${b.x},${b.y},${b.z},${b.r}`).join(";");
  const raw = JSON.stringify({ n: t.name, th: t.theme, b: parts });
  return btoa(unescape(encodeURIComponent(raw)));
}
function decodeTrack(s: string): Track | null {
  try {
    const raw = decodeURIComponent(escape(atob(s.trim())));
    const j = JSON.parse(raw);
    const blocks: Block[] = String(j.b).split(";").filter(Boolean).map(seg => {
      const code = seg[0]; const [x, y, z, r] = seg.slice(1).split(",").map(Number);
      return { t: CODE_TO_BLOCK[code], x, y, z, r: (r % 4) as 0 | 1 | 2 | 3 };
    });
    return { name: j.n || "Untitled", theme: j.th || "summer", blocks };
  } catch { return null; }
}

const DEFAULT_TRACK: Track = {
  name: "Loop Rush",
  theme: "summer",
  blocks: [
    { t: "start",      x: 0, y: 0, z: 0, r: 0 },
    { t: "straight",   x: 0, y: 0, z: 1, r: 0 },
    { t: "boost",      x: 0, y: 0, z: 2, r: 0 },
    { t: "straight",   x: 0, y: 0, z: 3, r: 0 },
    { t: "loop",       x: 0, y: 0, z: 5, r: 0 },
    { t: "straight",   x: 0, y: 0, z: 7, r: 0 },
    { t: "checkpoint", x: 0, y: 0, z: 8, r: 0 },
    { t: "curveR",     x: 0, y: 0, z: 9, r: 0 },
    { t: "straight",   x: 1, y: 0, z: 9, r: 1 },
    { t: "straight",   x: 2, y: 0, z: 9, r: 1 },
    { t: "curveR",     x: 3, y: 0, z: 9, r: 1 },
    { t: "straight",   x: 3, y: 0, z: 8, r: 2 },
    { t: "boost",      x: 3, y: 0, z: 7, r: 2 },
    { t: "straight",   x: 3, y: 0, z: 6, r: 2 },
    { t: "ramp",       x: 3, y: 0, z: 5, r: 2 },
    { t: "straight",   x: 3, y: 1, z: 4, r: 2 },
    { t: "finish",     x: 3, y: 1, z: 3, r: 2 },
  ],
};

// ============================== THEMES ==============================
const THEMES = {
  summer: { sky: 0x87ceeb, ground: 0x4ea84a, road: 0x2b2f36, accent: 0xfde047, fog: 0xbfe7ff, fleck: 0x84cc16 },
  desert: { sky: 0xf5a86a, ground: 0xd9a86a, road: 0x8b6a3d, accent: 0xffe4a3, fog: 0xf5b98a, fleck: 0xa0733b },
  winter: { sky: 0xdfe9f5, ground: 0xf4f8fc, road: 0xc9d3de, accent: 0x93c5fd, fog: 0xeaf3ff, fleck: 0xffffff },
} as const;

// ============================== BUILD TRACK MESHES ==============================
type BlockMesh = { block: Block; mesh: THREE.Object3D; drivable: THREE.Mesh[]; wall?: THREE.Mesh; checkpoint?: THREE.Mesh; boost?: THREE.Mesh; kind: BlockType };

// Red/white rumble strip material factory
function rumbleStrip(len: number): THREE.Mesh {
  const seg = 8;
  const grp = new THREE.Group();
  const stripW = 0.5;
  for (let i = 0; i < seg; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(stripW, 0.08, len / seg - 0.02),
      new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0xef4444 : 0xffffff }),
    );
    m.position.z = -len / 2 + (i + 0.5) * (len / seg);
    grp.add(m);
  }
  // Wrap into a single mesh via group returned as any; cast for simplicity
  const container = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), new THREE.MeshBasicMaterial({ visible: false }));
  container.add(grp);
  return container;
}

function buildBlockMesh(b: Block, theme: keyof typeof THEMES): BlockMesh {
  const t = THEMES[theme];
  const grp = new THREE.Group();
  grp.position.set(b.x * CELL, b.y * (CELL * 0.4), b.z * CELL);
  grp.rotation.y = -b.r * Math.PI / 2;

  const drivable: THREE.Mesh[] = [];
  const roadMat = new THREE.MeshLambertMaterial({ color: t.road, flatShading: true });
  const boostMat = new THREE.MeshLambertMaterial({ color: 0xffb703, emissive: 0xffb703, emissiveIntensity: 0.6, flatShading: true });

  const kind: BlockType = b.t;

  const addFlatRoad = () => {
    const road = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.4, CELL), roadMat);
    road.position.y = 0.2;
    grp.add(road); drivable.push(road);
    // rumble strips on both edges
    for (const dx of [-CELL / 2 + 0.25, CELL / 2 - 0.25]) {
      const s = rumbleStrip(CELL); s.position.set(dx, 0.45, 0); grp.add(s);
    }
  };

  if (b.t === "straight" || b.t === "start" || b.t === "finish") {
    addFlatRoad();
    if (b.t === "start" || b.t === "finish") {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.2, 0.6), new THREE.MeshLambertMaterial({ color: b.t === "start" ? 0x22c55e : 0xef4444 }));
      gate.position.set(0, 0.45, 0); grp.add(gate);
      for (const dx of [-CELL / 2, CELL / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        post.position.set(dx, 1.5, 0); grp.add(post);
      }
    }
  } else if (b.t === "boost") {
    addFlatRoad();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.06, CELL * 0.9), boostMat);
    pad.position.y = 0.44; grp.add(pad);
  } else if (b.t === "checkpoint") {
    addFlatRoad();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CELL * 0.5, 0.25, 8, 24),
      new THREE.MeshLambertMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.set(0, CELL * 0.5, 0); grp.add(ring);
    const cp = new THREE.Mesh(new THREE.BoxGeometry(CELL, 4, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
    cp.position.set(0, 2, 0); grp.add(cp);
    return { block: b, mesh: grp, drivable, checkpoint: cp, kind };
  } else if (b.t === "ramp") {
    const geo = new THREE.BufferGeometry();
    const H = CELL * 0.4;
    const w = CELL / 2, l = CELL / 2;
    const verts = new Float32Array([
      -w, 0, -l,   w, 0, -l,   w, H, l,
      -w, 0, -l,   w, H, l,  -w, H, l,
      -w, 0, -l,  -w, H, l,  -w, 0, l,
       w, 0, -l,   w, 0, l,   w, H, l,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const ramp = new THREE.Mesh(geo, roadMat);
    grp.add(ramp); drivable.push(ramp);
  } else if (b.t === "curveL" || b.t === "curveR") {
    addFlatRoad();
    const arrowMat = new THREE.MeshLambertMaterial({ color: t.accent, flatShading: true });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 4), arrowMat);
    arrow.rotation.z = b.t === "curveL" ? Math.PI / 2 : -Math.PI / 2;
    arrow.position.set(0, 0.6, 0); grp.add(arrow);
  } else if (b.t === "loop") {
    // Vertical loop-de-loop: torus lying in the XY plane, drivable inner surface.
    // Build as a tube of segments to allow raycasting on surface.
    const R = CELL * 0.9;   // loop radius
    const tube = CELL * 0.45;
    const segs = 28;
    const grpLoop = new THREE.Group();
    // full torus visual + collision (drivable): the ray-down check will hit outer top,
    // but we align to face normals so the car sticks on inside.
    const torusGeo = new THREE.TorusGeometry(R, tube, 10, segs);
    // Rotate torus so its "hole" faces along Z (car drives through the hole)
    torusGeo.rotateY(Math.PI / 2);
    const loopMesh = new THREE.Mesh(torusGeo, roadMat);
    loopMesh.position.set(0, R, 0);
    grpLoop.add(loopMesh);
    drivable.push(loopMesh);
    // stripes on outer rim for visual
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + tube + 0.02, 0.12, 6, segs), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
    rim.rotateY(Math.PI / 2); rim.position.set(0, R, 0); grpLoop.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R + tube + 0.02, 0.12, 6, segs), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    rim2.rotateY(Math.PI / 2); rim2.position.set(0.4, R, 0); grpLoop.add(rim2);
    grp.add(grpLoop);
  } else if (b.t === "wall") {
    addFlatRoad();
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, CELL), new THREE.MeshLambertMaterial({ color: 0x64748b }));
    w.position.set(-CELL / 2 + 0.3, 1.5, 0);
    grp.add(w);
    return { block: b, mesh: grp, drivable, wall: w, kind };
  }

  return { block: b, mesh: grp, drivable, kind };
}

// ============================== CAR ==============================
type CarColors = { primary: string; secondary: string; chassis: string; rim: string };
const DEFAULT_COLORS: CarColors = { primary: "#ef4444", secondary: "#111827", chassis: "#1f2937", rim: "#e5e7eb" };

function buildCar(colors: CarColors): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.0), new THREE.MeshLambertMaterial({ color: colors.primary, flatShading: true }));
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.4), new THREE.MeshLambertMaterial({ color: colors.secondary, flatShading: true }));
  cabin.position.set(0, 0.95, -0.2); g.add(cabin);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 3.1), new THREE.MeshLambertMaterial({ color: colors.chassis, flatShading: true }));
  chassis.position.y = 0.3; g.add(chassis);
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: colors.rim, flatShading: true });
  const positions: [number, number, number][] = [[-0.85, 0.35, 1.0], [0.85, 0.35, 1.0], [-0.85, 0.35, -1.0], [0.85, 0.35, -1.0]];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(x, y, z); g.add(w);
  }
  // headlights (front = +Z)
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff8b4 }));
  hl.position.set(0, 0.6, 1.5); g.add(hl);
  return g;
}

// ============================== AUDIO ==============================
class Audio {
  ctx: AudioContext | null = null;
  engineOsc: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  screechNode: AudioBufferSourceNode | null = null;
  screechGain: GainNode | null = null;
  ensure() {
    if (this.ctx) return;
    try {
      const C = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new C();
      // engine hum
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth"; osc.frequency.value = 70;
      const g = this.ctx.createGain(); g.gain.value = 0;
      osc.connect(g).connect(this.ctx.destination);
      osc.start();
      this.engineOsc = osc; this.engineGain = g;
      // white noise loop for screech
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filt = this.ctx.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 2000;
      const sg = this.ctx.createGain(); sg.gain.value = 0;
      src.connect(filt).connect(sg).connect(this.ctx.destination);
      src.start();
      this.screechNode = src; this.screechGain = sg;
    } catch { /* audio blocked */ }
  }
  updateEngine(speed: number, muted: boolean) {
    if (!this.engineOsc || !this.engineGain) return;
    const s = Math.abs(speed);
    this.engineOsc.frequency.setTargetAtTime(60 + s * 6, this.ctx!.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.06, 0.02 + s * 0.001), this.ctx!.currentTime, 0.1);
  }
  setScreech(amt: number, muted: boolean) {
    if (!this.screechGain) return;
    this.screechGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.08, amt * 0.08), this.ctx!.currentTime, 0.05);
  }
  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = 90;
    const g = this.ctx.createGain(); g.gain.value = 0.25;
    o.connect(g).connect(this.ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    o.stop(this.ctx.currentTime + 0.26);
  }
}

// ============================== MAIN GAME ==============================
type Mode = "race" | "edit";

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor(ms % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
}

const LS_TRACK = "dap.stunt.track";
const LS_COLORS = "dap.stunt.colors";
const LS_MUTE = "dap.stunt.mute";
const LS_GHOST = (name: string) => `dap.stunt.ghost.${name}`;
const LS_BEST = (name: string) => `dap.stunt.best.${name}`;

function StuntGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("race");
  const [track, setTrack] = useState<Track>(() => {
    try { const s = localStorage.getItem(LS_TRACK); if (s) return decodeTrack(s) ?? DEFAULT_TRACK; } catch { /* ignore */ }
    return DEFAULT_TRACK;
  });
  const [colors, setColors] = useState<CarColors>(() => {
    try { const s = localStorage.getItem(LS_COLORS); if (s) return JSON.parse(s); } catch { /* ignore */ }
    return DEFAULT_COLORS;
  });
  const [timeMs, setTimeMs] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [cpState, setCpState] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [garageOpen, setGarageOpen] = useState(false);
  const [importStr, setImportStr] = useState("");
  const [selectedTool, setSelectedTool] = useState<BlockType>("straight");
  const [placeY, setPlaceY] = useState(0);
  const [placeRot, setPlaceRot] = useState<0 | 1 | 2 | 3>(0);
  const [status, setStatus] = useState<string>("Ready");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => { try { return localStorage.getItem(LS_MUTE) === "1"; } catch { return false; } });

  // refs mirror state for the animation loop
  const trackRef = useRef(track); trackRef.current = track;
  const modeRef = useRef(mode); modeRef.current = mode;
  const colorsRef = useRef(colors); colorsRef.current = colors;
  const toolRef = useRef(selectedTool); toolRef.current = selectedTool;
  const placeYRef = useRef(placeY); placeYRef.current = placeY;
  const placeRotRef = useRef(placeRot); placeRotRef.current = placeRot;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const mutedRef = useRef(muted); mutedRef.current = muted;

  useEffect(() => {
    try { localStorage.setItem(LS_TRACK, encodeTrack(track)); } catch { /* ignore */ }
    try { const b = localStorage.getItem(LS_BEST(track.name)); setBest(b ? Number(b) : null); } catch { /* ignore */ }
  }, [track]);
  useEffect(() => { try { localStorage.setItem(LS_COLORS, JSON.stringify(colors)); } catch { /* ignore */ } }, [colors]);
  useEffect(() => { try { localStorage.setItem(LS_MUTE, muted ? "1" : "0"); } catch { /* ignore */ } }, [muted]);

  // ============ Three.js setup ============
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const theme = THEMES[track.theme];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 60, 300);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
    camera.position.set(0, 8, -14);
    let camMode: "chase" | "cockpit" = "chase";
    const baseFov = 65;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(mount);

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(30, 60, 20); scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000, 40, 40),
      new THREE.MeshLambertMaterial({ color: theme.ground, flatShading: true }),
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);

    // Decorative flecks
    const fleckGeo = new THREE.ConeGeometry(0.6, 2.4, 5);
    const fleckMat = new THREE.MeshLambertMaterial({ color: theme.fleck, flatShading: true });
    for (let i = 0; i < 120; i++) {
      const c = new THREE.Mesh(fleckGeo, fleckMat);
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 200;
      c.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
      scene.add(c);
    }

    // Track meshes
    const trackGroup = new THREE.Group(); scene.add(trackGroup);
    let blockMeshes: BlockMesh[] = [];
    const rebuildTrack = () => {
      trackGroup.clear();
      blockMeshes = trackRef.current.blocks.map(b => {
        const bm = buildBlockMesh(b, trackRef.current.theme);
        trackGroup.add(bm.mesh); return bm;
      });
    };
    rebuildTrack();

    // Car
    let carGroup = buildCar(colorsRef.current); scene.add(carGroup);
    const carState = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),     // full 3D velocity
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, 0, 1),
      yaw: 0,
      speed: 0,
      grounded: false,
      quat: new THREE.Quaternion(),
      slip: 0,
    };
    const ghostCar = buildCar({ ...colorsRef.current, primary: "#a1a1aa", secondary: "#71717a" });
    ghostCar.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial).clone() as THREE.MeshLambertMaterial;
        mat.transparent = true; mat.opacity = 0.35; m.material = mat;
      }
    });
    ghostCar.visible = false; scene.add(ghostCar);

    // Skid marks group
    const skidGroup = new THREE.Group(); scene.add(skidGroup);
    const skidMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 });
    const skidGeo = new THREE.PlaneGeometry(0.25, 0.35);
    const MAX_SKIDS = 400;
    const addSkid = (pos: THREE.Vector3, up: THREE.Vector3, yaw: number) => {
      if (skidGroup.children.length > MAX_SKIDS) skidGroup.remove(skidGroup.children[0]);
      for (const dx of [-0.8, 0.8]) {
        const m = new THREE.Mesh(skidGeo, skidMat);
        const right = new THREE.Vector3().crossVectors(up, new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))).normalize();
        m.position.copy(pos).add(right.multiplyScalar(dx)).add(up.clone().multiplyScalar(0.02));
        const upQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        const yQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        m.quaternion.copy(upQ).multiply(yQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
        skidGroup.add(m);
      }
    };

    // Audio
    const audio = new Audio();

    // Editor cursor
    const cursor = new THREE.Mesh(
      new THREE.BoxGeometry(CELL, 0.3, CELL),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 }),
    );
    cursor.visible = false; scene.add(cursor);

    // Editor camera state (orbit)
    const editorCam = { target: new THREE.Vector3(0, 4, 0), yaw: Math.PI / 4, pitch: 0.9, dist: 45 };

    const lastCheckpointRef = { current: { pos: new THREE.Vector3(), yaw: 0, up: new THREE.Vector3(0, 1, 0) } };
    const checkpointsHitRef = { current: new Set<number>() };
    const runStartRef = { current: null as number | null };
    const recordRef = { current: [] as Array<{ t: number; p: [number, number, number]; q: [number, number, number, number] }> };
    const ghostRef = { current: null as null | Array<{ t: number; p: [number, number, number]; q: [number, number, number, number] }> };
    try {
      const raw = localStorage.getItem(LS_GHOST(track.name));
      if (raw) ghostRef.current = JSON.parse(raw);
    } catch { /* ignore */ }

    const resetToStart = () => {
      const start = trackRef.current.blocks.find(b => b.t === "start") ?? trackRef.current.blocks[0];
      carState.pos.set(start.x * CELL, start.y * CELL * 0.4 + 1.5, start.z * CELL);
      carState.vel.set(0, 0, 0);
      carState.up.set(0, 1, 0);
      carState.yaw = -start.r * Math.PI / 2;
      carState.speed = 0;
      lastCheckpointRef.current = { pos: carState.pos.clone(), yaw: carState.yaw, up: carState.up.clone() };
      checkpointsHitRef.current.clear();
      runStartRef.current = null;
      setTimeMs(0);
      recordRef.current = [];
      setStatus("Ready");
    };

    const resetToCheckpoint = () => {
      carState.pos.copy(lastCheckpointRef.current.pos);
      carState.yaw = lastCheckpointRef.current.yaw;
      carState.up.copy(lastCheckpointRef.current.up);
      carState.vel.set(0, 0, 0); carState.speed = 0;
      setStatus("Checkpoint reset");
    };

    // ============ Input ============
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.add(k);
      audio.ensure();
      if (k === "t") { e.preventDefault(); if (modeRef.current === "race") resetToStart(); else setMode("race"); }
      else if (k === "r" || k === "enter") { e.preventDefault(); if (modeRef.current === "race") resetToCheckpoint(); else setPlaceRot(r => ((r + 1) % 4) as 0|1|2|3); }
      else if (k === " ") { e.preventDefault(); if (modeRef.current === "race") setPaused(p => !p); else setPlaceRot(r => ((r + 1) % 4) as 0|1|2|3); }
      else if (k === "c" && modeRef.current === "race") { camMode = camMode === "chase" ? "cockpit" : "chase"; setStatus(camMode === "chase" ? "Chase cam" : "Cockpit cam"); }
      else if (k === "escape" && modeRef.current === "race") { setMode("edit"); }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Editor: pointer plane raycasting
    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();
    let hoverCell: { x: number; z: number } | null = null;
    let panDrag: { x: number; y: number } | null = null;
    let orbitDrag: { x: number; y: number } | null = null;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (modeRef.current !== "edit") return;
      if (panDrag) {
        const dx = e.clientX - panDrag.x, dy = e.clientY - panDrag.y;
        panDrag = { x: e.clientX, y: e.clientY };
        const right = new THREE.Vector3(Math.cos(editorCam.yaw), 0, -Math.sin(editorCam.yaw));
        const fwd = new THREE.Vector3(Math.sin(editorCam.yaw), 0, Math.cos(editorCam.yaw));
        editorCam.target.addScaledVector(right, -dx * 0.08).addScaledVector(fwd, dy * 0.08);
      } else if (orbitDrag) {
        const dx = e.clientX - orbitDrag.x, dy = e.clientY - orbitDrag.y;
        orbitDrag = { x: e.clientX, y: e.clientY };
        editorCam.yaw -= dx * 0.005;
        editorCam.pitch = Math.max(0.2, Math.min(1.4, editorCam.pitch - dy * 0.005));
      }
      raycaster.setFromCamera(mouseNdc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -placeYRef.current * CELL * 0.4);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, hit);
      if (hit) {
        const gx = Math.round(hit.x / CELL);
        const gz = Math.round(hit.z / CELL);
        hoverCell = { x: gx, z: gz };
        cursor.position.set(gx * CELL, placeYRef.current * CELL * 0.4 + 0.2, gz * CELL);
        cursor.rotation.y = -placeRotRef.current * Math.PI / 2;
        cursor.visible = true;
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== "edit") return;
      if (e.button === 2) { panDrag = { x: e.clientX, y: e.clientY }; return; }
      if (e.button === 1) { orbitDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
      if (e.button === 0 && hoverCell) {
        const y = placeYRef.current;
        if (keys.has("shift")) {
          setTrack(prev => ({ ...prev, blocks: prev.blocks.filter(b => !(b.x === hoverCell!.x && b.z === hoverCell!.z && b.y === y)) }));
        } else {
          setTrack(prev => {
            const filtered = prev.blocks.filter(b => !(b.x === hoverCell!.x && b.z === hoverCell!.z && b.y === y));
            return { ...prev, blocks: [...filtered, { t: toolRef.current, x: hoverCell!.x, y, z: hoverCell!.z, r: placeRotRef.current }] };
          });
        }
      }
    };
    const onPointerUp = () => { panDrag = null; orbitDrag = null; };
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== "edit") return;
      e.preventDefault();
      if (e.shiftKey) {
        setPlaceY(v => Math.max(-2, Math.min(6, v + (e.deltaY > 0 ? -1 : 1))));
      } else {
        editorCam.dist = Math.max(15, Math.min(120, editorCam.dist + e.deltaY * 0.05));
      }
    };
    const onCtx = (e: Event) => { if (modeRef.current === "edit") e.preventDefault(); };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", onCtx);

    resetToStart();

    let lastTs = performance.now();
    let rafId = 0;
    const tmpForward = new THREE.Vector3();
    const tmpVec = new THREE.Vector3();
    let skidTimer = 0;

    const step = (now: number) => {
      rafId = requestAnimationFrame(step);
      const dt = Math.min((now - lastTs) / 1000, 1 / 30);
      lastTs = now;

      if (blockMeshes.length !== trackRef.current.blocks.length) rebuildTrack();

      cursor.visible = modeRef.current === "edit";
      if (modeRef.current === "race" && !pausedRef.current) {
        // controls
        const accel = keys.has("w") || keys.has("arrowup") ? 1 : 0;
        const brake = keys.has("s") || keys.has("arrowdown") ? 1 : 0;
        const left = keys.has("a") || keys.has("arrowleft") ? 1 : 0;
        const right = keys.has("d") || keys.has("arrowright") ? 1 : 0;

        const maxSpeed = 48;
        const accelRate = 26;
        const brakeRate = 34;
        const friction = 5;
        const baseSteer = 3.0;

        // longitudinal
        if (accel) carState.speed += accelRate * dt;
        if (brake) carState.speed -= brakeRate * dt;
        if (!accel && !brake) {
          carState.speed -= Math.sign(carState.speed) * Math.min(Math.abs(carState.speed), friction * dt);
        }
        carState.speed = Math.max(-16, Math.min(maxSpeed, carState.speed));

        // High-speed understeer: steer authority drops with speed
        const speedFrac = Math.min(1, Math.abs(carState.speed) / maxSpeed);
        const understeer = 1 - 0.55 * speedFrac * speedFrac;
        const steerAuthority = Math.min(1, Math.abs(carState.speed) / 6);
        const steerAmt = (left - right) * baseSteer * understeer * steerAuthority * dt;
        carState.yaw += steerAmt * Math.sign(carState.speed || 1);

        // Drift detection: hard turn at high speed or hard brake at high speed
        const turnInput = left - right;
        carState.slip = Math.min(1, Math.max(0,
          Math.abs(turnInput) * speedFrac * 1.2 + (brake && speedFrac > 0.5 ? 0.7 : 0) - 0.3
        ));

        // Build forward vector in world using yaw + up
        // First a baseline forward in car's yaw frame, then reorient by up:
        const upQuatBase = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), carState.up);
        tmpForward.set(Math.sin(carState.yaw), 0, Math.cos(carState.yaw)).applyQuaternion(upQuatBase);
        carState.forward.copy(tmpForward);

        // Move along forward
        carState.pos.addScaledVector(tmpForward, carState.speed * dt);

        // Gravity along -up (magnetic to surface). Bias with world gravity when airborne.
        const grav = 42;
        // apply gravity to velocity vector (world)
        if (carState.grounded) {
          carState.vel.copy(carState.up).multiplyScalar(-grav * 0.02); // small residual
        } else {
          carState.vel.y -= grav * dt;
          carState.pos.addScaledVector(carState.vel, dt);
        }

        // Surface probe: raycast along -up first, then along world -Y as fallback
        const allDrivable = blockMeshes.flatMap(b => b.drivable);
        const probeOrigin = carState.pos.clone().add(carState.up.clone().multiplyScalar(3));
        raycaster.set(probeOrigin, carState.up.clone().multiplyScalar(-1));
        let hits = raycaster.intersectObjects(allDrivable, false);
        if (hits.length === 0) {
          raycaster.set(carState.pos.clone().add(new THREE.Vector3(0, 4, 0)), new THREE.Vector3(0, -1, 0));
          hits = raycaster.intersectObjects(allDrivable, false);
        }
        if (hits.length > 0) {
          const h = hits[0];
          const dist = probeOrigin.distanceTo(h.point);
          if (dist < 3.6) {
            // snap to surface
            const nrm = h.face
              ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
              : carState.up.clone();
            carState.pos.copy(h.point).addScaledVector(nrm, 0.5);
            carState.up.lerp(nrm, 0.4).normalize();
            carState.vel.set(0, 0, 0);
            carState.grounded = true;
            // downforce: when going fast, extra pull to surface (loops)
            if (speedFrac > 0.55) {
              carState.pos.addScaledVector(nrm, -0.05 * speedFrac);
            }
          } else {
            carState.grounded = false;
          }
        } else {
          carState.grounded = false;
          // in air, gradually re-orient up to world up
          carState.up.lerp(new THREE.Vector3(0, 1, 0), 0.02).normalize();
          if (carState.pos.y < -30) resetToCheckpoint();
        }

        // checkpoint / start / finish detection
        for (let i = 0; i < trackRef.current.blocks.length; i++) {
          const b = trackRef.current.blocks[i];
          const cx = b.x * CELL, cz = b.z * CELL, cy = b.y * CELL * 0.4;
          const dx = carState.pos.x - cx, dz = carState.pos.z - cz, dy = carState.pos.y - cy;
          if (Math.abs(dx) < CELL / 2 && Math.abs(dz) < CELL / 2 && Math.abs(dy) < 4) {
            if (b.t === "start" && runStartRef.current === null && carState.speed > 2) {
              runStartRef.current = now;
              recordRef.current = [];
              setStatus("Racing");
            }
            if (b.t === "boost" && carState.speed > 0) {
              carState.speed = Math.min(maxSpeed * 1.5, carState.speed + 40 * dt);
            }
            if (b.t === "checkpoint" && !checkpointsHitRef.current.has(i)) {
              checkpointsHitRef.current.add(i);
              lastCheckpointRef.current = { pos: carState.pos.clone(), yaw: carState.yaw, up: carState.up.clone() };
              setCpState(cs => ({ ...cs, done: checkpointsHitRef.current.size }));
              setStatus(`Checkpoint ${checkpointsHitRef.current.size}`);
            }
            if (b.t === "finish" && runStartRef.current !== null) {
              const total = now - runStartRef.current;
              runStartRef.current = null;
              setStatus(`Finish! ${formatTime(total)}`);
              try {
                const prevBest = Number(localStorage.getItem(LS_BEST(trackRef.current.name)) ?? Infinity);
                if (total < prevBest) {
                  localStorage.setItem(LS_BEST(trackRef.current.name), String(total));
                  localStorage.setItem(LS_GHOST(trackRef.current.name), JSON.stringify(recordRef.current));
                  ghostRef.current = recordRef.current.slice();
                  setBest(total);
                  setStatus(`NEW BEST! ${formatTime(total)}`);
                }
              } catch { /* ignore */ }
            }
          }
        }

        // Skid marks + audio
        skidTimer -= dt;
        if (carState.grounded && carState.slip > 0.35 && Math.abs(carState.speed) > 8 && skidTimer <= 0) {
          addSkid(carState.pos, carState.up, carState.yaw);
          skidTimer = 0.04;
        }
        audio.updateEngine(carState.speed, mutedRef.current);
        audio.setScreech(carState.grounded ? carState.slip : 0, mutedRef.current);

        // update car transform
        const upQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), carState.up);
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), carState.yaw);
        carState.quat.copy(upQuat).multiply(yawQuat);
        carGroup.position.copy(carState.pos);
        carGroup.quaternion.copy(carState.quat);

        // record
        if (runStartRef.current !== null) {
          const t = now - runStartRef.current;
          if (recordRef.current.length === 0 || t - recordRef.current[recordRef.current.length - 1].t > 30) {
            recordRef.current.push({ t, p: [carState.pos.x, carState.pos.y, carState.pos.z], q: [carState.quat.x, carState.quat.y, carState.quat.z, carState.quat.w] });
          }
          setTimeMs(t);
        }

        // ghost playback
        if (ghostRef.current && ghostRef.current.length && runStartRef.current !== null) {
          const t = now - runStartRef.current;
          const g = ghostRef.current;
          let frame = g[0];
          for (let i = 0; i < g.length; i++) { if (g[i].t <= t) frame = g[i]; else break; }
          ghostCar.visible = true;
          ghostCar.position.set(frame.p[0], frame.p[1], frame.p[2]);
          ghostCar.quaternion.set(frame.q[0], frame.q[1], frame.q[2], frame.q[3]);
        } else {
          ghostCar.visible = false;
        }

        // Camera
        const targetFov = baseFov + speedFrac * 18;
        camera.fov += (targetFov - camera.fov) * 0.08;
        camera.updateProjectionMatrix();

        if (camMode === "chase") {
          const back = carState.forward.clone().multiplyScalar(-11);
          const upOff = carState.up.clone().multiplyScalar(5);
          const desired = carState.pos.clone().add(back).add(upOff);
          camera.position.lerp(desired, 0.12);
          const look = carState.pos.clone().addScaledVector(carState.forward, 4).addScaledVector(carState.up, 1.2);
          camera.lookAt(look);
          camera.up.copy(carState.up);
        } else {
          // cockpit
          tmpVec.copy(carState.pos).addScaledVector(carState.forward, 0.8).addScaledVector(carState.up, 1.4);
          camera.position.copy(tmpVec);
          const look = carState.pos.clone().addScaledVector(carState.forward, 10).addScaledVector(carState.up, 1.2);
          camera.lookAt(look);
          camera.up.copy(carState.up);
        }
      } else if (modeRef.current === "edit") {
        // edit mode: orbit camera around target
        const cx = editorCam.target.x + Math.cos(editorCam.yaw) * Math.cos(editorCam.pitch) * editorCam.dist;
        const cz = editorCam.target.z + Math.sin(editorCam.yaw) * Math.cos(editorCam.pitch) * editorCam.dist;
        const cy = editorCam.target.y + Math.sin(editorCam.pitch) * editorCam.dist;
        camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.15);
        camera.up.set(0, 1, 0);
        camera.lookAt(editorCam.target);
        audio.updateEngine(0, true);
        audio.setScreech(0, true);
      } else {
        // paused
        audio.updateEngine(0, true);
        audio.setScreech(0, true);
      }

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(step);

    const carRebuildInterval = setInterval(() => {
      const cur = colorsRef.current;
      if (JSON.stringify(cur) !== JSON.stringify(colors)) {
        scene.remove(carGroup);
        carGroup = buildCar(cur);
        scene.add(carGroup);
      }
    }, 500);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(carRebuildInterval);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onCtx);
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.theme]);

  useEffect(() => {
    const total = track.blocks.filter(b => b.t === "checkpoint").length;
    setCpState({ done: 0, total });
  }, [track]);

  const exportCode = useCallback(() => {
    const code = encodeTrack(track);
    void navigator.clipboard.writeText(code).catch(() => { /* ignore */ });
    setStatus("Track code copied to clipboard!");
  }, [track]);

  const importCode = useCallback(() => {
    const t = decodeTrack(importStr);
    if (!t) { setStatus("Invalid track code"); return; }
    setTrack(t); setImportStr(""); setStatus(`Loaded: ${t.name}`);
  }, [importStr]);

  const TOOLS: BlockType[] = ["start", "finish", "straight", "ramp", "curveL", "curveR", "loop", "boost", "wall", "checkpoint"];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">🏁 Stunt Racer</h1>
          <p className="text-xs text-muted-foreground">
            WASD/Arrows drive · T reset start · R/Enter checkpoint · Space pause · C camera · Esc editor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
          >
            {muted ? "🔇 Muted" : "🔊 Sound"}
          </button>
          <button
            onClick={() => setMode(m => m === "race" ? "edit" : "race")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
          >
            {mode === "race" ? "✏️ Editor" : "🏎️ Race"}
          </button>
          <button
            onClick={() => setGarageOpen(o => !o)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
          >
            🎨 Garage
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-black" style={{ height: "min(70vh, 620px)" }}>
        <div ref={mountRef} className="h-full w-full" />

        {mode === "race" && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1 font-mono text-white drop-shadow">
            <div className="rounded-md bg-black/50 px-3 py-1 text-2xl tabular-nums">{formatTime(timeMs)}</div>
            <div className="text-xs opacity-80">
              {status} · Best: {best != null ? formatTime(best) : "—"} · CP {cpState.done}/{cpState.total}
            </div>
            {paused && <div className="mt-2 rounded bg-black/70 px-4 py-2 text-lg">PAUSED — press Space</div>}
          </div>
        )}

        {mode === "edit" && (
          <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1 rounded-lg bg-black/60 p-2 text-xs text-white">
            {TOOLS.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTool(t)}
                className={`rounded px-2 py-1 ${selectedTool === t ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"}`}
              >
                {t}
              </button>
            ))}
            <div className="ml-2 flex items-center gap-2 border-l border-white/20 pl-2">
              <span>Y:{placeY}</span>
              <span>Rot:{placeRot * 90}°</span>
              <span className="opacity-70">(Space/R=rot · Shift+Wheel=height · Shift+Click=del · Right-drag=pan · Middle-drag=orbit)</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Track</h2>
            <span className="text-xs text-muted-foreground">{track.blocks.length} blocks</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
              value={track.name}
              onChange={e => setTrack(t => ({ ...t, name: e.target.value }))}
            />
            <select
              value={track.theme}
              onChange={e => setTrack(t => ({ ...t, theme: e.target.value as Track["theme"] }))}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="summer">Summer</option>
              <option value="desert">Desert</option>
              <option value="winter">Winter</option>
            </select>
            <button onClick={exportCode} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">Export code</button>
            <button
              onClick={() => { if (confirm("Clear track?")) setTrack({ ...track, blocks: [] }); }}
              className="rounded border border-border px-3 py-1 text-sm"
            >Clear</button>
            <button
              onClick={() => setTrack(DEFAULT_TRACK)}
              className="rounded border border-border px-3 py-1 text-sm"
            >Reset default</button>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
              placeholder="Paste track code…"
              value={importStr}
              onChange={e => setImportStr(e.target.value)}
            />
            <button onClick={importCode} className="rounded border border-border px-3 py-1 text-sm">Import</button>
          </div>
        </div>

        {garageOpen && (
          <div className="rounded-xl border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">🎨 Garage</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(["primary", "secondary", "chassis", "rim"] as const).map(k => (
                <label key={k} className="flex items-center justify-between rounded border border-border px-2 py-1">
                  <span className="capitalize">{k}</span>
                  <input
                    type="color"
                    value={colors[k]}
                    onChange={e => setColors(c => ({ ...c, [k]: e.target.value }))}
                    className="h-6 w-10 cursor-pointer bg-transparent"
                  />
                </label>
              ))}
            </div>
            <button
              onClick={() => { try { localStorage.removeItem(LS_GHOST(track.name)); localStorage.removeItem(LS_BEST(track.name)); setBest(null); setStatus("Cleared best & ghost"); } catch { /* ignore */ } }}
              className="mt-2 w-full rounded border border-border px-3 py-1 text-xs"
            >Clear best & ghost for this track</button>
          </div>
        )}
      </div>
    </div>
  );
}
