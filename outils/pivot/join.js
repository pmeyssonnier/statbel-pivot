/* Jointures entre fichiers : rattache à chaque ligne d'une source (gauche) des colonnes d'une autre source (droite)
 * via une ou plusieurs colonnes clés (jointure « gauche » ou « interne »). Le résultat est une feuille virtuelle
 * (tableau de tableaux) qui se comporte ensuite comme n'importe quelle source ; elle est recalculée à chaque
 * changement ou actualisation des fichiers d'origine (rien n'est stocké en double).
 * Fonctions pures (testables sous Node) ; exposé : globalThis.PivotJoin / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;
  const MAX_JOINS = 20, MAX_KEYS = 3, BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const TYPES = ['left', 'inner'], DUPS = ['first', 'all'];

  // En-têtes d'une source : texte de la ligne d'en-tête (« Colonne N » si vide)
  function columnNames(aoa, headerRow) {
    const h = (aoa && aoa[headerRow]) || [];
    const n = Math.max(h.length, ...(aoa || []).slice(headerRow + 1, headerRow + 50).map(r => (r ? r.length : 0)), 0);
    const out = [];
    for (let i = 0; i < n; i++) { const t = h[i] == null ? '' : String(h[i]).trim(); out.push(t || 'Colonne ' + (i + 1)); }
    return out;
  }

  // Valeur de clé comparable : sans casse ni accents ; « 01001 », 1001 et « 1001 » se rejoignent ; dates par jour
  function keyOf(v) {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v) ? null : 'd:' + E.dateLabel(v);
    if (typeof v === 'number') return isFinite(v) ? 'n:' + String(v) : null;
    const t = String(v).trim();
    if (!t) return null;
    if (/^[+-]?\d+(?:[.,]\d+)?$/.test(t)) { const x = Number(t.replace(',', '.')); if (isFinite(x)) return 'n:' + String(x); }
    return 't:' + (E.normName(t) || t.toLowerCase());
  }

  // def = { keys:[[colGauche, colDroite],…], type:'left'|'inner', dup:'first'|'all', cols:[colDroite,…] | null } ; L, R = { aoa, headerRow }
  // → { aoa, stats:{ left, matched, unmatched, dupKeys, out }, error }
  function build(def, L, R) {
    const ln = columnNames(L.aoa, L.headerRow), rn = columnNames(R.aoa, R.headerRow);
    const idx = (names, n) => names.indexOf(n);
    const keys = (def.keys || []).filter(k => Array.isArray(k) && k.length === 2);
    if (!keys.length) return { error: 'Choisissez au moins une paire de colonnes clés.' };
    const lk = [], rk = [];
    for (const [a, b] of keys) {
      const i = idx(ln, a), j = idx(rn, b);
      if (i < 0) return { error: 'Colonne « ' + a + ' » introuvable dans la source de gauche.' };
      if (j < 0) return { error: 'Colonne « ' + b + ' » introuvable dans la source de droite.' };
      lk.push(i); rk.push(j);
    }
    const wanted = Array.isArray(def.cols) ? def.cols : rn.filter((n, j) => !rk.includes(j));
    const add = [];
    for (const n of wanted) { const j = idx(rn, n); if (j >= 0 && !add.includes(j)) add.push(j); }
    if (!add.length) return { error: 'Aucune colonne de droite à ajouter.' };
    // en-tête : colonnes de gauche puis colonnes de droite (renommées si elles existent déjà à gauche)
    const used = new Set(ln.map(n => E.normName(n)));
    const rnames = add.map(j => {
      let n = rn[j];
      if (used.has(E.normName(n))) { n = n + ' (droite)'; let k = 2; while (used.has(E.normName(n))) n = rn[j] + ' (droite ' + (k++) + ')'; }
      used.add(E.normName(n)); return n;
    });
    // index de la source de droite
    const index = new Map();
    for (let r = R.headerRow + 1; r < R.aoa.length; r++) {
      const row = R.aoa[r]; if (!row) continue;
      const parts = rk.map(j => keyOf(row[j]));
      if (parts.some(p => p === null)) continue;
      const k = parts.join('\u0001');
      const list = index.get(k); if (list) list.push(row); else index.set(k, [row]);
    }
    let dupKeys = 0; index.forEach(l => { if (l.length > 1) dupKeys++; });
    const out = [ln.concat(rnames)], inner = def.type === 'inner', all = def.dup === 'all';
    let matched = 0, unmatched = 0, nLeft = 0;
    const blank = add.map(() => null);
    for (let r = L.headerRow + 1; r < L.aoa.length; r++) {
      const row = L.aoa[r]; if (!row) continue;
      nLeft++;
      const parts = lk.map(i => keyOf(row[i]));
      const list = parts.some(p => p === null) ? null : index.get(parts.join('\u0001'));
      const base = []; for (let i = 0; i < ln.length; i++) base.push(row[i] === undefined ? null : row[i]);
      if (!list) { unmatched++; if (!inner) out.push(base.concat(blank)); continue; }
      matched++;
      for (const m of (all ? list : [list[0]])) out.push(base.concat(add.map(j => (m[j] === undefined ? null : m[j]))));
    }
    return { aoa: out, stats: { left: nLeft, matched, unmatched, dupKeys, out: out.length - 1 } };
  }

  /* ---------- définitions : nettoyage de ce qui vient du stockage ---------- */
  const text = (s, max) => (typeof s === 'string' && s.trim() && s.length <= max ? s : null);
  function sanitizeDefs(raw) {
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).slice(0, MAX_JOINS).forEach(d => {
      if (!d || typeof d !== 'object') return;
      const id = typeof d.id === 'string' && /^j\d{1,4}$/.test(d.id) ? d.id : null, name = text(d.name, 60);
      const left = typeof d.left === 'string' && /^s\d{1,6}$/.test(d.left) ? d.left : null, right = typeof d.right === 'string' && /^s\d{1,6}$/.test(d.right) ? d.right : null;
      const keys = (Array.isArray(d.keys) ? d.keys : []).map(k => (Array.isArray(k) && text(k[0], 200) !== null && text(k[1], 200) !== null ? [k[0], k[1]] : null)).filter(Boolean).slice(0, MAX_KEYS);
      if (!id || seen.has(id) || !name || BAD.has(name) || !left || !right || !keys.length) return;
      seen.add(id);
      out.push({
        id, name, left, right, keys, type: TYPES.includes(d.type) ? d.type : 'left', dup: DUPS.includes(d.dup) ? d.dup : 'first',
        cols: Array.isArray(d.cols) ? d.cols.slice(0, 300).filter(c => text(c, 200) !== null) : null, use: d.use !== false
      });
    });
    return out;
  }

  const api = { build, keyOf, columnNames, sanitizeDefs, MAX_JOINS, MAX_KEYS };
  root.PivotJoin = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
