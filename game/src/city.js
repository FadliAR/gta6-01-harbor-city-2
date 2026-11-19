// NEON HARBOR city: 7x7 block grid, plaza + 78 m Harbor Spire, marina,
// pier and water to the south. Everything is seeded (seed 1337) so the
// city is identical on every load. Anti-boxy: setbacks, roof props,
// neon signs, varied facades and heights.
import * as THREE from 'three';
import { mulberry32, range, pick, int, chance, clamp } from './rng.js';

export const SEED = 1337;
export const PITCH = 52; // road center to road center
export const ROAD_W = 12;
export const HALF = 188; // city half-extent
export const ROAD_CENTERS = [-182, -130, -78, -26, 26, 78, 130, 182];
export const WATER_Z = 196; // walking stops here (except the pier)

const FACADE_COLORS = ['#5a5f73', '#6b5a52', '#4c5a68', '#5d4a63', '#715a4a', '#46586a'];
const NEON = [0x19f6ff, 0xff2ea6, 0xff9a1f, 0x7dff5a, 0xff4d4d, 0xc26bff];
const SIGN_WORDS = ['HOTEL', 'NEON', 'PIER 9', '24H', 'BAR', 'TACOS', 'MOTEL', 'CLUB', 'RAMEN', 'DANCE'];

// ---- canvas texture helpers ------------------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One facade variant: diffuse windows + matching emissive (lit windows).
function makeFacade(base, litRatio, rng) {
  const cols = 8;
  const rows = 12;
  const cw = 32;
  const ch = 24;
  const lit = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) lit.push(rng() < litRatio);
  }
  const map = canvasTex(cols * cw, rows * ch, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, cols * cw, rows * ch);
    // subtle vertical grime bands
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
      g.fillRect(rng() * cols * cw, 0, 4 + rng() * 10, rows * ch);
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const wx = x * cw + 6;
        const wy = y * ch + 5;
        g.fillStyle = lit[y * cols + x] ? '#ffd98a' : '#141a26';
        g.fillRect(wx, wy, cw - 12, ch - 10);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(wx, wy, cw - 12, 3);
      }
    }
  });
  const emissiveMap = canvasTex(cols * cw, rows * ch, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, cols * cw, rows * ch);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!lit[y * cols + x]) continue;
        const warm = chance(rng, 0.8);
        g.fillStyle = warm ? '#ffca6a' : '#9fd8ff';
        g.fillRect(x * cw + 6, y * ch + 5, cw - 12, ch - 10);
      }
    }
  });
  return { map, emissiveMap };
}

function makeSignTexture(word, color) {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = '#0a0a12';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.strokeRect(4, 4, 248, 88);
    g.fillStyle = color;
    g.font = 'bold 52px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillText(word, 128, 50);
  });
}

function makeGroundTexture() {
  const S = 2048;
  const px = S / (HALF * 2); // px per meter
  const toPx = (v) => (v + HALF) * px;
  return canvasTex(S, S, (g) => {
    // base: sidewalk
    g.fillStyle = '#333743';
    g.fillRect(0, 0, S, S);
    // blocks (slightly lighter slabs)
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const x0 = -HALF + PITCH * i + ROAD_W / 2;
        const z0 = -HALF + PITCH * j + ROAD_W / 2;
        g.fillStyle = (i === 3 && j === 3) ? '#3d3454' : '#3a3f4d';
        g.fillRect(toPx(x0), toPx(z0), (PITCH - ROAD_W) * px, (PITCH - ROAD_W) * px);
      }
    }
    // roads
    g.fillStyle = '#191c22';
    for (const c of ROAD_CENTERS) {
      g.fillRect(toPx(c - ROAD_W / 2), 0, ROAD_W * px, S);
      g.fillRect(0, toPx(c - ROAD_W / 2), S, ROAD_W * px);
    }
    // center dashes
    g.fillStyle = '#8a7a3a';
    for (const c of ROAD_CENTERS) {
      for (let d = -HALF + 8; d < HALF - 8; d += 16) {
        g.fillRect(toPx(c) - 1, toPx(d), 2, 8 * px);
        g.fillRect(toPx(d), toPx(c) - 1, 8 * px, 2);
      }
    }
    // crosswalks at every intersection
    g.fillStyle = 'rgba(220,220,220,0.55)';
    for (const cx of ROAD_CENTERS) {
      for (const cz of ROAD_CENTERS) {
        for (let k = -2; k <= 2; k++) {
          g.fillRect(toPx(cx + k * 2.2) - 3, toPx(cz - ROAD_W / 2), 6, 2.2 * px);
          g.fillRect(toPx(cx - ROAD_W / 2), toPx(cz + k * 2.2) - 3, 2.2 * px, 6);
        }
      }
    }
    // plaza: concentric rings + gold star
    const pc = toPx(0);
    g.strokeStyle = '#6a5a9a';
    g.lineWidth = 5;
    for (const r of [14, 10, 6]) {
      g.beginPath();
      g.arc(pc, pc, r * px, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#c9a227';
    g.beginPath();
    g.arc(pc, pc, 2.2 * px, 0, Math.PI * 2);
    g.fill();
    // beach strip at the south edge
    g.fillStyle = '#7d6f4e';
    g.fillRect(0, toPx(176), S, (HALF - 176) * px);
    // marina apron
    g.fillStyle = '#2c2f38';
    g.fillRect(toPx(84), toPx(150), 92 * px, 38 * px);
  });
}

// ---- city builder ----------------------------------------------------------

export function buildCity(scene) {
  const rng = mulberry32(SEED);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const parkedSpots = [];
  const pickupSpots = [];
  const animated = []; // {obj, kind, phase}
  const group = new THREE.Group();
  scene.add(group);

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // --- water (south) + animated wave texture ---
  const waveTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#0b3d66';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(140,200,255,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const y = rng() * 256;
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.09 + i) * 4);
      g.stroke();
    }
  });
  waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(6, 3);
  const waterMat = new THREE.MeshStandardMaterial({
    map: waveTex, color: 0x9fd4ff, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.5, WATER_Z + 130 - 8);
  group.add(water);
  animated.push({ obj: waveTex, kind: 'water' });

  // --- materials ---
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 1 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
  const facades = FACADE_COLORS.map((c) => makeFacade(c, 0.45, mulberry32(SEED + FACADE_COLORS.indexOf(c) * 77)));
  const signTexs = SIGN_WORDS.map((w, i) => makeSignTexture(w, ['#19f6ff', '#ff2ea6', '#ff9a1f', '#7dff5a'][i % 4]));

  function addBox(w, h, d, x, y, z, mat, parent = group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function building(x0, z0, w, d, h, facadeIdx) {
    const f = facades[facadeIdx % facades.length];
    const map = f.map.clone();
    const em = f.emissiveMap.clone();
    map.needsUpdate = true;
    em.needsUpdate = true;
    map.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 9)));
    em.repeat.copy(map.repeat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    em.wrapS = em.wrapT = THREE.RepeatWrapping;
    const side = new THREE.MeshStandardMaterial({
      map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.85,
    });
    const mats = [side, side, roofMat, roofMat, side, side];
    const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    main.position.set(x0 + w / 2, h / 2, z0 + d / 2);
    group.add(main);
    // setback crown (anti-boxy)
    const cw = w * range(rng, 0.45, 0.7);
    const cd = d * range(rng, 0.45, 0.7);
    const ch = h * range(rng, 0.18, 0.34);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), mats);
    crown.position.set(x0 + w / 2 + range(rng, -2, 2), h + ch / 2, z0 + d / 2 + range(rng, -2, 2));
    group.add(crown);
    // roof props: AC units, antenna, tank
    const nProps = int(rng, 1, 3);
    for (let i = 0; i < nProps; i++) {
      const kind = rng();
      const px = x0 + range(rng, 2, w - 2);
      const pz = z0 + range(rng, 2, d - 2);
      if (kind < 0.45) {
        addBox(2.2, 1.1, 1.6, px, h + 0.55, pz, darkMetal);
      } else if (kind < 0.75) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, range(rng, 4, 9), 6), darkMetal);
        ant.position.set(px, h + 3, pz);
        group.add(ant);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 2 }));
        tip.position.set(px, h + 6.5, pz);
        group.add(tip);
      } else {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10), concreteMat);
        tank.position.set(px, h + 1.2, pz);
        group.add(tank);
      }
    }
    // neon sign on some buildings
    if (chance(rng, 0.55)) {
      const st = pick(rng, signTexs);
      const sm = new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: 0xffffff, emissiveIntensity: 1.6 });
      const face = chance(rng, 0.5) ? 0 : 1;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), sm);
      if (face === 0) {
        sign.position.set(x0 + w / 2, Math.min(h * 0.8, 14), z0 - 0.15);
        sign.rotation.y = Math.PI;
      } else {
        sign.position.set(x0 + w / 2, Math.min(h * 0.8, 14), z0 + d + 0.15);
      }
      group.add(sign);
    }
    colliders.push({ minX: x0, maxX: x0 + w, minZ: z0, maxZ: z0 + d });
    return { x: x0 + w / 2, z: z0 + d / 2, w, d, h };
  }

  // --- blocks ---
  const built = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const bx = -HALF + PITCH * i + ROAD_W / 2;
      const bz = -HALF + PITCH * j + ROAD_W / 2;
      if (i === 3 && j === 3) continue; // plaza
      if (i === 0 && j === 0) continue; // park
      if (i === 6 && j === 0) continue; // parking lot
      const distC = Math.hypot(bx + 20 - 0, bz + 20 - 0) / 270;
      const hBase = 10 + (1 - clamp(distC, 0, 1)) * 26 + rng() * 10;
      if (j === 6) {
        // south row: low warehouses by the marina
        building(bx + 3, bz + 4, 30, 26, range(rng, 6, 10), int(rng, 0, 5));
        built.push({ bx, bz });
        continue;
      }
      if (chance(rng, 0.4)) {
        // two buildings per block
        building(bx + 2, bz + 2, 16, 16, hBase * range(rng, 0.7, 1), int(rng, 0, 5));
        building(bx + 22, bz + 20, 15, 15, hBase * range(rng, 0.7, 1.1), int(rng, 0, 5));
      } else {
        const w = range(rng, 20, 30);
        const d = range(rng, 20, 30);
        building(bx + (40 - w) / 2, bz + (40 - d) / 2, w, d, hBase, int(rng, 0, 5));
      }
      built.push({ bx, bz });
    }
  }

  // --- Harbor Spire (78 m) at the plaza ---
  const spire = new THREE.Group();
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: 0.4, metalness: 0.4 });
  const spireGlass = new THREE.MeshStandardMaterial({
    color: 0x1a2a44, emissive: 0x2a6aff, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.6,
  });
  for (let s = 0; s < 5; s++) {
    const w = 14 - s * 2.2;
    const h = 78 / 5;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), s % 2 ? spireMat : spireGlass);
    seg.position.y = h / 2 + s * h;
    spire.add(seg);
    // glowing ring between segments
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, w + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111122, emissive: pick(rng, NEON), emissiveIntensity: 2.2 })
    );
    ring.position.y = (s + 1) * h;
    spire.add(ring);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 })
  );
  beacon.position.y = 79.5;
  spire.add(beacon);
  animated.push({ obj: beacon, kind: 'beacon' });
  spire.position.set(0, 0, 0);
  group.add(spire);
  colliders.push({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 });
  // plaza planters + benches
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    addBox(3, 1, 3, Math.cos(a) * 15, 0.5, Math.sin(a) * 15, concreteMat);
    addBox(2.6, 0.5, 1, Math.cos(a) * 12, 0.8, Math.sin(a) * 12, darkMetal);
  }

  // --- park (block 0,0): trees + benches ---
  function tree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 1 }));
    trunk.position.set(x, 1.2, z);
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 8), new THREE.MeshStandardMaterial({ color: 0x1f6b2e, roughness: 1 }));
    top.position.set(x, 4.6, z);
    group.add(top);
  }
  for (let k = 0; k < 8; k++) {
    tree(-176 + range(rng, 4, 36), -176 + range(rng, 4, 36));
  }

  // --- street props: lamps, hydrants, billboards, traffic lights ---
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 2.4 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30333c, roughness: 0.7, metalness: 0.6 });
  for (const cx of ROAD_CENTERS) {
    for (const cz of ROAD_CENTERS) {
      if (chance(rng, 0.5)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6), poleMat);
      pole.position.set(cx + 6.8, 3.25, cz + 6.8);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.4), lampHeadMat);
      head.position.set(cx + 6.2, 6.5, cz + 6.8);
      group.add(head);
    }
  }
  for (let k = 0; k < 14; k++) {
    const x = pick(rng, ROAD_CENTERS) + range(rng, -5, 5);
    const z = pick(rng, ROAD_CENTERS) + range(rng, -5, 5);
    addBox(0.7, 1.1, 0.7, x, 0.55, z, new THREE.MeshStandardMaterial({ color: 0xc22a2a, roughness: 0.7 }));
  }
  // billboards on two downtown blocks
  const bbTex = makeSignTexture('NEON HARBOR', '#19f6ff');
  for (const [bx, bz] of [[-72, -72], [32, -72]]) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 6),
      new THREE.MeshStandardMaterial({ map: bbTex, emissiveMap: bbTex, emissive: 0xffffff, emissiveIntensity: 1.2, side: THREE.DoubleSide })
    );
    board.position.set(bx + 20, 20, bz + 1);
    group.add(board);
    addBox(0.8, 20, 0.8, bx + 14, 10, bz + 0.6, poleMat);
    addBox(0.8, 20, 0.8, bx + 26, 10, bz + 0.6, poleMat);
    colliders.push({ minX: bx + 13, maxX: bx + 15, minZ: bz, maxZ: bz + 1.5 });
    colliders.push({ minX: bx + 25, maxX: bx + 27, minZ: bz, maxZ: bz + 1.5 });
  }

  // --- marina: docks + pier + boats ---
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.95 });
  // pier deck (walkable) at x 100..120, z 188..252 — thin slab just above
  // the water so the player walks over it at ground level
  addBox(20, 0.3, 64, 110, -0.1, 220, dockMat);
  colliders.push({ minX: 99, maxX: 101, minZ: 188, maxZ: 252 }); // pier rails
  colliders.push({ minX: 119, maxX: 121, minZ: 188, maxZ: 252 });
  colliders.push({ minX: 100, maxX: 120, minZ: 250, maxZ: 252 }); // pier end
  for (let k = 0; k < 6; k++) {
    const z = 196 + k * 10;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), poleMat);
    lamp.position.set(101, 2.8, z);
    group.add(lamp);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lampHeadMat);
    head.position.set(101, 4.9, z);
    group.add(head);
  }
  // side docks
  addBox(40, 0.3, 6, 60, -0.1, 200, dockMat);
  addBox(40, 0.3, 6, 160, -0.1, 206, dockMat);
  // boats (bob in the main loop)
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
  const boatMat2 = new THREE.MeshStandardMaterial({ color: 0x2a6aff, roughness: 0.5 });
  const boatSpots = [[52, 214, 0.3], [78, 222, -0.2], [150, 218, 0.1], [168, 226, 0.5]];
  for (const [bx, bz, rot] of boatSpots) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 9), chance(rng, 0.5) ? boatMat : boatMat2);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
    cabin.position.set(0, 1.4, -0.5);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 6), poleMat);
    mast.position.set(0, 3.4, 1);
    boat.add(mast);
    boat.position.set(bx, -0.2, bz);
    boat.rotation.y = rot;
    group.add(boat);
    animated.push({ obj: boat, kind: 'boat', phase: rng() * 6 });
  }

  // --- parked car spots (along road edges) ---
  const parkRng = mulberry32(SEED + 999);
  for (let k = 0; k < 18; k++) {
    const horizontal = chance(parkRng, 0.5);
    const c = pick(parkRng, ROAD_CENTERS);
    const along = range(parkRng, -150, 150);
    const side = chance(parkRng, 0.5) ? 1 : -1;
    if (horizontal) {
      parkedSpots.push({ x: along, z: c + side * 8.6, angle: side > 0 ? 0 : Math.PI, color: pick(parkRng, [0xc22a2a, 0x2a6aff, 0xe8c832, 0x888888, 0x2a9d5c, 0x7a3ac2]) });
    } else {
      parkedSpots.push({ x: c + side * 8.6, z: along, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2, color: pick(parkRng, [0xc22a2a, 0x2a6aff, 0xe8c832, 0x888888, 0x2a9d5c, 0x7a3ac2]) });
    }
  }
  // keep parked spots out of the plaza and pier approach
  const filtered = parkedSpots.filter((s) => Math.hypot(s.x, s.z) > 26 && !(s.z > 170 && s.x > 80 && s.x < 140));

  // --- cash pickup spots (seeded, on sidewalks/plaza/beach) ---
  const pickRng = mulberry32(SEED + 4242);
  const cand = [
    [0, 26], [-14, -14], [14, -14], [-60, 40], [70, -30], [-120, 90], [130, 60],
    [110, 182], [40, 130], [-150, -130],
  ];
  for (const [x, z] of cand) {
    pickupSpots.push({ x: x + range(pickRng, -2, 2), z: z + range(pickRng, -2, 2) });
  }

  // --- water wall (blocks walking into the sea, gap at the pier) ---
  colliders.push({ minX: -400, maxX: 99, minZ: WATER_Z, maxZ: WATER_Z + 2 });
  colliders.push({ minX: 121, maxX: 400, minZ: WATER_Z, maxZ: WATER_Z + 2 });
  // city edge walls
  colliders.push({ minX: -192, maxX: -188, minZ: -192, maxZ: 192 });
  colliders.push({ minX: 188, maxX: 192, minZ: -192, maxZ: 192 });
  colliders.push({ minX: -192, maxX: 192, minZ: -192, maxZ: -188 });

  return {
    group, colliders, parkedSpots: filtered, pickupSpots, animated,
    spawn: { x: 0, z: 44, angle: Math.PI }, // south of the Spire, facing it
    plaza: { x: 0, z: 0 },
    marina: { x: 110, z: 200 },
    pierEnd: { x: 110, z: 246 },
    garage: { x: 156, z: -156 },
  };
}
