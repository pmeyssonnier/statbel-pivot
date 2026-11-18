/*
 * Test du site AUTONOME du pivot (build-pivot-site.js) : le dossier assemblé contient l'outil et rien des applications,
 * et la page y fonctionne depuis une racine à elle (sans le reste du dépôt) : version affichée, SheetJS chargé, aucune erreur JS.
 * (Un second projet Vercel la sert sur une autre origine que les PWA : cf. docs/ARCHITECTURE.md.)
 *
 * Lancer :  CHROMIUM_PATH=… node tests/pivot-tool-site.test.js
 */
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const { chromium } = (()=>{try{return require('playwright-core')}catch(e){return require('playwright')}})();
const { serve } = require('./_serve');

const EXEC = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';
let fails = 0;
const A = (cond, msg) => { if (!cond) { fails++; console.log('✗ FAIL ' + msg); } else console.log('✓ ' + msg); };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-site-'));
  const out = cp.execFileSync('node', [path.join(__dirname, '..', 'build-pivot-site.js'), '--out', dir], { encoding: 'utf8' });
  const ls = d => fs.readdirSync(path.join(dir, d)).sort();
  const sources = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js')).sort();
  const styles = fs.readdirSync(path.join(__dirname, '..', 'css')).filter(f => f.endsWith('.css')).sort();
  A(/Site du pivot/.test(out), 'construction : ' + out.trim());
  A(JSON.stringify(ls('js')) === JSON.stringify(sources), 'tous les modules du pivot sont copiés (' + sources.length + ')');
  A(styles.length > 0 && JSON.stringify(ls('css')) === JSON.stringify(styles), 'toutes les feuilles de style sont copiées (' + styles.join(', ') + ')');
  A(fs.existsSync(path.join(dir, 'index.html')) && fs.existsSync(path.join(dir, 'robots.txt')) && /Disallow: \//.test(fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8')), 'index.html (page de l\'outil) et robots.txt (aucune indexation)');
  A(fs.existsSync(path.join(dir, 'vendor/xlsx/xlsx.full.min.js')) && fs.existsSync(path.join(dir, 'vendor/geo/geo-data.js')), 'SheetJS et fonds de carte présents');
  const top = fs.readdirSync(dir).sort().join();
  A(top === 'css,index.html,js,robots.txt,vendor' && !fs.existsSync(path.join(dir, 'sw.js')), 'rien d\'autre que l\'outil (ni service worker, ni tests, ni documentation) : ' + top);
  // Les chemins relatifs de la page (vendor/…, css/…, js/…) existent tous dans le dossier assemblé
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:vendor|css|js)\/[^"'?+]+)"/g)].map(m => m[1]);   // le chargeur dynamique des modules est couvert par la liste ci-dessus
  A(refs.length > 0 && refs.every(r => fs.existsSync(path.join(dir, r))), 'chemins relatifs de la page résolus dans le dossier (' + refs.join(', ') + ')');

  const srv = await serve(dir);
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [], ko = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (r.status() >= 400) ko.push(r.status() + ' ' + r.url().replace(srv.url, '')); });
  await p.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await p.waitForSelector('#fileIn', { state: 'attached', timeout: 5000 });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ url: location.pathname, v: window.PIVOT_VERSION, xl: typeof window.XLSX, eng: typeof window.PivotEngine, ver: (document.querySelector('#pvVer') || {}).textContent }));
  A(r.url === '/index.html', 'index.html sert directement la page de l\'outil (' + r.url + ')');
  A(/^\d+\.\d+\.\d+$/.test(r.v) && r.ver === 'v' + r.v && r.xl === 'object' && r.eng === 'object', 'version ' + r.v + ' affichée, SheetJS et moteur chargés');
  A(ko.length === 0, 'aucune ressource en erreur (' + (ko.join(' | ') || 'ok') + ')');
  A(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close(); await srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? fails + ' échec(s)' : 'OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('pivot-site diagnostic:', e && (e.stack || e)); process.exit(1); });
