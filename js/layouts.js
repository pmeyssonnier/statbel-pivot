/* Dispositions enregistrées du tableau croisé : sérialisation, validation (fichier importé = non fiable),
 * application sur le catalogue de champs courant, et stockage local (localStorage injectable).
 * Une disposition ne contient que des noms de champs, des agrégats, des réglages d'affichage et les
 * libellés exclus des filtres — jamais les lignes de données. Pur (aucun DOM) : testable sous Node.
 * Exposé : globalThis.PivotLayouts / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;
  const PF = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : root.PivotFormat;

  const STORE = 'statbel_pivot_layouts', MAX_LAYOUTS = 50, MAX_NAME = 60;
  const AGG = Object.keys(E.AGG_LABELS), FMT = Object.keys(PF.FORMATS), CF = Object.keys(PF.CF_MODES);
  const ENUM = { mode: ['pivot', 'list'], topMode: ['top', 'flop'], style: ['standard', 'bandes', 'sobre', 'statbel', 'sombre'], density: ['compact', 'normal', 'aere'], colw: ['n', 'auto', 'l'], cf: CF, cfOp: ['>', '<', '>=', '<=', '='], dec: ['auto', '0', '1', '2', '3'], capH: ['left', 'center', 'right'], capV: ['top', 'bottom'] };
  const BOOL = ['rowTot', 'colTot', 'subTot', 'freeze', 'wrap', 'topOthers'];
  const INT = { topN: 500, topK: 19 };   // entiers bornés (0..max)
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const str = (s, max) => (typeof s === 'string' && s.length > 0 && s.length <= max && !BAD.has(s) ? s : null);

  // Nom personnalisé d'une valeur : texte brut, sans caractères de contrôle, 80 caractères max
  const cleanLabel = s => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '');

  const cleanKeys = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 200 && !BAD.has(x)).slice(0, 60) : []);

  // Règles de filtre (texte, plage, top) venues de l'interface, d'un stockage ou d'un fichier : nettoyées, bornées
  const TEXT_OPS = ['contains', 'notcontains', 'starts', 'ends', 'equals'], TOP_AGG = ['sum', 'avg', 'count', 'max', 'min'], DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function cleanRules(raw) {
    const out = Object.create(null);
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).slice(0, 50).forEach(k => {
      const r = raw[k], key = str(k, 200);
      if (!key || !r || typeof r !== 'object') return;
      const c = {};
      if (r.text && typeof r.text === 'object' && TEXT_OPS.includes(r.text.op) && typeof r.text.q === 'string' && r.text.q.trim() && r.text.q.length <= 200) c.text = { op: r.text.op, q: r.text.q.trim() };
      if (r.range && typeof r.range === 'object') {
        const g = v => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && DATE_RE.test(v) ? v : undefined));
        const rg = {}, a = g(r.range.min), b = g(r.range.max);
        if (a !== undefined) rg.min = a;
        if (b !== undefined && (a === undefined || typeof a === typeof b)) rg.max = b;   // min et max de même nature (nombres ou dates)
        if (rg.min !== undefined || rg.max !== undefined) c.range = rg;
      }
      if (r.top && typeof r.top === 'object' && Number.isInteger(r.top.n) && r.top.n >= 1 && r.top.n <= 1000 && str(r.top.by, 200)) {
        c.top = { n: r.top.n, mode: r.top.mode === 'flop' ? 'flop' : 'top', by: r.top.by, agg: TOP_AGG.includes(r.top.agg) ? r.top.agg : 'sum' };
      }
      if (c.text || c.range || c.top) out[key] = c;
    });
    return out;
  }

  function serialize(L, o) {
    const filters = {};
    Object.keys(L.filters || {}).forEach(k => { const ex = L.filters[k]; if (ex && ex.size) filters[k] = [...ex]; });
    const rules = JSON.parse(JSON.stringify(cleanRules(L.rules)));
    const opts = {};
    BOOL.forEach(k => { opts[k] = !!o[k]; });
    Object.keys(ENUM).forEach(k => { if (o[k] !== undefined) opts[k] = String(o[k]); });
    opts.cfVal = String(o.cfVal == null ? '' : o.cfVal); opts.cap = typeof o.cap === 'string' ? o.cap.slice(0, 120) : '';
    Object.keys(INT).forEach(k => { const n = Math.floor(+o[k]); opts[k] = n >= 0 && n <= INT[k] ? n : 0; });
    opts.listCols = cleanKeys(o.listCols); if (o.listSort && typeof o.listSort.key === 'string') opts.listSort = { key: o.listSort.key.slice(0, 200), dir: o.listSort.dir === -1 ? -1 : 1 };
    return { v: 1, rows: L.rows.slice(), cols: L.cols.slice(), vals: L.vals.map(x => { const o = { key: x.key, agg: x.agg, fmt: x.fmt || 'auto' }; const n = cleanLabel(x.name); if (n) o.name = n; return o; }), filters, rules, rowDir: Object.assign({}, L.rowDir || {}), sort: L.sort ? { col: L.sort.col, k: L.sort.k, dir: L.sort.dir } : null, opts };
  }

  // Nettoie une disposition venue d'ailleurs (fichier .json, stockage corrompu) : null si inutilisable.
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    const keys = a => (Array.isArray(a) ? a.map(x => str(x, 200)).filter(Boolean).slice(0, 50) : []);
    const vals = (Array.isArray(raw.vals) ? raw.vals : []).slice(0, 20).map(x => {
      const key = x && str(x.key, 200);
      if (!key) return null;
      const o = { key, agg: AGG.includes(x.agg) ? x.agg : 'sum', fmt: FMT.includes(x.fmt) ? x.fmt : 'auto' }, n = cleanLabel(x.name);
      if (n) o.name = n;
      return o;
    }).filter(Boolean);
    const filters = Object.create(null);
    if (raw.filters && typeof raw.filters === 'object') {
      Object.keys(raw.filters).slice(0, 50).forEach(k => {
        if (!str(k, 200) || !Array.isArray(raw.filters[k])) return;
        filters[k] = raw.filters[k].filter(x => typeof x === 'string' && x.length <= 300).slice(0, 20000);
      });
    }
    const rowDir = Object.create(null);
    if (raw.rowDir && typeof raw.rowDir === 'object') Object.keys(raw.rowDir).slice(0, 50).forEach(k => { if (str(k, 200) && raw.rowDir[k] === -1) rowDir[k] = -1; });
    const S = raw.sort;
    const sort = S && typeof S === 'object' && typeof S.col === 'string' && S.col.length <= 200 && !BAD.has(S.col) && Number.isInteger(S.k) && S.k >= 0 && S.k < 20 && (S.dir === 1 || S.dir === -1) ? { col: S.col, k: S.k, dir: S.dir } : null;
    const opts = {}, ro = raw.opts && typeof raw.opts === 'object' ? raw.opts : {};
    BOOL.forEach(k => { if (typeof ro[k] === 'boolean') opts[k] = ro[k]; });
    Object.keys(ENUM).forEach(k => { if (ENUM[k].includes(String(ro[k]))) opts[k] = String(ro[k]); });
    if (typeof ro.cfVal === 'string' && ro.cfVal.length <= 30) opts.cfVal = ro.cfVal;
    if (typeof ro.cap === 'string') opts.cap = ro.cap.slice(0, 120);
    Object.keys(INT).forEach(k => { if (Number.isInteger(ro[k]) && ro[k] >= 0 && ro[k] <= INT[k]) opts[k] = ro[k]; });
    opts.listCols = cleanKeys(ro.listCols); if (ro.listSort && typeof ro.listSort.key === 'string' && ro.listSort.key.length <= 200 && !BAD.has(ro.listSort.key)) opts.listSort = { key: ro.listSort.key, dir: ro.listSort.dir === -1 ? -1 : 1 };
    return { v: 1, rows: keys(raw.rows), cols: keys(raw.cols), vals, filters, rules: cleanRules(raw.rules), rowDir, sort, opts };
  }

  // Retire un champ (clé) d'une disposition : zones, filtres, règles, sens de tri. Sert à la suppression d'un groupe / d'une mesure :
  // son identifiant pouvant être réattribué plus tard, il ne doit subsister dans AUCUNE vue (sinon un nouveau champ retrouverait d'anciens emplacements).
  function dropKey(L, key) {
    if (!L || typeof L !== 'object') return L;
    const had = (L.rows || []).includes(key) || (L.cols || []).includes(key) || (L.vals || []).some(v => v.key === key);
    if (Array.isArray(L.rows)) L.rows = L.rows.filter(k => k !== key);
    if (Array.isArray(L.cols)) L.cols = L.cols.filter(k => k !== key);
    if (Array.isArray(L.vals)) L.vals = L.vals.filter(v => v.key !== key);
    ['filters', 'rules', 'rowDir'].forEach(m => { if (L[m] && typeof L[m] === 'object') delete L[m][key]; });
    if (had) L.sort = null;   // le tri s'exprime en positions de colonnes / valeurs : plus fiable une fois la zone modifiée
    return L;
  }

  // Applique une disposition (nettoyée) au catalogue courant : renvoie { L, o, missing } ; les champs absents sont ignorés.
  function apply(lay, catKeys) {
    const has = new Set(catKeys), missing = [];
    const keep = k => { if (has.has(k)) return true; if (!missing.includes(k)) missing.push(k); return false; };
    const L = { rows: lay.rows.filter(keep), cols: lay.cols.filter(keep), vals: lay.vals.filter(x => keep(x.key)).map(x => ({ key: x.key, agg: x.agg, fmt: x.fmt === 'auto' ? undefined : x.fmt, name: x.name })), filters: {}, rowDir: {}, sort: lay.sort };
    Object.keys(lay.filters).forEach(k => { if (has.has(k)) L.filters[k] = new Set(lay.filters[k]); else if (!missing.includes(k)) missing.push(k); });
    L.rules = {};
    Object.keys(lay.rules || {}).forEach(k => { if (!has.has(k)) { if (!missing.includes(k)) missing.push(k); return; } const r = JSON.parse(JSON.stringify(lay.rules[k])); if (r.top && !has.has(r.top.by)) delete r.top; if (r.text || r.range || r.top) L.rules[k] = r; });
    Object.keys(lay.rowDir).forEach(k => { if (has.has(k)) L.rowDir[k] = -1; });
    const dup = L.rows.filter(k => L.cols.includes(k));   // un champ ne peut pas être en lignes ET en colonnes
    if (dup.length) L.cols = L.cols.filter(k => !dup.includes(k));
    return { L, o: Object.assign({}, lay.opts), missing };
  }

  /* ---------- stockage (storage = localStorage ou équivalent) ---------- */
  function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_NAME); }
  function loadAll(storage) {
    const out = {};
    try {
      const all = JSON.parse(storage.getItem(STORE) || '{}') || {};
      Object.keys(all).forEach(n => { const lay = !BAD.has(n) && sanitize(all[n]); if (lay) out[n] = lay; });
    } catch (e) { /* stockage absent ou corrompu : liste vide */ }
    return out;
  }
  function persist(storage, all) {
    try { storage.setItem(STORE, JSON.stringify(all)); return true; } catch (e) { return false; }
  }
  // Enregistre (ou remplace) : { ok, replaced, error }
  function save(storage, name, lay) {
    name = cleanName(name);
    if (!name || BAD.has(name)) return { ok: false, error: 'Donnez un nom à la disposition.' };
    const all = loadAll(storage), replaced = Object.prototype.hasOwnProperty.call(all, name);
    if (!replaced && Object.keys(all).length >= MAX_LAYOUTS) return { ok: false, error: 'Limite de ' + MAX_LAYOUTS + ' dispositions atteinte : supprimez-en une.' };
    const clean = sanitize(lay);
    if (!clean) return { ok: false, error: 'Disposition invalide.' };
    all[name] = clean;
    return persist(storage, all) ? { ok: true, replaced, name } : { ok: false, error: 'Stockage local indisponible ou plein.' };
  }
  function remove(storage, name) {
    const all = loadAll(storage);
    if (!Object.prototype.hasOwnProperty.call(all, name)) return false;
    delete all[name];
    return persist(storage, all);
  }

  const api = { cleanRules, serialize, sanitize, apply, dropKey, loadAll, save, remove, cleanName, cleanLabel, STORE, MAX_LAYOUTS };
  root.PivotLayouts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
