[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/FadliAR/gta6-01-harbor-city-2/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/FadliAR/gta6-01-harbor-city-2/reward.svg)](https://make.fun/bounty/gta6-01)

# NEON HARBOR

An open-world crime sandbox built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — a fictional neon coastal city you can explore on foot or behind the wheel of any car you steal.

## The city

- **7×7 street grid** (seed 1337, fully deterministic) with a central plaza and the
  **78 m Harbor Spire**, downtown towers with setbacks, roof props and neon signs,
  a marina with docks, a walkable pier, boats, and water along the south edge.
- **Dusk lighting** — emissive windows, neon signage, street lamps, stars.
- **Traffic AI** — 14 cars driving the grid, turning at intersections, stopping
  behind each other. **24 pedestrians** with walk / idle / flee behavior.

## The game

- **On foot + driving**: WASD + mouse look, jump. Walk up to any parked car and
  press **E** to steal it; arcade handling, collisions with buildings, cars and
  pedestrians.
- **Wanted 0–5★**: stealing cars, hitting pedestrians or cars raises the heat.
  Foot cops chase you on foot, police cars chase you while driving, and a
  **police helicopter with a searchlight joins at ★★★★**. Get caught and it's
  BUSTED; heat decays when you lay low.
- **6 chained missions**: steal your first wheels, pick up a package at the
  marina, a timed cross-town delivery, steal the gold coupe for the garage,
  lose the heat and meet the crew at the pier, then a 3-checkpoint grand finale.
  On-screen objectives, beacon markers, timers, rewards — and an
  all-missions-complete screen.
- **10 cash pickups** scattered around the city, counted in the HUD.
- **HUD + minimap**: health, cash, wanted stars, mission objective, speedometer,
  live top-down minimap (player, traffic, police, helicopter, mission marker).
- **Synthesized audio only** (WebAudio, no audio files): engine hum, siren,
  pickup chime, mission jingle — plus an **in-game radio with 3 stations**
  (NEON FM, HARBOR ROCK, NIGHT DRIVE) while driving.
- **Save / continue** via localStorage (cash, missions, pickups) with a Continue
  button on the title screen.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Look around |
| Space | Jump |
| E | Steal / exit car |
| Shift | Sprint |
| R / N | Radio on-off / next station |
| M | Mute |
| Esc / P | Pause |

## Play it

Open `game/index.html` in desktop Chrome (or serve the `game/` folder with any
static server). No network needed — everything, including three.js, is vendored
under `game/vendor/`.

## Tech

- three.js r160 (vendored module build), plain ES modules, no build step.
- Source split by job: `city.js`, `vehicles.js`, `pedestrians.js`, `police.js`,
  `missions.js`, `audio.js`, `ui.js`, `main.js` (+ `rng.js` seeded RNG).
- Screenshots: `screenshots/` — 4 renders of the game (city vista, driving,
  helicopter chase, dusk street).

## License

MIT — see `LICENSE`.
