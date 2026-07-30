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
   */
  ribbon(pts: V3[], halfW: number, thick: number): void {
    if (pts.length < 2) return;
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
      this.quad(l0, l1, r1, r0);                              // top
      this.quad(down(l0), down(r0), down(r1), down(l1));      // underside
      this.quad(r0, r1, down(r1), down(r0));                  // right flank
      this.quad(l0, down(l0), down(l1), l1);                  // left flank
    }
    // End caps.
    this.quad(left[0], right[0], down(right[0]), down(left[0]));
    this.quad(left[n - 1], down(left[n - 1]), down(right[n - 1]), right[n - 1]);
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

/**
 * Unit sideways vector at point i of a polyline — the road's local +X
 * side, which is the driver's left. Faces are wound against this so top
 * surfaces end up with upward normals; both edges are treated
 * symmetrically, so which side is "left" only matters to the winding.
 */
function sideOf(pts: V3[], i: number): [number, number] {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  let tx = b.x - a.x, tz = b.z - a.z;
  const len = Math.hypot(tx, tz);
  if (len < 1e-9) { tx = 0; tz = 1; } else { tx /= len; tz /= len; }
  return [tz, -tx];
}
