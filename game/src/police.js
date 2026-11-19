// Wanted system + police response: foot cops, police cars, and a
// helicopter at wanted level 4+. Busted when a cop reaches the player.
import * as THREE from 'three';
import { mulberry32, range, clamp, dist2D, collideCircleBox } from './rng.js';
import { makePersonMesh } from './pedestrians.js';
import { makeCarMesh } from './vehicles.js';

export function makeWanted() {
  return {
    level: 0,
    lastCrime: -99,
    decayTimer: 0,
    crimeCooldown: 0,
  };
}

// +stars for a crime (with a short global cooldown so one crash isn't +3).
export function commitCrime(wanted, now, stars = 1) {
  if (now - wanted.crimeCooldown < 1.2) return false;
  wanted.crimeCooldown = now;
  wanted.level = Math.min(5, wanted.level + stars);
  wanted.lastCrime = now;
  wanted.decayTimer = 0;
  return true;
}

export function updateWanted(wanted, dt, now, copsNear) {
  if (wanted.level === 0) return;
  if (now - wanted.lastCrime > 9 && !copsNear) {
    wanted.decayTimer += dt;
    if (wanted.decayTimer > 6) {
      wanted.level -= 1;
      wanted.decayTimer = 0;
      wanted.lastCrime = now;
    }
  }
}

export function makeCop(scene) {
  const mesh = makePersonMesh(0x1a2a4a, 0x14161c, true);
  scene.add(mesh);
  return {
    mesh, angle: 0, speed: 4.4, walkPhase: Math.random() * 6, closeTimer: 0,
  };
}

export function updateCop(cop, dt, playerPos, colliders) {
  const m = cop.mesh;
  const dx = playerPos.x - m.position.x;
  const dz = playerPos.z - m.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.5) {
    const want = Math.atan2(dx, dz);
    let da = want - cop.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    cop.angle += clamp(da, -4 * dt, 4 * dt);
    m.position.x += Math.sin(cop.angle) * cop.speed * dt;
    m.position.z += Math.cos(cop.angle) * cop.speed * dt;
    for (const b of colliders) collideCircleBox(m.position, 0.6, b);
    cop.walkPhase += dt * 9;
  }
  m.rotation.y = cop.angle;
  const swing = Math.sin(cop.walkPhase) * 0.6;
  m.userData.legL.rotation.x = swing;
  m.userData.legR.rotation.x = -swing;
  m.userData.armL.rotation.x = -swing * 0.7;
  m.userData.armR.rotation.x = swing * 0.7;
  if (d < 1.7) cop.closeTimer += dt; else cop.closeTimer = 0;
  return cop.closeTimer > 0.9; // busted
}

export function makePoliceCar(scene) {
  const mesh = makeCarMesh(0x14161c, true);
  scene.add(mesh);
  return { mesh, angle: 0, speed: 0, flashT: Math.random() * 2 };
}

export function updatePoliceCar(car, dt, playerPos, colliders) {
  const m = car.mesh;
  const dx = playerPos.x - m.position.x;
  const dz = playerPos.z - m.position.z;
  const d = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let da = want - car.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  car.angle += clamp(da, -2.4 * dt, 2.4 * dt);
  const target = clamp(d / 6, 0, 1) * 17;
  car.speed += clamp(target - car.speed, -10 * dt, 8 * dt);
  m.position.x += Math.sin(car.angle) * car.speed * dt;
  m.position.z += Math.cos(car.angle) * car.speed * dt;
  for (const b of colliders) {
    const n = collideCircleBox(m.position, 2.1, b);
    if (n) car.speed *= 0.5;
  }
  m.position.x = clamp(m.position.x, -186, 186);
  m.position.z = clamp(m.position.z, -186, 250);
  m.rotation.y = car.angle;
  // light bar flash
  car.flashT += dt;
  const on = Math.floor(car.flashT * 6) % 2 === 0;
  m.userData.flashRed.material.emissiveIntensity = on ? 3.5 : 0.2;
  m.userData.flashBlue.material.emissiveIntensity = on ? 0.2 : 3.5;
  return d;
}

export function makeHelicopter(scene) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.5, metalness: 0.4, emissive: 0x0a1428, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5), bodyMat);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2), bodyMat);
  fin.position.set(0, 0.9, -6.2);
  g.add(fin);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
  rotor.position.y = 1.1;
  g.add(rotor);
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  g.add(rotor2);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  skidL.position.set(-1.2, -1.1, 0);
  g.add(skidL);
  const skidR = skidL.clone();
  skidR.position.x = 1.2;
  g.add(skidR);
  // blinking beacon so the heli reads at dusk
  const heliBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 })
  );
  heliBeacon.position.set(0, -1.2, 0);
  g.add(heliBeacon);
  // searchlight cone (additive, points down at the player)
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff6c8, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.5, 30, 20, 1, true), coneMat);
  cone.position.y = -15;
  g.add(cone);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(5, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = -29.4;
  g.add(spot);
  g.userData = { rotor, rotor2, cone, spot };
  scene.add(g);
  return { mesh: g, angle: 0, rotorT: 0 };
}

export function updateHelicopter(heli, dt, playerPos) {
  const m = heli.mesh;
  const tx = playerPos.x + 14;
  const tz = playerPos.z - 10;
  m.position.x += (tx - m.position.x) * Math.min(1, dt * 0.8);
  m.position.z += (tz - m.position.z) * Math.min(1, dt * 0.8);
  m.position.y = 30 + Math.sin(performance.now() * 0.0011) * 1.5;
  m.rotation.y += dt * 0.15;
  heli.rotorT += dt * 22;
  m.userData.rotor.rotation.y = heli.rotorT;
  m.userData.rotor2.rotation.y = heli.rotorT + Math.PI / 2;
  // keep the light pool on the player
  m.userData.spot.position.x = playerPos.x - m.position.x;
  m.userData.spot.position.z = playerPos.z - m.position.z;
  m.userData.spot.position.y = -m.position.y + 0.6;
}
