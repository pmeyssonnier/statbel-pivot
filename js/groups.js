/* Groupes de valeurs du tableau croisé : nouveau champ (dimension) qui regroupe les valeurs d'un champ existant.
 *  - « values » : regroupement manuel de valeurs (ex. « Divorced » + « Separated » → « Divorcé(e) »), le reste étant
 *    gardé tel quel ou regroupé sous un libellé (ex. « Autres ») ;
 *  - « ranges » : tranches numériques à partir de seuils (ex. 18, 25, 35 → « < 18 », « 18–24 », « 25–34 », « 35+ »),
 *    avec libellés personnalisables.
 * Le nouveau champ apparaît dans la liste des champs (clé `grp|<id>`, stable même si le groupe est renommé) et s'utilise
 * partout comme une dimension (lignes, colonnes, filtres, graphiques). Fonctions pures + stockage local.
 * Exposé : globalThis.PivotGroups / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;
  const STORE = 'statbel_pivot_groups', MAX_DEFS = 30, MAX_NAME = 60, MAX_GROUPS = 60, MAX_VALUES = 3000, MAX_BREAKS = 60, MAX_DISTINCT = 2000;
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

  // Seuils saisis. Avec un « ; » : « ; » et espaces séparent, la virgule est décimale (« 1,5 ; 3 »).
  // Sans « ; » : virgules, espaces et retours à la ligne séparent (« 17,24,34 »), les décimales s'écrivent avec un point (« 1.5, 3 »).
  function parseBreaks(text) {
    const t = String(text == null ? '' : text), semi = t.includes(';'), out = [];
    t.split(semi ? /[;\n\s]+/ : /[,;\n\s]+/).forEach(tok => {
      tok = tok.replace(/,+$/, '');
      if (tok && /^-?\d+(?:[.,]\d+)?$/.test(tok)) { const x = parseFloat(tok.replace(',', '.')); if (isFinite(x)) out.push(x); }
    });
    return [...new Set(out)].sort((a, b) => a - b).slice(0, MAX_BREAKS);
  }

  const fmtN = x => String(Math.round(x * 1e6) / 1e6).replace('.', ',');
  // Libellés par défaut des n+1 tranches définies par n seuils.
  // edge « start » : chaque seuil est le DÉBUT d'une tranche (18, 25 → < 18 | 18–24 | 25+) ; « end » : la FIN, incluse (17, 24 → ≤ 17 | 18–24 | 25+).
  function rangeLabels(breaks, custom, edge) {
    const n = breaks.length, ints = breaks.every(Number.isInteger), end = edge === 'end', def = [];
    if (!n) return [];
    for (let i = 0; i <= n; i++) {
      if (!end) {
        if (i === 0) def.push('< ' + fmtN(breaks[0]));
        else if (i === n) def.push(ints ? fmtN(breaks[n - 1]) + '+' : '≥ ' + fmtN(breaks[n - 1]));
        else def.push(ints ? (breaks[i] - 1 === breaks[i - 1] ? fmtN(breaks[i - 1]) : fmtN(breaks[i - 1]) + '–' + fmtN(breaks[i] - 1)) : fmtN(breaks[i - 1]) + ' – < ' + fmtN(breaks[i]));
      } else if (i === 0) def.push('≤ ' + fmtN(breaks[0]));
      else if (i === n) def.push(ints ? fmtN(breaks[n - 1] + 1) + '+' : '> ' + fmtN(breaks[n - 1]));
      else def.push(ints ? (breaks[i] === breaks[i - 1] + 1 ? fmtN(breaks[i]) : fmtN(breaks[i - 1] + 1) + '–' + fmtN(breaks[i])) : '> ' + fmtN(breaks[i - 1]) + ' – ' + fmtN(breaks[i]));
    }
    return Array.isArray(custom) && custom.length === n + 1 && custom.every(l => typeof l === 'string' && l.trim()) ? custom.map(l => l.trim().slice(0, MAX_NAME)) : def;
  }

  function sanitizeDefs(list) {
    const out = [], names = new Set(), ids = new Set();
    (Array.isArray(list) ? list : []).slice(0, MAX_DEFS).forEach(d => {
      if (!d || typeof d !== 'object') return;
      const name = str(d.name, MAX_NAME), src = str(d.src, 200);
      if (!name || !src || BAD.has(name) || names.has(name.toLowerCase())) return;
      const kind = d.kind === 'ranges' ? 'ranges' : 'values';
      let id = typeof d.id === 'string' && /^g\d{1,6}$/.test(d.id) && !ids.has(d.id) ? d.id : '';
      const def = { id, name, src, kind, rest: str(d.rest, MAX_NAME) };
      if (kind === 'values') {
        let total = 0;
        def.groups = (Array.isArray(d.groups) ? d.groups : []).slice(0, MAX_GROUPS).map(g => {
          const label = g && typeof g === 'object' ? str(g.label, MAX_NAME) : '';
          const values = label && Array.isArray(g.values) ? g.values.filter(v => typeof v === 'string' && v.length <= 200) : [];
          total += values.length;
          return total > MAX_VALUES ? null : { label, values: [...new Set(values)] };
        }).filter(g => g && g.label && g.values.length);
        if (!def.groups.length) return;
      } else {
        const breaks = (Array.isArray(d.breaks) ? d.breaks : []).filter(x => typeof x === 'number' && isFinite(x));
        def.breaks = [...new Set(breaks)].sort((a, b) => a - b).slice(0, MAX_BREAKS);
        if (!def.breaks.length) return;
        def.edge = d.edge === 'end' ? 'end' : 'start';
        def.labels = Array.isArray(d.labels) && d.labels.length === def.breaks.length + 1 && d.labels.every(l => typeof l === 'string' && l.trim()) ? d.labels.map(l => l.trim().slice(0, MAX_NAME)) : [];
      }
      if (!id) { let k = 1; while (ids.has('g' + k)) k++; def.id = 'g' + k; }
      ids.add(def.id); names.add(name.toLowerCase());
      out.push(def);
    });
    return out;
  }

  // Champs pouvant être regroupés : champs de données (pas les calculés ni les groupes) ; tranches → champs numériques
  function baseSources(cat, kind) {
    return cat.filter(c => c.key !== '__rows' && !c.calc && !c.group && !c.valueOnly && (kind === 'ranges' ? c.type === 'number' : true));
  }

  function checkName(name, defs, cat, editingId) {
    const n = str(name, MAX_NAME);
    if (!n) return 'Donnez un nom au nouveau champ.';
    if (BAD.has(n)) return 'Nom non autorisé.';
    const low = n.toLowerCase();
    if (defs.some(d => d.id !== editingId && d.name.toLowerCase() === low)) return 'Un groupe de valeurs porte déjà ce nom.';
    const own = editingId ? 'grp|' + editingId : null;
    if (cat.some(c => c.key !== own && String(c.label).toLowerCase() === low)) return 'Un champ porte déjà ce nom : choisissez-en un autre.';
    return '';
  }

  // Valeurs distinctes (libellés de dimension) d'un champ avec leur effectif, triées ; { list, capped }
  function distinctValues(rows, item) {
    const m = new Map();
    let capped = false;
    for (const r of rows) {
      const v = item.dim(r), c = m.get(v);
      if (c !== undefined) m.set(v, c + 1); else if (m.size < MAX_DISTINCT) m.set(v, 1); else capped = true;
    }
    const list = [...m].map(([v, n]) => ({ v, n })).sort((a, b) => (a.v === E.EMPTY ? 1 : b.v === E.EMPTY ? -1 : collator.compare(a.v, b.v)));
    return { list, capped };
  }

  // Seuils réguliers « tous les N » entre le minimum et le maximum du champ numérique (null si trop nombreux ou pas de données)
  function autoBreaks(rows, item, step) {
    if (!(step > 0)) return null;
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) {
      const v = item.val(r), x = typeof v === 'number' ? v : (v == null || v instanceof Date ? NaN : E.parseNumber(v));
      if (x === x) { if (x < lo) lo = x; if (x > hi) hi = x; }
    }
    if (lo > hi) return null;
    const out = [];
    for (let b = (Math.floor(lo / step) + 1) * step; b <= hi + 1e-9; b += step) { out.push(Math.round(b * 1e9) / 1e9); if (out.length > MAX_BREAKS) return null; }
    return out.length ? out : null;
  }

  // → { items:[…catalogue], errors:[{ name, error }] }
  function buildItems(defs, cat) {
    const items = [], errors = [];
    defs.forEach(d => {
      const src = cat.find(c => c.key === d.src && !c.calc && !c.group && !c.valueOnly);
      if (!src) { errors.push({ name: d.name, error: 'Champ source introuvable : « ' + d.src + ' » (fichier retiré ou colonne exclue).' }); return; }
      let dim;
      if (d.kind === 'ranges') {
        if (src.type !== 'number') { errors.push({ name: d.name, error: 'Le champ « ' + src.label + ' » n\'est pas numérique.' }); return; }
        const labels = rangeLabels(d.breaks, d.labels, d.edge), br = d.breaks, endIn = d.edge === 'end';
        dim = r => {
          const v = src.val(r), x = typeof v === 'number' ? v : (v == null || v instanceof Date ? NaN : E.parseNumber(v));
          if (x !== x) return E.EMPTY;
          let i = 0; while (i < br.length && (endIn ? x > br[i] : x >= br[i])) i++;
          return labels[i];
        };
      } else {
        const map = new Map();
        d.groups.forEach(g => g.values.forEach(v => { if (!map.has(v)) map.set(v, g.label); }));
        const rest = d.rest;
        dim = r => {
          const l = src.dim(r), g = map.get(l);
          return g !== undefined ? g : (l === E.EMPTY || !rest ? l : rest);
        };
      }
      items.push({ key: 'grp|' + d.id, label: d.name, type: 'text', derived: true, group: true, groupOf: src.key, val: dim, dim });
    });
    return { items, errors };
  }

  function load(storage) {
    try { return sanitizeDefs(JSON.parse(storage.getItem(STORE) || '[]')); } catch (e) { return []; }
  }
  function save(storage, defs) {
    try { storage.setItem(STORE, JSON.stringify(defs)); return true; } catch (e) { return false; }
  }

  const api = { STORE, MAX_DEFS, MAX_DISTINCT, parseBreaks, rangeLabels, sanitizeDefs, baseSources, checkName, distinctValues, autoBreaks, buildItems, load, save };
  root.PivotGroups = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
