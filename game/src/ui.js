// HUD, minimap, menus and localStorage save/continue for NEON HARBOR.
import { ROAD_CENTERS } from './city.js';

const SAVE_KEY = 'neon-harbor-save-v1';

export function saveGame(G) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionsDone: G.missionsDone,
      pickups: G.pickupsCollected,
      bestMs: G.bestMs,
      savedAt: Date.now(),
    }));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function initUI(cb) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), cash: $('cash'), healthFill: $('health-fill'), stars: $('stars'),
    missionTitle: $('mission-title'), objective: $('objective'), speed: $('speed'),
    radioLabel: $('radio-label'), prompt: $('prompt'), banner: $('banner'),
    saveFlash: $('save-flash'), minimap: $('minimap'),
    title: $('title-screen'), pause: $('pause-screen'), busted: $('busted-screen'),
    wasted: $('wasted-screen'), complete: $('complete-screen'),
    btnStart: $('btn-start'), btnContinue: $('btn-continue'), btnResume: $('btn-resume'),
    btnRestartPause: $('btn-restart-pause'), btnRetryBusted: $('btn-retry-busted'),
    btnRetryWasted: $('btn-retry-wasted'), btnAgain: $('btn-again'),
    completeStats: $('complete-stats'), saveInfo: $('save-info'),
  };
  el.btnStart.addEventListener('click', () => cb.onStart(false));
  el.btnContinue.addEventListener('click', () => cb.onStart(true));
  el.btnResume.addEventListener('click', cb.onResume);
  el.btnRestartPause.addEventListener('click', () => cb.onRestart());
  el.btnRetryBusted.addEventListener('click', () => cb.onRestart());
  el.btnRetryWasted.addEventListener('click', () => cb.onRestart());
  el.btnAgain.addEventListener('click', () => cb.onRestart());
  const save = loadSave();
  if (save && save.missionsDone > 0) {
    el.btnContinue.style.display = 'inline-block';
    el.saveInfo.textContent = `Saved progress: $${save.cash} • ${save.missionsDone}/6 missions done`;
  }
  return el;
}

export function showScreen(el, name) {
  for (const k of ['title', 'pause', 'busted', 'wasted', 'complete']) {
    el[k].style.display = k === name ? 'flex' : 'none';
  }
  el.hud.style.display = name === null ? 'block' : 'none';
}

let bannerTimer = null;
export function showBanner(el, text, sub = '') {
  el.banner.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2600);
}

export function flashSave(el) {
  el.saveFlash.classList.add('show');
  setTimeout(() => el.saveFlash.classList.remove('show'), 1200);
}

export function updateHUD(el, G) {
  el.cash.textContent = `$${G.cash}`;
  el.healthFill.style.width = `${Math.max(0, G.health)}%`;
  el.healthFill.style.background = G.health > 50 ? '#37d67a' : G.health > 25 ? '#e8c832' : '#e83a3a';
  el.stars.textContent = '★'.repeat(G.wanted.level) + '☆'.repeat(5 - G.wanted.level);
  el.stars.style.color = G.wanted.level >= 4 ? '#ff4040' : '#ffd94d';
  const m = G.missions[G.missionIdx];
  el.missionTitle.textContent = m ? `MISSION ${G.missionIdx + 1}/6 — ${m.title}` : 'ALL MISSIONS COMPLETE';
  el.objective.textContent = m ? m.objective(G) : 'Free roam — enjoy Neon Harbor!';
  if (G.inCar) {
    el.speed.style.display = 'block';
    el.speed.textContent = `${Math.round(G.speedKmh)} km/h`;
    el.radioLabel.style.display = 'block';
    el.radioLabel.textContent = G.audio.radioOn() ? `♪ ${G.audio.radioName()}  [R]` : 'Radio off  [R]';
  } else {
    el.speed.style.display = 'none';
    el.radioLabel.style.display = 'none';
  }
  el.prompt.textContent = G.prompt || '';
  el.prompt.style.display = G.prompt ? 'block' : 'none';
}

// --- minimap ----------------------------------------------------------------
const MM = 188;
export function drawMinimap(el, G) {
  const cv = el.minimap;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const toPx = (v) => ((v + MM) / (MM * 2)) * S;
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(0, 0, S, S);
  // water (south)
  ctx.fillStyle = '#0b3d66';
  ctx.fillRect(0, toPx(188), S, S - toPx(188));
  // roads
  ctx.strokeStyle = '#454b5c';
  ctx.lineWidth = 5;
  for (const c of ROAD_CENTERS) {
    ctx.beginPath(); ctx.moveTo(toPx(c), 0); ctx.lineTo(toPx(c), S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toPx(c)); ctx.lineTo(S, toPx(c)); ctx.stroke();
  }
  // buildings
  ctx.fillStyle = '#5a6070';
  for (const b of G.city.colliders) {
    if (b.minX < -190 || b.maxX > 190 || b.minZ < -190 || b.maxZ > 190) continue;
    if (b.maxX - b.minX > 36 || b.maxZ - b.minZ > 36) continue;
    ctx.fillRect(toPx(b.minX), toPx(b.minZ), (b.maxX - b.minX) / (MM * 2) * S, (b.maxZ - b.minZ) / (MM * 2) * S);
  }
  // pier
  ctx.fillStyle = '#6b4e2e';
  ctx.fillRect(toPx(100), toPx(188), (20 / (MM * 2)) * S, (64 / (MM * 2)) * S);
  // cash pickups
  ctx.fillStyle = '#37d67a';
  for (const p of G.pickups) {
    if (p.taken) continue;
    ctx.beginPath();
    ctx.arc(toPx(p.x), toPx(p.z), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // mission target (pulsing)
  const m = G.missions[G.missionIdx];
  if (m) {
    const t = m.target(G);
    if (t) {
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffc832';
      ctx.beginPath();
      ctx.arc(toPx(t.x), toPx(t.z), pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // traffic
  ctx.fillStyle = '#e8c832';
  for (const t of G.traffic) {
    ctx.beginPath();
    ctx.arc(toPx(t.mesh.position.x), toPx(t.mesh.position.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // police
  for (const c of G.cops) {
    ctx.fillStyle = '#3a6fd8';
    ctx.beginPath();
    ctx.arc(toPx(c.mesh.position.x), toPx(c.mesh.position.z), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of G.policeCars) {
    ctx.fillStyle = (Math.floor(performance.now() / 250) % 2 === 0) ? '#ff4040' : '#3a6fd8';
    ctx.beginPath();
    ctx.arc(toPx(c.mesh.position.x), toPx(c.mesh.position.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (G.heli) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(toPx(G.heli.mesh.position.x), toPx(G.heli.mesh.position.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // player arrow
  const px = toPx(G.playerPos.x);
  const pz = toPx(G.playerPos.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(G.playerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
