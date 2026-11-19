// Pedestrians: sidewalk walkers with a small FSM (walk / idle / flee).
import * as THREE from 'three';
import { mulberry32, range, pick, chance, clamp, dist2D } from './rng.js';
import { ROAD_CENTERS } from './city.js';

const SHIRTS = [0xd8d8d8, 0x3a6fd8, 0xd83a3a, 0x3ad8a0, 0xe8c832, 0x9a5ad8, 0xe88a2a, 0x38b8c8];
const SKINS = [0xe8b98a, 0xc98a5a, 0x8a5a34, 0xf0c8a0];

export function makePersonMesh(shirtColor, pantsColor = 0x2a2d36, isCop = false) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(Math.random, SKINS), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: isCop ? 0x1a2a4a : shirtColor, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
  legL.position.set(-0.14, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.72;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.4, 1.16, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(legL, legR, torso, head, armL, armR);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0x0e1a30, roughness: 0.6 }));
    cap.position.y = 1.9;
    g.add(cap);
  }
  g.userData = { legL, legR, armL, armR };
  return g;
}

function randomSidewalkTarget(rng) {
  const horizontal = chance(rng, 0.5);
  const c = pick(rng, ROAD_CENTERS);
  const along = range(rng, -175, 175);
  const off = (chance(rng, 0.5) ? 1 : -1) * 8.6;
  return horizontal ? { x: along, z: c + off } : { x: c + off, z: along };
}

export function makePedestrian(scene, rng) {
  const mesh = makePersonMesh(pick(rng, SHIRTS));
  scene.add(mesh);
  const start = randomSidewalkTarget(rng);
  mesh.position.set(start.x, 0, start.z);
  return {
    mesh,
    target: randomSidewalkTarget(rng),
    speed: range(rng, 1.0, 1.7),
    state: 'walk',
    stateT: range(rng, 2, 8),
    angle: rng() * Math.PI * 2,
    walkPhase: rng() * 6,
    down: 0, // knocked-down timer (after being hit)
  };
}

export function updatePedestrian(p, dt, threat) {
  const m = p.mesh;
  if (p.down > 0) {
    p.down -= dt;
    m.rotation.x = -Math.PI / 2 * Math.min(1, (0.5 - p.down) * 4 + 0.4);
    if (p.down <= 0) {
      m.rotation.x = 0;
      p.state = 'flee';
      p.stateT = 2.5;
    }
    return;
  }
  p.stateT -= dt;
  const dThreat = threat ? dist2D(m.position.x, m.position.z, threat.x, threat.z) : 999;
  if (p.state !== 'flee' && dThreat < 7 && threat.fast) {
    p.state = 'flee';
    p.stateT = 2.5;
  }
  if (p.state === 'walk' && p.stateT <= 0) {
    if (chance(Math.random, 0.3)) { p.state = 'idle'; p.stateT = range(Math.random, 1.5, 4); }
    else p.target = randomSidewalkTarget(mulberry32((Math.random() * 1e9) | 0));
  }
  if (p.state === 'idle' && p.stateT <= 0) {
    p.state = 'walk';
    p.stateT = range(Math.random, 4, 10);
    p.target = randomSidewalkTarget(mulberry32((Math.random() * 1e9) | 0));
  }
  if (p.state === 'flee' && p.stateT <= 0) {
    p.state = 'walk';
    p.stateT = range(Math.random, 4, 10);
    p.target = randomSidewalkTarget(mulberry32((Math.random() * 1e9) | 0));
  }
  let speed = 0;
  let tx = p.target.x;
  let tz = p.target.z;
  if (p.state === 'walk') speed = p.speed;
  if (p.state === 'flee' && threat) {
    speed = 4.2;
    tx = m.position.x + (m.position.x - threat.x);
    tz = m.position.z + (m.position.z - threat.z);
  }
  if (speed > 0) {
    const dx = tx - m.position.x;
    const dz = tz - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      if (p.state === 'walk') { p.target = randomSidewalkTarget(mulberry32((Math.random() * 1e9) | 0)); }
    } else {
      const want = Math.atan2(dx, dz);
      let da = want - p.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      p.angle += clamp(da, -3.5 * dt, 3.5 * dt);
      m.position.x += Math.sin(p.angle) * speed * dt;
      m.position.z += Math.cos(p.angle) * speed * dt;
      m.position.x = clamp(m.position.x, -186, 186);
      m.position.z = clamp(m.position.z, -186, 194);
      p.walkPhase += dt * speed * 4;
    }
  }
  m.rotation.y = p.angle;
  const swing = p.state === 'walk' || p.state === 'flee' ? Math.sin(p.walkPhase) * 0.5 : 0;
  m.userData.legL.rotation.x = swing;
  m.userData.legR.rotation.x = -swing;
  m.userData.armL.rotation.x = -swing * 0.7;
  m.userData.armR.rotation.x = swing * 0.7;
}
