// NEON HARBOR — entrypoint for the gta6-01 bounty.
//
// Copies game/ and screenshots/ from this repository into the output
// directory, then writes /output/dossier.json with buildDossier from the
// kit's vendor/makefun-game.ts (copied unchanged from the kit).
// Runs on Node 22 with the standard library only; no network access.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Competition caps (from the kit's RULES.txt): dossier text at most
// 163,840 UTF-8 bytes; at most 4 screenshots of at most 256 KiB each;
// game/ at most 993 entries and 48 MiB; paths at most 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), {
  recursive: true,
});

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier written: ${dossier.length} bytes -> ${join(outDir, 'dossier.json')}`);
