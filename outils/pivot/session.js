/* Mémorisation de la session du tableau croisé (fichiers chargés + sélections) pour survivre à
 * une actualisation de la page. IndexedDB et non localStorage : un classeur dépasse vite les ~5 Mo
 * de localStorage, et IndexedDB stocke les tableaux tels quels (dates comprises).
 * Tout reste dans le navigateur de l'appareil (aucun envoi) ; l'utilisateur peut désactiver la
 * mémorisation et effacer la session (voir app.js).
 * Deux enregistrements : « data » (lignes des fichiers, écrit seulement quand la liste des fichiers
 * change) et « state » (sélections, petit, écrit à chaque changement).
 * Exposé : globalThis.PivotSession / module.exports (les parties pures sont testables sous Node). */
(function (root) {
  'use strict';
  const DB = 'statbel-pivot', STORE = 'kv', MAX_SOURCES = 200, MAX_ROWS = 2000000, MAX_VIEWS = 12, MAX_PROJECTS = 50;
  const ID = /^s\d{1,6}$/, OVER_KEY = /^[sj]\d{1,6}\|\d{1,5}$/;

  /* ---------- parties pures : validation de ce qui est relu du stockage ---------- */
  const text = (s, max) => (typeof s === 'string' && s.length <= max ? s : null);

  // Graphique d'une vue : forme minimale validée ici ; la normalisation complète (types connus, options) se fait à l'usage (PivotChart.normChart)
  function sanitizeChart(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v < hi ? v : d), o = {};
    if (c.o && typeof c.o === 'object' && !Array.isArray(c.o)) {
      Object.keys(c.o).slice(0, 60).forEach(k => { const x = c.o[k]; if (/^[A-Za-z0-9]{1,20}$/.test(k) && (x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length <= 200))) o[k] = x; });
    }
    return { type: typeof c.type === 'string' && /^[a-z0-9]{1,20}$/.test(c.type) ? c.type : 'none', k: int(c.k, 0, 20, 0), k2: int(c.k2, -1, 20, -1), gmax: Number.isFinite(c.gmax) && c.gmax > 0 ? c.gmax : 0, pos: ['top', 'bottom', 'left', 'right'].includes(c.pos) ? c.pos : 'top', o };
  }

  // Cube de données : { chart: clé du champ du graphique par défaut, filters: clés des champs de filtrage (≤ 5) }
  // Ancien mode de tuile « graphique + tableau » (tile 'both') : une tuile ne contient plus que l'un OU l'autre → elle devient deux tuiles
  // consécutives (graphique, puis tableau avec les mêmes champs), dans la limite MAX_VIEWS. Modifie `views` sur place ; renvoie l'index de la vue courante recalculé.
  function splitBoth(views, cur) {
    const out = [], first = []; let room = MAX_VIEWS - views.length;
    views.forEach(v => {
      first.push(out.length);
      if (v.tile !== 'both') { out.push(v); return; }
      out.push(Object.assign({}, v, { tile: 'chart' }));
      if (room > 0) { room--; const c = JSON.parse(JSON.stringify(v)); c.tile = 'table'; c.name = v.name.slice(0, 50) + ' (tableau)'; out.push(c); }
    });
    views.length = 0; out.forEach(v => views.push(v));
    return first[cur] || 0;
  }

  // Hiérarchies du projet (hier.js) : [{ name, levels:[clé…] }]
  const sanitizeHier = h => (root.PivotHier || require('./hier.js')).sanitize(h);
  function sanitizeCube(c) {
    const key = k => typeof k === 'string' && k.length > 0 && k.length <= 200;
    c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    return { chart: key(c.chart) ? c.chart : '', filters: Array.isArray(c.filters) ? [...new Set(c.filters.filter(key))].slice(0, 5) : [] };
  }

  // Sélecteurs d'une vue : [{ key, val }] (champ + valeur choisie, '' = toutes) ; au plus 5, textes bornés
  function sanitizeSel(a) {
    if (!Array.isArray(a)) return [];
    const seen = new Set(), out = [];
    a.forEach(s => { if (out.length < 5 && s && typeof s === 'object' && typeof s.key === 'string' && s.key.length > 0 && s.key.length <= 200 && !seen.has(s.key)) { seen.add(s.key); out.push({ key: s.key, val: typeof s.val === 'string' && s.val.length <= 200 ? s.val : '' }); } });
    return out;
  }

  // state = { v:1, sources:[{id,headerRow,use}], over:{'s1|0':'nom'}, layout:{…} } → nettoyé, ou null
  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.sources)) return null;
    const sources = raw.sources.slice(0, MAX_SOURCES).map(s => (s && typeof s === 'object' && typeof s.id === 'string' && ID.test(s.id)
      ? { id: s.id, headerRow: Number.isInteger(s.headerRow) && s.headerRow >= 0 && s.headerRow < MAX_ROWS ? s.headerRow : 0, use: s.use !== false } : null)).filter(Boolean);
    const over = Object.create(null);
    if (raw.over && typeof raw.over === 'object') {
      Object.keys(raw.over).slice(0, 5000).forEach(k => { if (OVER_KEY.test(k) && text(raw.over[k], 200) !== null) over[k] = raw.over[k]; });
    }
    // vues (onglets) : nom + disposition + réglage du graphique ; la validation fine se fait à l'application
    const views = (Array.isArray(raw.views) ? raw.views : []).slice(0, MAX_VIEWS).map(v => (v && typeof v === 'object' && text(v.name, 60) !== null && v.layout && typeof v.layout === 'object'
      ? { name: v.name, layout: v.layout, chart: sanitizeChart(v.chart), sel: sanitizeSel(v.sel), ng: v.ng === true, tile: ['auto', 'chart', 'both', 'table', 'hide'].includes(v.tile) ? v.tile : 'auto', span: [1, 2, 3].includes(v.span) ? v.span : 1, h: [1, 2, 3].includes(v.h) ? v.h : 2 } : null)).filter(Boolean);
    const dash = { on: !!(raw.dash && raw.dash.on === true), cols: raw.dash && [0, 1, 2, 3].includes(raw.dash.cols) ? raw.dash.cols : 0, sel: sanitizeSel(raw.dash && raw.dash.sel) };
    const cube = sanitizeCube(raw.cube), hier = sanitizeHier(raw.hier);
    let cur = Number.isInteger(raw.cur) && raw.cur >= 0 && raw.cur < views.length ? raw.cur : 0;
    cur = splitBoth(views, cur);
    return { v: 1, savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : 0, sources, over, layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : null, views, cur, dash, cube, hier, joins: Array.isArray(raw.joins) ? raw.joins.slice(0, 20) : [], calcs: Array.isArray(raw.calcs) ? raw.calcs.slice(0, 50) : null, groups: Array.isArray(raw.groups) ? raw.groups.slice(0, 30) : [], measures: Array.isArray(raw.measures) ? raw.measures.slice(0, 40) : [] };
  }

  // index des projets : { v:1, cur, n, list:[{ id, name, created, updated, files, rows }] } → nettoyé, ou null
  function sanitizeIndex(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.list)) return null;
    const seen = new Set(), list = [], num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
    raw.list.slice(0, MAX_PROJECTS).forEach(p => {
      if (!p || typeof p.id !== 'string' || !/^p\d{1,5}$/.test(p.id) || seen.has(p.id)) return;
      const name = text(p.name, 60);
      if (name === null) return;
      seen.add(p.id);
      list.push({ id: p.id, name, created: num(p.created), updated: num(p.updated), files: num(p.files), rows: num(p.rows) });
    });
    if (!list.length) return null;
    return { v: 1, cur: list.some(p => p.id === raw.cur) ? raw.cur : list[0].id, n: Math.max(num(raw.n), ...list.map(p => +p.id.slice(1))), list };
  }

  // data = { v:1, sources:{ id:{file,sheet,label,aoa} } } + état nettoyé → sources prêtes pour l'outil (celles dont les données manquent sont écartées)
  function assemble(data, state) {
    if (!data || typeof data !== 'object' || data.v !== 1 || !data.sources || typeof data.sources !== 'object' || !state) return [];
    return state.sources.map(s => {
      const d = Object.prototype.hasOwnProperty.call(data.sources, s.id) ? data.sources[s.id] : null;
      if (!d || !Array.isArray(d.aoa) || d.aoa.length > MAX_ROWS || !d.aoa.every(r => Array.isArray(r))) return null;
      const file = text(d.file, 300), sheet = text(d.sheet, 300), label = text(d.label, 600);
      if (file === null || sheet === null || label === null) return null;
      const out = { id: s.id, file, sheet, label, aoa: d.aoa, headerRow: Math.min(s.headerRow, Math.max(0, d.aoa.length - 1)), use: s.use };
      // lien vers le fichier d'origine (poignée Chrome/Edge) : accepté seulement s'il en a bien la forme
      if (d.handle && typeof d.handle === 'object' && d.handle.kind === 'file' && typeof d.handle.getFile === 'function') out.handle = d.handle;
      if (Number.isFinite(d.mtime)) out.mtime = d.mtime;
      return out;
    }).filter(Boolean);
  }

  /* ---------- IndexedDB (navigateur) ---------- */
  function create(idb) {
    const available = () => !!idb;
    const open = () => new Promise((res, rej) => {
      let r;
      try { r = idb.open(DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('IndexedDB indisponible'));
      r.onblocked = () => rej(new Error('IndexedDB bloquée'));
    });
    // fn(store) renvoie une requête (ou rien) ; la promesse se résout à la fin de la transaction
    function run(mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        let req;
        try {
          const t = db.transaction(STORE, mode);
          req = fn(t.objectStore(STORE));
          t.oncomplete = () => { db.close(); res(req && 'result' in req ? req.result : undefined); };
          t.onerror = () => { db.close(); rej(t.error || new Error('transaction refusée')); };
          t.onabort = () => { db.close(); rej(t.error || new Error('espace de stockage insuffisant')); };
        } catch (e) { db.close(); rej(e); }
      }));
    }
    return {
      available,
      load: key => (available() ? run('readonly', s => s.get(key)).catch(() => undefined) : Promise.resolve(undefined)),
      save: (key, value) => run('readwrite', s => s.put(value, key)),
      del: key => (available() ? run('readwrite', s => s.delete(key)).catch(() => undefined) : Promise.resolve()),
      clear: () => (available() ? run('readwrite', s => s.clear()).catch(() => undefined) : Promise.resolve())
    };
  }

  const api = { create, sanitizeState, sanitizeChart, sanitizeSel, sanitizeCube, sanitizeHier, splitBoth, sanitizeIndex, assemble, MAX_SOURCES, MAX_ROWS, MAX_VIEWS, MAX_PROJECTS };
  root.PivotSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
