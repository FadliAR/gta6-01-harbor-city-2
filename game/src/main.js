// NEON HARBOR — main entry. Boots the renderer, owns the game loop,
// player controls, car enter/exit, police spawning and mission flow.
import * as THREE from 'three';
import { mulberry32, clamp, dist2D, collideCircleBox } from './rng.js';
import { buildCity, SEED, WATER_Z } from './city.js';
import { makeCarMesh, makeTrafficCar, updateTraffic, updatePlayerDriving } from './vehicles.js';
import { makePersonMesh, makePedestrian, updatePedestrian } from './pedestrians.js';
import {
  makeWanted, commitCrime, updateWanted, makeCop, updateCop,
  makePoliceCar, updatePoliceCar, makeHelicopter, updateHelicopter,
} from './police.js';
import { makeMissions, makeBeacon, pulseBeacon, MISSION_REWARDS } from './missions.js';
import { makeAudio } from './audio.js';
import { initUI, showScreen, showBanner, flashSave, updateHUD, drawMinimap, saveGame, loadSave } from './ui.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // vista | drive | chase | dusk (screenshot mode)

const G = {
  state: 'title', // title | playing | paused | busted | wasted | complete
  now: 0, health: 100, cash: 0, speedKmh: 0,
  inCar: false, playerCar: null, prompt: '',
  wanted: makeWanted(),
  missions: makeMissions(), missionIdx: 0, missionsDone: 0, missionTimer: 0,
  checkpoints: [], checkpointIdx: 0,
  hotCarStolen: false, hotCarPos: { x: -121.4, z: 40 },
  traffic: [], peds: [], parkedCars: [], cops: [], policeCars: [], heli: null,
  pickups: [], pickupsCollected: [], bestMs: 0, runStartMs: 0,
  keys: {}, camYaw: Math.PI, camPitch: 0.34, lastDrag: -99,
  playerAngle: Math.PI, vy: 0, onGround: true, lastDamage: -99,
  audio: makeAudio(), ui: null, beacon: null,
  nearestParkedCar: null,
};
Object.defineProperty(G, 'playerPos', {
  get() { return G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position; },
});
Object.defineProperty(G, 'playerAngle', {
  get() { return G.inCar && G.playerCar ? G.playerCar.angle : G._playerAngle; },
  set(v) { G._playerAngle = v; },
});

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game-root').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241a44);
scene.fog = new THREE.FogExp2(0x241a44, 0.0009);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0x9a8fd8, 0x2a2018, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff9a5a, 1.9);
sun.position.set(-150, 70, 60);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x3a5a8a, 0.5);
fill.position.set(120, 80, -80);
scene.add(fill);
const plazaLight = new THREE.PointLight(0x9a7fff, 60, 70, 1.8);
plazaLight.position.set(0, 24, 0);
scene.add(plazaLight);

// stars
{
  const rng = mulberry32(SEED + 7);
  const n = 350;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const e = 0.25 + rng() * 1.2;
    const r = 700;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false }));
  scene.add(stars);
}

// --- city -------------------------------------------------------------------
const city = buildCity(scene);
G.city = city;
const colliders = city.colliders;

// garage prop (mission 4 destination) in the NE parking lot
{
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 1 });
  const mk = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  mk(10, 4.5, 0.4, 0, 2.25, -3, wallMat);
  mk(0.4, 4.5, 6.4, -5, 2.25, 0, wallMat);
  mk(0.4, 4.5, 6.4, 5, 2.25, 0, wallMat);
  mk(10.4, 0.4, 6.8, 0, 4.7, 0, roofMat);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x19f6ff, emissiveIntensity: 2.4 })
  );
  strip.position.set(0, 4.2, 3.2);
  g.add(strip);
  g.position.set(156, 0, -156);
  scene.add(g);
  colliders.push({ minX: 150.6, maxX: 151.4, minZ: -159.4, maxZ: -152.6 });
  colliders.push({ minX: 160.6, maxX: 161.4, minZ: -159.4, maxZ: -152.6 });
  colliders.push({ minX: 150.6, maxX: 161.4, minZ: -159.4, maxZ: -158.6 });
}

// --- player -----------------------------------------------------------------
const playerMesh = makePersonMesh(0xd83a3a);
playerMesh.position.set(city.spawn.x, 0, city.spawn.z);
scene.add(playerMesh);
G.playerMesh = playerMesh;
G._playerAngle = city.spawn.angle;

// --- cars -------------------------------------------------------------------
const parkedRng = mulberry32(SEED + 31337);
for (const spot of city.parkedSpots) {
  const mesh = makeCarMesh(spot.color);
  mesh.position.set(spot.x, 0, spot.z);
  mesh.rotation.y = spot.angle;
  scene.add(mesh);
  G.parkedCars.push({ mesh, angle: spot.angle, speed: 0, spot, stolen: false });
}
// gold coupe for mission 4 (Hot Wheels)
{
  const mesh = makeCarMesh(0xffd24d);
  mesh.position.set(G.hotCarPos.x, 0, G.hotCarPos.z);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  const hot = { mesh, angle: Math.PI / 2, speed: 0, spot: { ...G.hotCarPos, color: 0xffd24d }, stolen: false, hot: true };
  G.parkedCars.push(hot);
  G.hotCar = hot;
}
for (let i = 0; i < 14; i++) G.traffic.push(makeTrafficCar(scene, mulberry32(SEED + 100 + i)));

// --- pedestrians ------------------------------------------------------------
for (let i = 0; i < 24; i++) G.peds.push(makePedestrian(scene, mulberry32(SEED + 500 + i)));

// --- cash pickups -----------------------------------------------------------
{
  const coinGeo = new THREE.TorusGeometry(0.55, 0.2, 10, 18);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd24d, emissive: 0xcc9900, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.3 });
  for (const s of city.pickupSpots) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(s.x, 1.3, s.z);
    mesh.rotation.x = Math.PI / 3;
    scene.add(mesh);
    G.pickups.push({ x: s.x, z: s.z, mesh, taken: false });
  }
}

// --- mission beacon ---------------------------------------------------------
G.beacon = makeBeacon(scene);

// --- UI ---------------------------------------------------------------------
const ui = initUI({
  onStart: (useSave) => startGame(useSave),
  onResume: () => { G.state = 'playing'; showScreen(ui, null); },
  onRestart: () => restart(),
});
G.ui = ui;

function startGame(useSave) {
  G.audio.init();
  const save = useSave ? loadSave() : null;
  if (save) {
    G.cash = save.cash || 0;
    G.missionsDone = save.missionsDone || 0;
    G.missionIdx = Math.min(G.missionsDone, 5);
    G.bestMs = save.bestMs || 0;
    for (const idx of save.pickups || []) {
      if (G.pickups[idx]) { G.pickups[idx].taken = true; G.pickups[idx].mesh.visible = false; }
    }
    G.pickupsCollected = [...(save.pickups || [])];
  } else {
    G.cash = 0;
    G.missionsDone = 0;
    G.missionIdx = 0;
    G.pickupsCollected = [];
  }
  startMission(G.missionIdx);
  G.runStartMs = performance.now();
  G.state = 'playing';
  showScreen(ui, null);
  showBanner(ui, 'NEON HARBOR', 'Welcome to the city. Make your own luck.');
}

function startMission(idx) {
  const m = G.missions[idx];
  if (!m) return;
  G.missionTimer = 0;
  G.checkpoints = [];
  G.checkpointIdx = 0;
  m.start(G);
  showBanner(ui, `MISSION ${idx + 1} — ${m.title}`, m.briefing);
}

function completeMission() {
  const idx = G.missionIdx;
  const reward = MISSION_REWARDS[idx];
  G.cash += reward;
  G.missionsDone = idx + 1;
  G.audio.jingle();
  showBanner(ui, 'MISSION COMPLETE', `+$${reward}  •  ${G.missions[idx].title}`);
  saveGame(G);
  flashSave(ui);
  if (idx >= 5) {
    G.bestMs = performance.now() - G.runStartMs;
    saveGame(G);
    G.state = 'complete';
    ui.completeStats.textContent = `All 6 missions done  •  $${G.cash} earned  •  ${Math.round(G.bestMs / 1000)}s`;
    showScreen(ui, 'complete');
    return;
  }
  G.missionIdx = idx + 1;
  startMission(G.missionIdx);
}

function restart() {
  location.reload();
}

// --- input ------------------------------------------------------------------
addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyR' && G.inCar) { G.audio.radioToggle(); }
  if (e.code === 'KeyN' && G.inCar) { G.audio.radioNext(); }
  if (e.code === 'KeyM') { G.audio.toggleMute(); }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'playing') { G.state = 'paused'; showScreen(ui, 'pause'); }
    else if (G.state === 'paused') { G.state = 'playing'; showScreen(ui, null); }
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
let dragging = false;
let lastMX = 0;
let lastMY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastMX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastMY) * 0.003, 0.08, 1.1);
  G.lastDrag = G.now;
  lastMX = e.clientX;
  lastMY = e.clientY;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- car enter / exit -------------------------------------------------------
function nearestCar(maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of G.parkedCars) {
    if (c.stolen) continue;
    const d = dist2D(G.playerMesh.position.x, G.playerMesh.position.z, c.mesh.position.x, c.mesh.position.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function tryEnterExitCar() {
  if (G.state !== 'playing') return;
  if (G.inCar) {
    // exit: place the player beside the car
    const c = G.playerCar;
    G.playerMesh.position.set(c.mesh.position.x + Math.cos(c.angle) * 2.4, 0, c.mesh.position.z - Math.sin(c.angle) * 2.4);
    G.playerMesh.visible = true;
    G._playerAngle = c.angle;
    G.inCar = false;
    G.playerCar = null;
    G.audio.setEngine(0, false);
    return;
  }
  const car = nearestCar(3.6);
  if (!car) return;
  G.inCar = true;
  G.playerCar = car;
  car.stolen = true;
  G.playerMesh.visible = false;
  if (car.hot && G.missionIdx === 3 && !G.hotCarStolen) {
    G.hotCarStolen = true;
    commitCrime(G.wanted, G.now, 1);
    showBanner(ui, 'STOLEN!', 'The gold coupe is yours — the cops noticed.');
  } else {
    commitCrime(G.wanted, G.now, 1);
  }
}

// --- police spawning --------------------------------------------------------
function managePolice(dt) {
  const w = G.wanted.level;
  const pp = G.playerPos;
  const wantCops = w === 0 ? 0 : (G.inCar ? 0 : Math.min(w, 3));
  const wantCars = w === 0 ? 0 : (G.inCar ? Math.min(w, 2) : 0);
  // foot cops
  while (G.cops.length < wantCops) {
    const cop = makeCop(scene);
    const a = Math.random() * Math.PI * 2;
    cop.mesh.position.set(pp.x + Math.cos(a) * 32, 0, pp.z + Math.sin(a) * 32);
    G.cops.push(cop);
  }
  while (G.cops.length > wantCops) scene.remove(G.cops.pop().mesh);
  // police cars
  while (G.policeCars.length < wantCars) {
    const car = makePoliceCar(scene);
    const a = Math.random() * Math.PI * 2;
    car.mesh.position.set(pp.x + Math.cos(a) * 36, 0, pp.z + Math.sin(a) * 36);
    car.angle = Math.atan2(pp.x - car.mesh.position.x, pp.z - car.mesh.position.z);
    G.policeCars.push(car);
  }
  while (G.policeCars.length > wantCars) scene.remove(G.policeCars.pop().mesh);
  // helicopter at wanted 4+
  if (w >= 4 && !G.heli) {
    G.heli = makeHelicopter(scene);
    G.heli.mesh.position.set(pp.x + 14, 42, pp.z - 10);
    G.audio.setSiren(w);
  } else if (w < 4 && G.heli) {
    scene.remove(G.heli.mesh);
    G.heli = null;
    G.audio.setSiren(w);
  }
}

// --- per-frame update -------------------------------------------------------
const clock = new THREE.Clock();
let saveTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now() / 1000;
  G.now += dt;

  if (G.state === 'playing') {
    updatePlaying(dt, t);
  }
  // city ambience always animates (also behind the title screen)
  for (const a of city.animated) {
    if (a.kind === 'water') a.obj.offset.x += dt * 0.008;
    if (a.kind === 'boat') { a.obj.position.y = -0.2 + Math.sin(t * 0.7 + a.phase) * 0.12; a.obj.rotation.z = Math.sin(t * 0.5 + a.phase) * 0.02; }
    if (a.kind === 'beacon') a.obj.material.emissiveIntensity = 2 + Math.sin(t * 5) * 1.2;
  }
  for (const p of G.pickups) {
    if (!p.taken) { p.mesh.rotation.y += dt * 2; p.mesh.position.y = 1.3 + Math.sin(t * 2 + p.x) * 0.15; }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updatePlaying(dt, t) {
  const k = G.keys;
  const input = {
    up: k.KeyW || k.ArrowUp, down: k.KeyS || k.ArrowDown,
    left: k.KeyA || k.ArrowLeft, right: k.KeyD || k.ArrowRight,
  };

  // --- player movement ---
  if (G.inCar) {
    const car = G.playerCar;
    const res = updatePlayerDriving(car, input, dt, colliders, G.traffic, G.peds, (kind, spd) => {
      if (kind === 'car') {
        commitCrime(G.wanted, G.now, 1);
        G.audio.crash();
        damage(6);
      }
    });
    G.speedKmh = res.speedKmh;
    if (res.hardHit) { G.audio.crash(); damage(4); }
    // hitting pedestrians while driving
    for (const p of G.peds) {
      if (p.down > 0) continue;
      const d = dist2D(car.mesh.position.x, car.mesh.position.z, p.mesh.position.x, p.mesh.position.z);
      if (d < 2.4 && Math.abs(car.speed) > 2) {
        p.down = 2.2;
        commitCrime(G.wanted, G.now, 1);
        G.audio.crash();
        damage(2);
      }
    }
    // police car rams
    for (const pc of G.policeCars) {
      const d = dist2D(car.mesh.position.x, car.mesh.position.z, pc.mesh.position.x, pc.mesh.position.z);
      if (d < 3.2) damage(3 * dt * 10);
    }
    G.audio.setEngine(G.speedKmh, true);
  } else {
    const sprint = k.ShiftLeft || k.ShiftRight;
    const speed = sprint ? 8.5 : 5.2;
    let mx = 0;
    let mz = 0;
    if (input.up) { mx -= Math.sin(G.camYaw); mz -= Math.cos(G.camYaw); }
    if (input.down) { mx += Math.sin(G.camYaw); mz += Math.cos(G.camYaw); }
    if (input.left) { mx -= Math.cos(G.camYaw); mz += Math.sin(G.camYaw); }
    if (input.right) { mx += Math.cos(G.camYaw); mz -= Math.sin(G.camYaw); }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
      const want = Math.atan2(mx, mz);
      let da = want - G._playerAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      G._playerAngle += clamp(da, -8 * dt, 8 * dt);
      G.playerMesh.position.x += mx * speed * dt;
      G.playerMesh.position.z += mz * speed * dt;
      G.playerMesh.userData.walkPhase = (G.playerMesh.userData.walkPhase || 0) + dt * speed * 1.6;
      const sw = Math.sin(G.playerMesh.userData.walkPhase) * 0.5;
      G.playerMesh.userData.legL.rotation.x = sw;
      G.playerMesh.userData.legR.rotation.x = -sw;
      G.playerMesh.userData.armL.rotation.x = -sw * 0.7;
      G.playerMesh.userData.armR.rotation.x = sw * 0.7;
    } else {
      G.playerMesh.userData.legL.rotation.x *= 0.8;
      G.playerMesh.userData.legR.rotation.x *= 0.8;
      G.playerMesh.userData.armL.rotation.x *= 0.8;
      G.playerMesh.userData.armR.rotation.x *= 0.8;
    }
    G.playerMesh.rotation.y = G._playerAngle;
    // jump / gravity
    if (k.Space && G.onGround) { G.vy = 8.5; G.onGround = false; }
    if (!G.onGround) {
      G.vy -= 22 * dt;
      G.playerMesh.position.y += G.vy * dt;
      if (G.playerMesh.position.y <= 0) { G.playerMesh.position.y = 0; G.vy = 0; G.onGround = true; }
    }
    for (const b of colliders) collideCircleBox(G.playerMesh.position, 0.6, b);
    G.playerMesh.position.x = clamp(G.playerMesh.position.x, -186, 186);
    G.playerMesh.position.z = clamp(G.playerMesh.position.z, -186, 194);
    G.speedKmh = 0;
    G.audio.setEngine(0, false);
  }

  // --- traffic + peds ---
  for (const car of G.traffic) updateTraffic(car, dt, G.traffic, colliders);
  const threat = G.inCar && G.playerCar ? { x: G.playerCar.mesh.position.x, z: G.playerCar.mesh.position.z, fast: Math.abs(G.playerCar.speed) > 4 } : null;
  for (const p of G.peds) updatePedestrian(p, dt, threat);

  // --- pickups ---
  for (let i = 0; i < G.pickups.length; i++) {
    const p = G.pickups[i];
    if (p.taken) continue;
    if (dist2D(G.playerPos.x, G.playerPos.z, p.x, p.z) < 2.4) {
      p.taken = true;
      p.mesh.visible = false;
      G.cash += 50;
      G.pickupsCollected.push(i);
      G.audio.pickup();
      saveGame(G);
      flashSave(ui);
    }
  }

  // --- wanted + police ---
  const copsNear = G.cops.some((c) => dist2D(c.mesh.position.x, c.mesh.position.z, G.playerPos.x, G.playerPos.z) < 30)
    || G.policeCars.length > 0;
  updateWanted(G.wanted, dt, G.now, copsNear);
  managePolice(dt);
  for (const cop of G.cops) {
    if (updateCop(cop, dt, G.playerPos, colliders)) {
      G.state = 'busted';
      G.audio.busted();
      showScreen(ui, 'busted');
      return;
    }
  }
  for (const pc of G.policeCars) updatePoliceCar(pc, dt, G.playerPos, colliders);
  if (G.heli) updateHelicopter(G.heli, dt, G.playerPos);
  G.audio.setSiren(G.wanted.level > 0 ? G.wanted.level : 0);

  // --- health ---
  if (G.wanted.level === 0 && G.now - G.lastDamage > 6) G.health = Math.min(100, G.health + 2 * dt);
  if (G.health <= 0) {
    G.state = 'wasted';
    showScreen(ui, 'wasted');
    return;
  }

  // --- missions ---
  const m = G.missions[G.missionIdx];
  if (m) {
    if (m.tick) m.tick(G, dt);
    const target = m.target(G);
    if (target) {
      G.beacon.visible = true;
      G.beacon.position.set(target.x, 0, target.z);
      pulseBeacon(G.beacon, t);
    } else {
      G.beacon.visible = false;
    }
    if (m.check(G) === 'done') completeMission();
  } else {
    G.beacon.visible = false;
  }

  // --- prompt (nearest stealable car) ---
  if (!G.inCar) {
    G.nearestParkedCar = nearestCar(3.6);
    G.prompt = G.nearestParkedCar ? 'Press E to steal this car' : '';
  } else {
    G.prompt = 'E — exit car  •  R — radio  •  N — station  •  M — mute';
  }

  // --- autosave + HUD ---
  saveTick += dt;
  if (saveTick > 15) { saveTick = 0; saveGame(G); }
  updateHUD(ui, G);
  drawMinimap(ui, G);
}

function damage(amount) {
  G.health -= amount;
  G.lastDamage = G.now;
}

// --- camera -----------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.cinematic) {
    camera.position.copy(G.cinematic.pos);
    camera.lookAt(G.cinematic.look);
    return;
  }
  if (G.shotCam === 'chase' && G.inCar && G.playerCar) {
    // side-front tracking view, snapped each frame: gold coupe low in
    // frame, police behind it, helicopter + searchlight up top
    const car = G.playerCar.mesh.position;
    const a = G.playerCar.angle;
    const side = 24;
    const px = car.x + Math.sin(a + 1.15) * side;
    const pz = car.z + Math.cos(a + 1.15) * side;
    camera.position.set(px, 7, pz);
    camera.lookAt(car.x, 12, car.z);
    return;
  }
  const focus = G.inCar && G.playerCar ? G.playerCar.mesh.position : G.playerMesh.position;
  const facing = G.playerAngle;
  // auto-follow behind the player unless the user dragged recently
  if (G.now - G.lastDrag > 2.5 && G.state === 'playing') {
    let target = facing + Math.PI;
    let da = target - G.camYaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    G.camYaw += da * Math.min(1, dt * 1.6);
  }
  const dist = G.inCar ? 15 : 9;
  const h = Math.sin(G.camPitch) * dist + 1.6;
  const r = Math.cos(G.camPitch) * dist;
  const cx = focus.x + Math.sin(G.camYaw) * r;
  const cz = focus.z + Math.cos(G.camYaw) * r;
  const pos = { x: cx, z: cz };
  for (const b of colliders) collideCircleBox(pos, 0.5, b);
  camTarget.set(focus.x, focus.y + 2.2, focus.z);
  camera.position.lerp(new THREE.Vector3(pos.x, Math.max(h, 1.4), pos.z), Math.min(1, dt * 8));
  camera.lookAt(camTarget);
}

// --- screenshot presets -----------------------------------------------------
function applyShot() {
  G.audio.init();
  // start the game immediately, no title screen
  G.cash = 1250;
  G.missionsDone = 0;
  G.missionIdx = 0;
  G.runStartMs = performance.now();
  G.state = 'playing';
  showScreen(ui, null);
  const pm = G.playerMesh;
  if (SHOT === 'vista') {
    G.missionIdx = 1;
    startMission(1);
    pm.position.set(30, 0, 150);
    G._playerAngle = Math.PI * 0.78;
    G.cinematic = { pos: new THREE.Vector3(120, 55, 195), look: new THREE.Vector3(-20, 10, -40) };
  } else if (SHOT === 'drive') {
    G.missionIdx = 2;
    startMission(2);
    const car = G.parkedCars[0];
    G.inCar = true;
    G.playerCar = car;
    car.stolen = true;
    car.mesh.position.set(-26, 0, 60);
    car.angle = Math.PI;
    car.speed = 16;
    pm.visible = false;
    G.camYaw = 0;
    G.camPitch = 0.3;
  } else if (SHOT === 'chase') {
    G.missionIdx = 3;
    startMission(3);
    G.hotCarStolen = true;
    G.wanted.level = 4;
    G.wanted.lastCrime = G.now;
    const car = G.hotCar;
    G.inCar = true;
    G.playerCar = car;
    car.stolen = true;
    car.mesh.position.set(26, 0, 20);
    car.angle = Math.PI; // heading north, into the city
    car.speed = 18;
    pm.visible = false;
    G.shotCam = 'chase';
  } else if (SHOT === 'dusk') {
    G.missionIdx = 4;
    startMission(4);
    G.wanted.level = 1;
    G.wanted.lastCrime = G.now;
    pm.position.set(-26, 0, -60);
    G._playerAngle = 0.41; // facing the Spire
    // cinematic: player in the lower frame, full Spire + neon behind
    G.cinematic = { pos: new THREE.Vector3(-38, 5, -78), look: new THREE.Vector3(10, 16, 10) };
  }
  window.__shotReady = true;
}

if (SHOT) {
  applyShot();
} else {
  showScreen(ui, 'title');
}

animate();
