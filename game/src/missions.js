// 6 chained story missions for NEON HARBOR. Each mission exposes a
// target position (drawn as a beacon + minimap marker), an objective line
// for the HUD, and an update() that reports 'active' | 'done'.
import * as THREE from 'three';
import { dist2D } from './rng.js';

export const MISSION_REWARDS = [100, 150, 250, 300, 350, 500];

export function makeBeacon(scene, color = 0xffc832) {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 12, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 })
  );
  core.position.y = 2.2;
  g.add(core);
  g.userData = { ring, core, beamMat };
  g.visible = false;
  scene.add(g);
  return g;
}

export function pulseBeacon(beacon, t) {
  const s = 1 + Math.sin(t * 4) * 0.18;
  beacon.userData.ring.scale.set(s, s, 1);
  beacon.userData.core.position.y = 2.2 + Math.sin(t * 3) * 0.5;
  beacon.userData.beamMat.opacity = 0.1 + Math.sin(t * 2.5) * 0.04;
}

// Mission definitions. `G` is the shared game state (see main.js).
export function makeMissions() {
  return [
    {
      id: 0, title: 'First Wheels',
      briefing: 'You need wheels. Walk up to any parked car and press E to take it.',
      objective: () => 'Steal any car  [E]',
      target: (G) => G.nearestParkedCar || { x: 0, z: 60 },
      check: (G) => (G.inCar ? 'done' : 'active'),
      start: () => {},
    },
    {
      id: 1, title: 'Harbor Pickup',
      briefing: 'A package is waiting at the marina. Drive to the beacon and grab it.',
      objective: (G) => `Pick up the package at the marina  (${Math.round(dist2D(G.playerPos.x, G.playerPos.z, 110, 200))} m)`,
      target: () => ({ x: 110, z: 200 }),
      check: (G) => (dist2D(G.playerPos.x, G.playerPos.z, 110, 200) < 5 ? 'done' : 'active'),
      start: () => {},
    },
    {
      id: 2, title: 'Cross-Town Delivery',
      briefing: 'Get the package to the Spire plaza in 90 seconds. No excuses.',
      objective: (G) => `Deliver to the Spire plaza  (${Math.ceil(G.missionTimer)}s left)`,
      target: () => ({ x: 0, z: 0 }),
      check: (G) => (dist2D(G.playerPos.x, G.playerPos.z, 0, 0) < 6 ? 'done' : 'active'),
      start: (G) => { G.missionTimer = 90; },
      tick: (G, dt) => {
        G.missionTimer -= dt;
        if (G.missionTimer <= 0) G.missionTimer = 90; // timer resets, no hard fail
      },
    },
    {
      id: 3, title: 'Hot Wheels',
      briefing: 'A gold coupe is parked uptown. Take it — the cops will notice — and bring it to the garage in the north-east parking lot.',
      objective: (G) => (G.hotCarStolen
        ? `Bring the gold coupe to the garage  (${Math.round(dist2D(G.playerPos.x, G.playerPos.z, 156, -156))} m)`
        : `Steal the gold coupe  (${Math.round(dist2D(G.playerPos.x, G.playerPos.z, G.hotCarPos.x, G.hotCarPos.z))} m)`),
      target: (G) => (G.hotCarStolen ? { x: 156, z: -156 } : G.hotCarPos),
      check: (G) => (G.hotCarStolen && dist2D(G.playerPos.x, G.playerPos.z, 156, -156) < 7 ? 'done' : 'active'),
      start: (G) => { G.hotCarStolen = false; },
    },
    {
      id: 4, title: 'Lose the Heat',
      briefing: 'The harbor PD is onto you. Lose the heat, then meet the crew at the end of the pier.',
      objective: (G) => (G.wanted.level > 0
        ? `Lose the cops  (wanted ${'★'.repeat(G.wanted.level)})`
        : `Reach the end of the pier  (${Math.round(dist2D(G.playerPos.x, G.playerPos.z, 110, 246))} m)`),
      target: (G) => (G.wanted.level > 0 ? null : { x: 110, z: 246 }),
      check: (G) => (G.wanted.level === 0 && dist2D(G.playerPos.x, G.playerPos.z, 110, 246) < 5 ? 'done' : 'active'),
      start: (G) => {
        G.wanted.level = 2;
        G.wanted.lastCrime = G.now;
      },
    },
    {
      id: 5, title: 'Grand Finale',
      briefing: 'One last run: hit all three checkpoints around the city, then bring it home to the Spire. 150 seconds on the clock.',
      objective: (G) => {
        const cp = G.checkpoints[G.checkpointIdx];
        if (!cp) return 'Bring it home to the Spire plaza';
        return `Checkpoint ${G.checkpointIdx + 1}/3  (${Math.round(dist2D(G.playerPos.x, G.playerPos.z, cp.x, cp.z))} m)  •  ${Math.ceil(G.missionTimer)}s`;
      },
      target: (G) => {
        const cp = G.checkpoints[G.checkpointIdx];
        return cp || { x: 0, z: 0 };
      },
      check: (G) => {
        const cp = G.checkpoints[G.checkpointIdx];
        if (cp) {
          if (dist2D(G.playerPos.x, G.playerPos.z, cp.x, cp.z) < 6) {
            G.checkpointIdx += 1;
            G.audio.jingle();
            return 'active';
          }
          return 'active';
        }
        return dist2D(G.playerPos.x, G.playerPos.z, 0, 0) < 6 ? 'done' : 'active';
      },
      start: (G) => {
        G.checkpoints = [{ x: -150, z: -150 }, { x: 150, z: -150 }, { x: 150, z: 150 }];
        G.checkpointIdx = 0;
        G.missionTimer = 150;
      },
      tick: (G, dt) => {
        G.missionTimer -= dt;
        if (G.missionTimer <= 0) G.missionTimer = 150;
      },
    },
  ];
}
