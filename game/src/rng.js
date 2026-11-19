// Seeded deterministic RNG (mulberry32) + small helpers.
// Every random choice in NEON HARBOR comes from a seed so the city,
// traffic and pickups are identical on every load (seed 1337).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function int(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function chance(rng, p) {
  return rng() < p;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Circle vs axis-aligned box push-out in the XZ plane.
// Returns true when a collision happened; mutates pos {x, z} and zeroes
// the radial velocity component via the returned normal.
export function collideCircleBox(pos, radius, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
    return { x: dx / d, z: dz / d };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const pl = pos.x - box.minX;
  const pr = box.maxX - pos.x;
  const pt = pos.z - box.minZ;
  const pb = box.maxZ - pos.z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) { pos.x = box.minX - radius; return { x: -1, z: 0 }; }
  if (m === pr) { pos.x = box.maxX + radius; return { x: 1, z: 0 }; }
  if (m === pt) { pos.z = box.minZ - radius; return { x: 0, z: -1 }; }
  pos.z = box.maxZ + radius;
  return { x: 0, z: 1 };
}
