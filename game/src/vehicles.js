// Cars: player-drivable + traffic AI. Arcade handling, AABB collisions,
// right-hand traffic loops around city blocks.
import * as THREE from 'three';
import { mulberry32, range, pick, clamp, dist2D, collideCircleBox } from './rng.js';
import { ROAD_CENTERS, PITCH, ROAD_W } from './city.js';

const CAR_COLORS = [0xc22a2a, 0x2a6aff, 0xe8c832, 0x9a9a9a, 0x2a9d5c, 0x7a3ac2, 0xe87a1f, 0xdddddd];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x14161c : color, roughness: 0.35, metalness: 0.55,
  });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.2), glassMat);
  cabin.position.set(0, 1.28, -0.2);
  g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.9), bodyMat);
  hood.position.set(0, 0.95, 1.85);
  g.add(hood);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    stripe.position.y = 0.72;
    g.add(stripe);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
    bar.position.set(0, 1.68, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.44), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 }));
    red.position.set(-0.32, 1.78, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.44), new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 3 }));
    blue.position.set(0.32, 1.78, -0.2);
    g.add(blue);
    g.userData.flashRed = red;
    g.userData.flashBlue = blue;
  }
  // headlights + taillights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 2.2 });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.1), hlMat);
    hl.position.set(sx, 0.68, 2.22);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xdd2020, emissiveIntensity: 1.4 }));
    tl.position.set(sx, 0.68, -2.22);
    g.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

// A rectangular loop around one city block, right-hand lane.
export function blockLoop(rng) {
  const bi = Math.floor(rng() * 7);
  const bj = Math.floor(rng() * 7);
  const x0 = -188 + 52 * bi + 6;
  const z0 = -188 + 52 * bj + 6;
  const x1 = x0 + 40;
  const z1 = z0 + 40;
  const lane = 2.4; // drive on the right side of each road
  const pts = [
    { x: x0 - 6 + lane, z: z0 - 6 + lane },
    { x: x1 + 6 - lane, z: z0 - 6 + lane },
    { x: x1 + 6 - lane, z: z1 + 6 - lane },
    { x: x0 - 6 + lane, z: z1 + 6 - lane },
  ];
  if (rng() < 0.5) pts.reverse();
  return pts;
}

export function makeTrafficCar(scene, rng) {
  const mesh = makeCarMesh(pick(rng, CAR_COLORS));
  scene.add(mesh);
  const loop = blockLoop(rng);
  const start = loop[Math.floor(rng() * loop.length)];
  mesh.position.set(start.x, 0, start.z);
  return {
    mesh,
    loop,
    seg: 0,
    speed: range(rng, 7, 11),
    cruise: range(rng, 7, 11),
    angle: 0,
    stopped: 0,
  };
}

export function updateTraffic(car, dt, others, colliders) {
  const target = car.loop[(car.seg + 1) % car.loop.length];
  const dx = target.x - car.mesh.position.x;
  const dz = target.z - car.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 2.5) {
    car.seg = (car.seg + 1) % car.loop.length;
    return;
  }
  const wantAngle = Math.atan2(dx, dz);
  let da = wantAngle - car.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  car.angle += clamp(da, -2.2 * dt, 2.2 * dt);
  // stop if a car is ahead
  let blocked = false;
  for (const o of others) {
    if (o === car) continue;
    const ox = o.mesh.position.x - car.mesh.position.x;
    const oz = o.mesh.position.z - car.mesh.position.z;
    const forward = ox * Math.sin(car.angle) + oz * Math.cos(car.angle);
    const side = Math.abs(ox * Math.cos(car.angle) - oz * Math.sin(car.angle));
    if (forward > 0 && forward < 9 && side < 2.2) { blocked = true; break; }
  }
  car.speed = blocked ? Math.max(0, car.speed - 14 * dt) : Math.min(car.cruise, car.speed + 6 * dt);
  const step = car.speed * dt;
  car.mesh.position.x += Math.sin(car.angle) * step;
  car.mesh.position.z += Math.cos(car.angle) * step;
  car.mesh.rotation.y = car.angle;
  for (const w of car.mesh.userData.wheels) w.rotation.x += (step / 0.38) * 0.9;
  // keep on the road: soft push back inside the city
  car.mesh.position.x = clamp(car.mesh.position.x, -186, 186);
  car.mesh.position.z = clamp(car.mesh.position.z, -186, 186);
}

// Arcade player driving. `input` = {up, down, left, right} booleans.
// Returns { speedKmh, crashed } — crashed when a hard impact happened.
export function updatePlayerDriving(car, input, dt, colliders, traffic, peds, onHit) {
  const accel = input.up ? 14 : input.down ? -10 : 0;
  car.speed = clamp(car.speed + accel * dt, -8, 24);
  if (!input.up && !input.down) car.speed *= Math.pow(0.4, dt); // drag
  if (Math.abs(car.speed) < 0.15) car.speed = 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  const turnRate = 1.9 * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed === 0 ? 0 : 1);
  car.angle += steer * turnRate * dir * dt;
  const nx = car.mesh.position.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.angle) * car.speed * dt;
  const prev = { x: car.mesh.position.x, z: car.mesh.position.z };
  car.mesh.position.x = nx;
  car.mesh.position.z = nz;
  // building collision
  let hit = false;
  for (const b of colliders) {
    const n = collideCircleBox(car.mesh.position, 2.1, b);
    if (n) {
      hit = true;
      const vn = car.speed * (Math.sin(car.angle) * n.x + Math.cos(car.angle) * n.z);
      if (vn > 0) car.speed *= -0.25; else car.speed *= 0.4;
    }
  }
  car.mesh.position.x = clamp(car.mesh.position.x, -186, 186);
  car.mesh.position.z = clamp(car.mesh.position.z, -186, 250);
  car.mesh.rotation.y = car.angle;
  const step = Math.abs(car.speed) * dt;
  for (const w of car.mesh.userData.wheels) w.rotation.x += (step / 0.38) * Math.sign(car.speed || 1);
  // traffic car bumps
  for (const t of traffic) {
    const d = dist2D(car.mesh.position.x, car.mesh.position.z, t.mesh.position.x, t.mesh.position.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const ux = (car.mesh.position.x - t.mesh.position.x) / d;
      const uz = (car.mesh.position.z - t.mesh.position.z) / d;
      car.mesh.position.x += ux * push;
      car.mesh.position.z += uz * push;
      t.mesh.position.x -= ux * push;
      t.mesh.position.z -= uz * push;
      if (Math.abs(car.speed) > 5) {
        car.speed *= 0.55;
        onHit && onHit('car', Math.abs(car.speed));
      }
    }
  }
  return { speedKmh: Math.abs(car.speed) * 3.6, hardHit: hit && Math.abs(car.speed) > 6, moved: Math.hypot(car.mesh.position.x - prev.x, car.mesh.position.z - prev.z) };
}
