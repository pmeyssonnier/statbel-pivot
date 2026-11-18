/* Mesures du tableau croisé : indicateurs nommés, calculés ligne par ligne avec une condition (comme les mesures de
 * Power BI / Qlik), à poser dans « Valeurs » avec n'importe quel agrégat.
 *  - « count » : nombre de lignes qui respectent la condition (somme d'un indicateur 1/0), ex. « Nombre de femmes » ;
 *  - « pct »   : % de lignes qui respectent la condition (moyenne d'un indicateur 0/100 → part dans chaque cellule), ex. « % de femmes » ;
 *  - « value » : valeur d'un champ numérique, retenue seulement quand la condition est vraie, ex. « Âge des femmes » (agrégat au choix : moyenne…).
 * Condition = liste de critères (tous requis) sur n'importe quel champ : est l'une de / n'est aucune de (valeurs séparées par « ; »),
 * > ≥ < ≤ =, contient / ne contient pas. Le champ créé (clé `mes|<id>`) peut aussi servir dans une formule de champ calculé.
 * Fonctions pures + stockage local. Exposé : globalThis.PivotMeasures / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('../core/engine.js') : root.PivotEngine;
  const STORE = 'statbel_pivot_measures', MAX_DEFS = 40, MAX_NAME = 60, MAX_CONDS = 6, MAX_V = 500;
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const OPS = { in: 'est l\'une de', notin: 'n\'est aucune de', eq: '=', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contient', notcontains: 'ne contient pas' };
  const KINDS = { count: 'Nombre de lignes qui respectent la condition', pct: '% de lignes qui respectent la condition', value: 'Valeur d\'un champ numérique (si la condition est vraie)' };
  const AGGS = ['sum', 'avg', 'min', 'max'];
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const numOf = v => (typeof v === 'number' ? v : (v == null || v instanceof Date ? NaN : E.parseNumber(v)));

  function sanitizeDefs(list) {
    const out = [], names = new Set(), ids = new Set();
    (Array.isArray(list) ? list : []).slice(0, MAX_DEFS).forEach(d => {
      if (!d || typeof d !== 'object') return;
      const name = str(d.name, MAX_NAME), kind = Object.prototype.hasOwnProperty.call(KINDS, d.kind) ? d.kind : '';
      if (!name || !kind || BAD.has(name) || names.has(name.toLowerCase())) return;
      const def = { id: typeof d.id === 'string' && /^m\d{1,6}$/.test(d.id) && !ids.has(d.id) ? d.id : '', name, kind, src: '', agg: kind === 'pct' ? 'avg' : 'sum', conds: [] };
      if (kind === 'value') {
        def.src = str(d.src, 200);
        if (!def.src) return;
        def.agg = AGGS.includes(d.agg) ? d.agg : 'sum';
      }
      (Array.isArray(d.conds) ? d.conds : []).slice(0, MAX_CONDS).forEach(c => {
        if (!c || typeof c !== 'object' || !Object.prototype.hasOwnProperty.call(OPS, c.op)) return;
        const key = str(c.key, 200), v = str(typeof c.v === 'number' ? String(c.v) : c.v, MAX_V);
        if (key && v && !BAD.has(key)) def.conds.push({ key, op: c.op, v });
      });
      if (!def.id) { let k = 1; while (ids.has('m' + k)) k++; def.id = 'm' + k; }
      ids.add(def.id); names.add(name.toLowerCase());
      out.push(def);
    });
    return out;
  }

  // Champs utilisables dans une condition : tous sauf calculs et mesures ; champ source d'une valeur : numériques d'origine
  const condFields = cat => cat.filter(c => c.key !== '__rows' && !c.calc && !c.measure && !c.valueOnly);
  const valueFields = cat => cat.filter(c => c.type === 'number' && !c.derived && !c.calc && !c.measure && c.idx !== undefined);

  function checkName(name, defs, cat, editingId) {
    const n = str(name, MAX_NAME);
    if (!n) return 'Donnez un nom à la mesure.';
    if (BAD.has(n)) return 'Nom non autorisé.';
    const low = n.toLowerCase(), own = editingId ? 'mes|' + editingId : null;
    if (defs.some(d => d.id !== editingId && d.name.toLowerCase() === low)) return 'Une mesure porte déjà ce nom.';
    if (cat.some(c => c.key !== own && String(c.label).toLowerCase() === low)) return 'Un champ porte déjà ce nom : choisissez-en un autre.';
    return '';
  }

  // Test d'un critère sur une ligne ; null si le critère est inutilisable (nombre attendu non valide)
  function compileCond(c, item) {
    const terms = c.v.split(';').map(t => E.normName(t)).filter(Boolean);
    // Le test texte ne dépend que de la valeur de la cellule : résultat mémorisé par valeur distincte (la normalisation n'est plus refaite à chaque ligne)
    const byLabel = test => { const memo = new Map(); return r => { const l = item.dim(r); let h = memo.get(l); if (h === undefined) { h = test(E.normName(l)); if (memo.size >= 50000) memo.clear(); memo.set(l, h); } return h; }; };
    if (c.op === 'in' || c.op === 'notin') {
      const set = new Set(terms), neg = c.op === 'notin';
      return terms.length ? byLabel(l => set.has(l) !== neg) : null;
    }
    if (c.op === 'contains' || c.op === 'notcontains') {
      const neg = c.op === 'notcontains';
      return terms.length ? byLabel(l => terms.some(t => l.includes(t)) !== neg) : null;
    }
    const q = parseFloat(String(c.v).replace(',', '.'));
    if (!isFinite(q)) return null;
    const cmp = { eq: x => x === q, gt: x => x > q, gte: x => x >= q, lt: x => x < q, lte: x => x <= q }[c.op];
    return r => { const x = numOf(item.val(r)); return x === x && cmp(x); };
  }

  // → { items:[catalogue], errors:[{ name, error }] }
  function buildItems(defs, cat) {
    const items = [], errors = [];
    defs.forEach(d => {
      const tests = [];
      for (const c of d.conds) {
        const it = condFields(cat).find(x => x.key === c.key);
        if (!it) { errors.push({ name: d.name, error: 'Champ de la condition introuvable : « ' + c.key + ' ».' }); return; }
        const t = compileCond(c, it);
        if (!t) { errors.push({ name: d.name, error: 'Condition « ' + it.label + ' ' + OPS[c.op] + ' ' + c.v + ' » invalide (nombre ou valeur attendu).' }); return; }
        tests.push(t);
      }
      const ok = r => tests.every(t => t(r));
      let val;
      if (d.kind === 'value') {
        const src = valueFields(cat).find(x => x.key === d.src);
        if (!src) { errors.push({ name: d.name, error: 'Champ numérique source introuvable : « ' + d.src + ' ».' }); return; }
        val = r => { if (!ok(r)) return null; const x = numOf(src.val(r)); return x === x ? x : null; };
      } else if (d.kind === 'pct') val = r => (ok(r) ? 100 : 0);
      else val = r => (ok(r) ? 1 : 0);
      items.push({ key: 'mes|' + d.id, label: d.name, type: 'number', measure: true, valueOnly: true, agg0: d.agg, val, dim: () => '' });
    });
    return { items, errors };
  }

  // Valeurs distinctes proposées pour un critère (libellés de dimension, effectifs décroissants), au plus `max`
  function suggestions(rows, item, max) {
    const m = new Map();
    for (const r of rows) { const v = item.dim(r); const c = m.get(v); if (c !== undefined) m.set(v, c + 1); else if (m.size < 5000) m.set(v, 1); }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, max || 100).map(x => x[0]);
  }

  function load(storage) { try { return sanitizeDefs(JSON.parse(storage.getItem(STORE) || '[]')); } catch (e) { return []; } }
  function save(storage, defs) { try { storage.setItem(STORE, JSON.stringify(defs)); return true; } catch (e) { return false; } }

  const api = { STORE, MAX_DEFS, MAX_CONDS, OPS, KINDS, AGGS, sanitizeDefs, condFields, valueFields, checkName, buildItems, suggestions, load, save };
  root.PivotMeasures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
