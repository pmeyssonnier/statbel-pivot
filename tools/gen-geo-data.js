#!/usr/bin/env node
/*
 * Génère vendor/geo/geo-data.js : données géographiques HORS-LIGNE de la carte à bulles de l'outil pivot
 * (fonds de carte du monde et détail Benelux/France/Allemagne, pays avec noms fr/nl/en/de, communes belges avec
 * code NIS, provinces / régions / arrondissements belges, grandes villes du monde).
 *
 * Sources (à installer hors du dépôt, dans un dossier temporaire) :
 *   npm i --no-save world-atlas topojson-client i18n-iso-countries all-the-cities
 *   - world-atlas (ISC) : Natural Earth, domaine public — contours des pays (110m monde, 10m détail)
 *   - i18n-iso-countries (MIT) : noms de pays fr / nl / en / de, codes ISO
 *   - all-the-cities (ISC) : extrait GeoNames, licence CC BY 4.0 (attribution : « Lieux : GeoNames »)
 * Usage :  node tools/gen-geo-data.js <dossier-contenant-node_modules>
 * Le fichier généré est versionné ; ce script n'est pas exécuté par l'application.
 */
'use strict';
const fs = require('fs'), path = require('path');
const base = path.resolve(process.argv[2] || '.');
const req = m => require(require.resolve(m, { paths: [base] }));
const topo = req('topojson-client'), I18N = req('i18n-iso-countries'), cities = req('all-the-cities');
['en', 'fr', 'nl', 'de'].forEach(l => I18N.registerLocale(req('i18n-iso-countries/langs/' + l + '.json')));
const w110 = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-110m.json', { paths: [base] }), 'utf8'));
const w10 = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-10m.json', { paths: [base] }), 'utf8'));

const r2 = x => Math.round(x * 100) / 100;
const ringArea = r => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return a / 2; };
const ringCentroid = r => { let a = 0, cx = 0, cy = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n], f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; } a *= 3; return a ? [cx / a, cy / a] : r[0]; };
const polysOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
// Douglas-Peucker (tolérance en degrés)
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const f = pts[0], l = pts[pts.length - 1];
  if (f[0] === l[0] && f[1] === l[1]) {   // anneau fermé : coupé au point le plus éloigné du départ
    let m = 1, dm = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - f[0], pts[i][1] - f[1]); if (d > dm) { dm = d; m = i; } }
    const a = simplifyOpen(pts.slice(0, m + 1), tol), b = simplifyOpen(pts.slice(m), tol);
    return a.concat(b.slice(1));
  }
  return simplifyOpen(pts, tol);
}
function simplifyOpen(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let dmax = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / len; if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > tol && idx > 0) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// découpe d'un anneau par un rectangle (Sutherland–Hodgman)
function clip(ring, [x0, y0, x1, y1]) {
  const edges = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let out = ring;
  for (const [inside, inter] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(inter(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
const flat = (ring, d) => { const o = []; ring.forEach(p => { o.push(+p[0].toFixed(d), +p[1].toFixed(d)); }); return o; };

/* ---------- pays : contours 110m + noms + centroïde ---------- */
const fc110 = topo.feature(w110, w110.objects.countries);
const nameOf = (a2, l) => I18N.getName(a2, l) || '';
const countries = [], seenA2 = new Set(), world = [];
fc110.features.forEach(f => {
  const num = String(f.id).padStart(3, '0'), a2 = I18N.numericToAlpha2(num);
  const polys = polysOf(f.geometry).map(p => p.map(r => simplify(r, 0.05))).filter(p => p[0] && p[0].length >= 4);
  if (!polys.length) return;
  let big = null, bigA = -1; polys.forEach(p => { const a = Math.abs(ringArea(p[0])); if (a > bigA) { bigA = a; big = p[0]; } });
  const c = ringCentroid(big);
  world.push([a2 || num, polys.map(p => p.map(r => flat(r, 1)))]);
  if (a2) { seenA2.add(a2); countries.push([a2, I18N.alpha2ToAlpha3(a2), nameOf(a2, 'en'), nameOf(a2, 'fr'), nameOf(a2, 'nl'), nameOf(a2, 'de'), r2(c[1]), r2(c[0])]); }
});
// petits États absents du 110m : centroïde = ville la plus peuplée du pays
const byCountry = new Map(); cities.forEach(c => { const l = byCountry.get(c.country); if (!l || c.population > l.population) byCountry.set(c.country, c); });
Object.keys(I18N.getAlpha2Codes()).forEach(a2 => {
  if (seenA2.has(a2)) return;
  const c = byCountry.get(a2); if (!c) return;
  countries.push([a2, I18N.alpha2ToAlpha3(a2), nameOf(a2, 'en'), nameOf(a2, 'fr'), nameOf(a2, 'nl'), nameOf(a2, 'de'), r2(c.loc.coordinates[1]), r2(c.loc.coordinates[0])]);
});

/* ---------- détail Benelux / France / Allemagne (10m, découpé et simplifié) ---------- */
const BOX = [-3.5, 47.0, 10.5, 54.8];   // Europe du Nord-Ouest
const detail = [];
topo.feature(w10, w10.objects.countries).features.forEach(f => {
  const a2 = I18N.numericToAlpha2(String(f.id).padStart(3, '0'));
  if (!['BE', 'NL', 'FR', 'LU', 'DE', 'GB'].includes(a2)) return;
  const polys = [];
  polysOf(f.geometry).forEach(p => {
    const ring = clip(p[0], BOX); if (ring.length < 4) return;
    const s = simplify(ring, a2 === 'BE' ? 0.004 : a2 === 'NL' || a2 === 'LU' ? 0.012 : 0.03); if (s.length >= 4 && Math.abs(ringArea(s)) > 0.002) polys.push([flat(s, 2)]);
  });
  if (polys.length) detail.push([a2, polys]);
});

/* ---------- lieux : communes belges (code NIS) + grandes villes du monde ---------- */
const be = cities.filter(c => c.country === 'BE');
const places = []; // [nom, pays, lat, lon, population, nis]
be.forEach(c => places.push([c.name, 'BE', r2(c.loc.coordinates[1]), r2(c.loc.coordinates[0]), c.population, c.muniSub || '']));
cities.filter(c => c.country !== 'BE' && c.population >= 150000).forEach(c => places.push([c.name, c.country, r2(c.loc.coordinates[1]), r2(c.loc.coordinates[0]), c.population, '']));

/* ---------- arrondissements, provinces, régions belges (centroïdes = moyenne des communes) ---------- */
const ARR = { 11: 'Antwerpen|Anvers', 12: 'Mechelen|Malines', 13: 'Turnhout', 21: 'Brussel-Hoofdstad|Bruxelles-Capitale', 23: 'Halle-Vilvoorde|Hal-Vilvorde', 24: 'Leuven|Louvain', 25: 'Nivelles|Nijvel', 31: 'Brugge|Bruges', 32: 'Diksmuide|Dixmude', 33: 'Ieper|Ypres', 34: 'Kortrijk|Courtrai', 35: 'Oostende|Ostende', 36: 'Roeselare|Roulers', 37: 'Tielt|Thielt', 38: 'Veurne|Furnes', 41: 'Aalst|Alost', 42: 'Dendermonde|Termonde', 43: 'Eeklo', 44: 'Gent|Gand', 45: 'Oudenaarde|Audenarde', 46: 'Sint-Niklaas|Saint-Nicolas', 51: 'Ath|Aat', 52: 'Charleroi', 53: 'Mons|Bergen', 55: 'Soignies|Zinnik', 56: 'Thuin|Thuin', 57: 'Tournai|Doornik', 58: 'Mouscron|Moeskroen', 61: 'Huy|Hoei', 62: 'Liège|Luik', 63: 'Verviers', 64: 'Waremme|Borgworm', 71: 'Hasselt', 72: 'Maaseik', 73: 'Tongeren|Tongres', 81: 'Arlon|Aarlen', 82: 'Bastogne|Bastenaken', 83: 'Marche-en-Famenne', 84: 'Neufchâteau', 85: 'Virton', 91: 'Dinant', 92: 'Namur|Namen', 93: 'Philippeville' };
const PROV = { 10: 'Antwerpen|Anvers|Antwerp', 20: 'Vlaams-Brabant|Brabant flamand|Flemish Brabant', 25: 'Waals-Brabant|Brabant wallon|Walloon Brabant', 30: 'West-Vlaanderen|Flandre occidentale|West Flanders', 40: 'Oost-Vlaanderen|Flandre orientale|East Flanders', 50: 'Henegouwen|Hainaut|Hainaut', 60: 'Luik|Liège|Liège', 70: 'Limburg|Limbourg|Limburg', 80: 'Luxemburg|Luxembourg|Luxembourg', 90: 'Namen|Namur|Namur', 21: 'Brussels Hoofdstedelijk Gewest|Région de Bruxelles-Capitale|Brussels Capital Region' };
const provOfArr = a => (a === 21 ? 21 : a === 25 ? 25 : a >= 11 && a <= 13 ? 10 : a === 23 || a === 24 ? 20 : Math.floor(a / 10) * 10);
const regOfProv = p => (p === 21 ? 'BRU' : (p === 25 || p === 50 || p === 60 || p === 80 || p === 90) ? 'WAL' : 'VLG');
const mean = (arr, i) => arr.reduce((s, x) => s + x[i], 0) / arr.length;
const groups = { arr: {}, prov: {}, reg: {} };
be.filter(c => c.muni && c.muniSub).forEach(c => {
  const a = +c.muni, p = provOfArr(a), g = regOfProv(p), pt = [c.loc.coordinates[1], c.loc.coordinates[0]];
  (groups.arr[a] = groups.arr[a] || []).push(pt); (groups.prov[p] = groups.prov[p] || []).push(pt); (groups.reg[g] = groups.reg[g] || []).push(pt);
});
const mk = (obj, names) => Object.keys(obj).filter(k => names[k] !== undefined).map(k => [String(k), names[k], r2(mean(obj[k], 0)), r2(mean(obj[k], 1))]);
const REG = { VLG: 'Vlaams Gewest|Région flamande|Flemish Region|Vlaanderen|Flandre|Flanders', WAL: 'Waals Gewest|Région wallonne|Walloon Region|Wallonië|Wallonie|Wallonia', BRU: 'Brussels Hoofdstedelijk Gewest|Région de Bruxelles-Capitale|Brussels-Capital Region' };
const belgium = { arr: mk(groups.arr, ARR), prov: mk(groups.prov, PROV), reg: mk(groups.reg, REG) };

const data = { v: 1, box: BOX, attribution: 'Fonds : Natural Earth · Lieux : GeoNames (CC BY 4.0)', countries, world, detail, places, belgium };
const outDir = path.join(__dirname, '..', 'vendor', 'geo');
fs.mkdirSync(outDir, { recursive: true });
const json = JSON.stringify(data);
fs.writeFileSync(path.join(outDir, 'geo-data.js'), '/* Données géographiques hors-ligne (carte à bulles de l\'outil pivot) — généré par tools/gen-geo-data.js ; voir vendor/geo/README.md */\n(function (r) { r.PIVOT_GEO_DATA = ' + json + '; if (typeof module !== \'undefined\' && module.exports) module.exports = r.PIVOT_GEO_DATA; })(typeof globalThis !== \'undefined\' ? globalThis : window);\n');
console.log('pays', countries.length, 'monde', world.length, 'détail', detail.length, 'lieux', places.length, 'octets', json.length);
