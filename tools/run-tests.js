#!/usr/bin/env node
/*
 * Runner de la suite headless. Résout le binaire Chromium via Playwright (plus
 * besoin de connaître CHROMIUM_PATH), exécute chaque tests/*.test.js — ou un seul
 * fichier passé en argument — et affiche un résumé final lisible.
 *
 * Exécution EN PARALLÈLE (pool borné) : chaque test est un process node isolé qui
 * sert le dépôt sur un PORT ÉPHÉMÈRE (tests/_serve.js → listen(0)) et lance son
 * propre Chromium → aucune collision, sûr à paralléliser. Divise d'autant le temps
 * de mur (la lenteur venait des lancements de Chromium en SÉRIE, pas du nombre de
 * tests). Réglable via TEST_CONCURRENCY ; défaut = min(cœurs, 4).
 *
 * Les suites les plus lentes partent EN PREMIER (LENTES) : le temps de mur se rapproche du minimum
 * (sinon une suite de 40 s lancée en dernier rallonge d'autant la fin).
 *
 *   npm test                           # toute la suite, en parallèle
 *   TEST_CONCURRENCY=1 npm test        # forcer le séquentiel (debug)
 *   node tools/run-tests.js tests/moteur.test.js     # un seul fichier
 *   node tools/run-tests.js "tests/t*.test.js"       # un motif (joker *)
 */
const { execFile } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// Chromium : d'abord Playwright (résout le navigateur installé par
// `npx playwright install chromium`), sinon CHROMIUM_PATH, sinon on abandonne.
let chromium = '';
try { chromium = require('playwright-core').chromium.executablePath(); } catch { /* voir repli */ }
if (!chromium || !fs.existsSync(chromium)) chromium = process.env.CHROMIUM_PATH || '';
if (!chromium || !fs.existsSync(chromium)) {
  console.error('✗ Chromium introuvable.\n  → lance une fois :  npx playwright install chromium\n  (ou exporte CHROMIUM_PATH vers un binaire Chrome/Chromium)');
  process.exit(2);
}

const testsDir = path.join(__dirname, '..', 'tests');
const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
// Suites les plus lentes (mesurées) : lancées en premier. Les autres suivent par ordre alphabétique.
const LENTES = ['tuiles', 'projets', 'tableau'];
const rang = f => { const i = LENTES.indexOf(path.basename(f, '.test.js')); return i < 0 ? LENTES.length : i; };
// Motif « tests/t*.test.js » : toutes les suites dont le nom correspond (joker *) ; sinon un seul fichier.
const parMotif = g => {
  const re = new RegExp('^' + path.basename(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return fs.readdirSync(testsDir).filter(f => re.test(f)).sort().map(f => path.join(testsDir, f));
};
let files = arg
  ? (arg.includes('*') ? parMotif(arg) : [path.resolve(arg)])
  : fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(testsDir, f));
files.sort((a, b) => rang(a) - rang(b));

const env = { ...process.env, CHROMIUM_PATH: chromium };
// Concurrence : réglable, bornée par le nombre de fichiers. Défaut = min(cœurs, 4)
// (bon compromis mémoire : chaque worker ouvre un Chromium ~150-250 Mo).
const DEFAULT_CONC = Math.min((os.cpus() || []).length || 2, 4);
const CONC = Math.max(1, Math.min(parseInt(process.env.TEST_CONCURRENCY, 10) || DEFAULT_CONC, files.length));

function runOne(f) {
  return new Promise(resolve => {
    execFile('node', [f], { env, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      resolve({ name: path.basename(f), ok: !err, out: (stdout || '') + (stderr || '') });
    });
  });
}

(async () => {
  console.log(`Chromium : ${chromium}`);
  console.log(`Parallélisme : ${CONC} · ${files.length} suite(s)` + '\n');
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const res = await runOne(files[next++]);
      if (res.ok) {
        console.log(res.name.padEnd(28) + ' ✓');
      } else {
        console.log(res.name.padEnd(28) + ' ✗ ÉCHEC');
        res.out.split('\n').filter(l => /FAIL|Error|✗/.test(l)).slice(0, 5).forEach(l => console.log('    ' + l.trim()));
        failed.push(res.name);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('\n' + (failed.length
    ? `ÉCHEC — ${failed.length}/${files.length} : ${failed.sort().join(', ')}`
    : `TOUS VERTS — ${files.length}/${files.length} suites`));
  process.exit(failed.length ? 1 : 0);
})();
