// Tiny non-indexed mesh builder for Poly Racer's low-poly track geometry.
//
// Every tile contributes triangles into a handful of shared buffers, so a
// 250-piece track renders in a handful of draw calls instead of hundreds.
// Faces are flat-shaded by construction: each triangle carries its own
// geometric normal, which is exactly the look we want.

export type V3 = { x: number; y: number; z: number };

type ThreeNS = typeof import("three");

export class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];

  get isEmpty(): boolean {
    return this.pos.length === 0;
  }

  tri(a: V3, b: V3, c: V3): void {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }

  /** Counter-clockwise quad, seen from the side the normal points at. */
  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Axis-aligned box given its centre and full extents. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
    // top / bottom
    this.quad(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0));
    this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1));
    // +z / -z
    this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1));
    this.quad(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0));
    // +x / -x
    this.quad(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1));
    this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0));
  }

  /**
   * Six-faced hull between a bottom ring and a top ring of four corners.
   * Both rings run in the order (-x,-z), (-x,+z), (+x,+z), (+x,-z) — the
   * same cycle box() walks — so every face comes out pointing outward.
   *
   * The corners are otherwise free, which is what lets a car body taper,
   * wedge and rake without a single extra triangle.
   */
  hull(bottom: readonly V3[], top: readonly V3[]): void {
    this.quad(top[0], top[1], top[2], top[3]);
    this.quad(bottom[0], bottom[3], bottom[2], bottom[1]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(bottom[i], bottom[j], top[j], top[i]);
    }
  }

  /**
   * Vertical tapered box — a rectangle of half-extents (hx0, hz0) at y0
   * growing or shrinking to (hx1, hz1) at y1, both centred on (cx, cz).
   * Bridge pillars and their footings are all this shape.
   */
  frustum(
    cx: number, cz: number, y0: number, y1: number,
    hx0: number, hz0: number, hx1: number, hz1: number,
  ): void {
    const ring = (y: number, hx: number, hz: number): V3[] => [
      { x: cx - hx, y, z: cz - hz },
      { x: cx - hx, y, z: cz + hz },
      { x: cx + hx, y, z: cz + hz },
      { x: cx + hx, y, z: cz - hz },
    ];
    this.hull(ring(y0, hx0, hz0), ring(y1, hx1, hz1));
  }

  /** Four-sided pyramid sitting on (x, y, z) — cheap trees and rocks. */
  pyramid(x: number, y: number, z: number, half: number, height: number): void {
    const apex: V3 = { x, y: y + height, z };
    const a: V3 = { x: x - half, y, z: z - half };
    const b: V3 = { x: x + half, y, z: z - half };
    const c: V3 = { x: x + half, y, z: z + half };
    const d: V3 = { x: x - half, y, z: z + half };
    this.tri(a, apex, b);
    this.tri(b, apex, c);
    this.tri(c, apex, d);
    this.tri(d, apex, a);
    this.quad(a, b, c, d);
  }

  /**
   * Extrude a centreline polyline into a flat slab of the given half
   * width and thickness (thickness hangs below the line).
   *
   * Pass `sides` to send the flanks and underside to a second buffer, so
   * the road's edge can take a darker material than its surface — which
   * is what gives each piece its slab-like read.
   */
  ribbon(pts: V3[], halfW: number, thick: number, sides?: Mesher): void {
    if (pts.length < 2) return;
    const skirt = sides ?? this;
    const n = pts.length;
    const left: V3[] = [], right: V3[] = [];
    for (let i = 0; i < n; i++) {
      const [rx, rz] = sideOf(pts, i);
      left.push({ x: pts[i].x - rx * halfW, y: pts[i].y, z: pts[i].z - rz * halfW });
      right.push({ x: pts[i].x + rx * halfW, y: pts[i].y, z: pts[i].z + rz * halfW });
    }
    const down = (p: V3): V3 => ({ x: p.x, y: p.y - thick, z: p.z });

    for (let i = 0; i < n - 1; i++) {
      const l0 = left[i], l1 = left[i + 1], r0 = right[i], r1 = right[i + 1];
      this.quad(l0, l1, r1, r0);                               // top
      skirt.quad(down(l0), down(r0), down(r1), down(l1));      // underside
      skirt.quad(r0, r1, down(r1), down(r0));                  // right flank
      skirt.quad(l0, down(l0), down(l1), l1);                  // left flank
    }
    // End caps.
    skirt.quad(left[0], right[0], down(right[0]), down(left[0]));
    skirt.quad(left[n - 1], down(left[n - 1]), down(right[n - 1]), right[n - 1]);
  }

  /** A flat strip laid on top of a surface — road markings. */
  stripe(pts: V3[], halfW: number): void {
    if (pts.length < 2) return;
    const n = pts.length;
    const a: V3[] = [], b: V3[] = [];
    for (let i = 0; i < n; i++) {
      const [rx, rz] = sideOf(pts, i);
      a.push({ x: pts[i].x - rx * halfW, y: pts[i].y, z: pts[i].z - rz * halfW });
      b.push({ x: pts[i].x + rx * halfW, y: pts[i].y, z: pts[i].z + rz * halfW });
    }
    for (let i = 0; i < n - 1; i++) this.quad(a[i], a[i + 1], b[i + 1], b[i]);
  }

  /**
   * Dashes laid along a centreline: `dash` units painted, `gap` units
   * bare, repeating, measured by arc length so a dash never stretches
   * round a bend. `phase` slides the pattern forward along the line —
   * two interleaved calls into different buffers make a kerb.
   */
  dashed(pts: V3[], halfW: number, dash: number, gap: number, phase = 0): void {
    const period = dash + gap;
    if (pts.length < 2 || dash <= 0 || period <= 0) return;
    const n = pts.length;
    const left: V3[] = [], right: V3[] = [];
    for (let i = 0; i < n; i++) {
      const [rx, rz] = sideOf(pts, i);
      left.push({ x: pts[i].x - rx * halfW, y: pts[i].y, z: pts[i].z - rz * halfW });
      right.push({ x: pts[i].x + rx * halfW, y: pts[i].y, z: pts[i].z + rz * halfW });
    }
    let s = 0;
    for (let i = 0; i < n - 1; i++) {
      const seg = dist(pts[i], pts[i + 1]);
      if (seg < 1e-6) continue;
      const end = s + seg;
      // Start one period early so a dash straddling the joint still lands.
      for (let k = Math.floor((s + phase) / period) - 1; ; k++) {
        const from = k * period - phase;
        if (from >= end) break;
        const a = Math.max(from, s), b = Math.min(from + dash, end);
        if (b > a) {
          const t0 = (a - s) / seg, t1 = (b - s) / seg;
          this.quad(
            mix(left[i], left[i + 1], t0), mix(left[i], left[i + 1], t1),
            mix(right[i], right[i + 1], t1), mix(right[i], right[i + 1], t0),
          );
        }
      }
      s = end;
    }
  }

  /** Total arc length of a polyline. */
  static arcLength(pts: V3[]): number {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }

  /** Shift a centreline sideways (along sideOf) and upward. */
  static offset(pts: V3[], lateral: number, lift = 0): V3[] {
    return pts.map((p, i) => {
      const [rx, rz] = sideOf(pts, i);
      return { x: p.x + rx * lateral, y: p.y + lift, z: p.z + rz * lateral };
    });
  }

  build(THREE: ThreeNS): import("three").BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

function dist(a: V3, b: V3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function mix(a: V3, b: V3, t: number): V3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function unit(x: number, z: number): [number, number] {
  const len = Math.hypot(x, z);
  return len < 1e-9 ? [0, 1] : [x / len, z / len];
}

/**
 * Unit sideways vector at point i of a polyline — the road's local +X
 * side, which is the driver's left. Faces are wound against this so top
 * surfaces end up with upward normals; both edges are treated
 * symmetrically, so which side is "left" only matters to the winding.
 */
function sideOf(pts: V3[], i: number): [number, number] {
  const [tx, tz] = tangentOf(pts, i);
  return [tz, -tx];
}

/**
 * Unit tangent at point i.
 *
 * Inside the line a central difference is exact enough. At the two ends
 * it is not: the chord leaving an end point is the tangent at the
 * *middle* of that segment, so on an arc it lags by half a segment's
 * turn — which on a quarter-circle piece throws the edge of the slab a
 * quarter of a unit out of line with the straight it joins, and every
 * seam shows as a dark hairline. Reflecting the neighbouring tangent
 * back through the chord recovers the end tangent exactly on an arc, and
 * changes nothing at all on a straight.
 */
function tangentOf(pts: V3[], i: number): [number, number] {
  const n = pts.length;
  if (n < 2) return [0, 1];
  if (i > 0 && i < n - 1) return unit(pts[i + 1].x - pts[i - 1].x, pts[i + 1].z - pts[i - 1].z);
  const j = i === 0 ? 0 : n - 2;
  const chord = unit(pts[j + 1].x - pts[j].x, pts[j + 1].z - pts[j].z);
  if (n === 2) return chord;
  const inner = tangentOf(pts, i === 0 ? 1 : n - 2);
  const ac = Math.atan2(chord[1], chord[0]);
  let turn = ac - Math.atan2(inner[1], inner[0]);
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  const a = ac + turn;
  return [Math.cos(a), Math.sin(a)];
}
