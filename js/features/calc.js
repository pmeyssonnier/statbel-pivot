/* Champs calculés du tableau croisé : formule sur les champs numériques, évaluée sur les SOMMES de chaque cellule
 * du tableau (comme les champs calculés d'Excel) — ex. [Établissements] / [Habitants] * 1000 donne un vrai ratio
 * à tous les niveaux (commune, province, total), pas une somme de ratios.
 *
 * Syntaxe : nombres (3,5 ou 3.5), [Nom du champ] (somme du champ dans la cellule ; [Nombre de lignes] = nombre de
 * lignes de données), + − * / ^ ( ), comparaisons (> < >= <= = <>), fonctions ABS, SQRT, ROUND(x; décimales),
 * MIN(a; b…), MAX(a; b…), SI(condition; alors; sinon) (ou IF). Division par zéro / valeur absente → cellule vide.
 * Aucun eval : analyseur écrit à la main, la formule ne peut rien exécuter d'autre que ce calcul.
 * Fonctions pures + stockage ; exposé : globalThis.PivotCalc / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('../core/engine.js') : root.PivotEngine;
  const STORE = 'statbel_pivot_calcs', MAX_CALCS = 50, MAX_NAME = 60, MAX_FORMULA = 500;
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  const FUNCS = { ABS: [1, 1], SQRT: [1, 1], ROUND: [1, 2], MIN: [1, 20], MAX: [1, 20], SI: [3, 3], IF: [3, 3] };

  class CalcError extends Error {}

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '[') {
        const j = src.indexOf(']', i + 1);
        if (j < 0) throw new CalcError('Crochet fermant « ] » manquant (position ' + (i + 1) + ').');
        const name = src.slice(i + 1, j).trim();
        if (!name) throw new CalcError('Nom de champ vide entre crochets (position ' + (i + 1) + ').');
        out.push({ t: 'ref', v: name, p: i }); i = j + 1; continue;
      }
      let m;
      if ((m = /^\d+(?:[.,]\d+)?|^[.,]\d+/.exec(src.slice(i)))) { out.push({ t: 'num', v: parseFloat(m[0].replace(',', '.')), p: i }); i += m[0].length; continue; }
      if ((m = /^[A-Za-zÀ-ÿ_]+/.exec(src.slice(i)))) { out.push({ t: 'id', v: m[0].toUpperCase(), p: i }); i += m[0].length; continue; }
      if ((m = />=|<=|<>|!=/.exec(src.slice(i, i + 2)))) { out.push({ t: 'op', v: m[0] === '!=' ? '<>' : m[0], p: i }); i += 2; continue; }
      if ('+-*/^()<>=;'.includes(c)) { out.push({ t: 'op', v: c, p: i }); i++; continue; }
      throw new CalcError('Caractère inattendu « ' + c + ' » (position ' + (i + 1) + ').');
    }
    return out;
  }

  // lookup(nom) → item du catalogue ou null. Renvoie { refs:[item], fn(rs, rn) → nombre | null }
  function compile(formula, lookup) {
    const src = String(formula == null ? '' : formula);
    if (!src.trim()) throw new CalcError('Écrivez une formule.');
    if (src.length > MAX_FORMULA) throw new CalcError('Formule trop longue (' + MAX_FORMULA + ' caractères max).');
    const toks = tokenize(src), refs = [], refIdx = new Map();
    let pos = 0;
    const peek = () => toks[pos], isOp = v => toks[pos] && toks[pos].t === 'op' && toks[pos].v === v;
    const expect = (v, msg) => { if (!isOp(v)) throw new CalcError(msg || ('« ' + v + ' » attendu' + (toks[pos] ? ' (position ' + (toks[pos].p + 1) + ')' : ' en fin de formule') + '.')); pos++; };
    const num = x => (typeof x === 'number' && isFinite(x) ? x : null);
    function primary() {
      const t = toks[pos];
      if (!t) throw new CalcError('Formule incomplète.');
      if (t.t === 'num') { pos++; return () => t.v; }
      if (t.t === 'ref') {
        pos++;
        const item = lookup(t.v);
        if (!item) throw new CalcError('Champ numérique inconnu : [' + t.v + ']. Utilisez le nom exact d\'un champ « 123 ».');
        let j = refIdx.get(item.key);
        if (j === undefined) { j = refs.length; refs.push(item); refIdx.set(item.key, j); }
        return (rs, rn) => (rn[j] ? rs[j] : null);
      }
      if (t.t === 'id') {
        pos++;
        const spec = FUNCS[t.v];
        if (!spec) throw new CalcError('Fonction inconnue : ' + t.v + ' (position ' + (t.p + 1) + '). Disponibles : ABS, SQRT, ROUND, MIN, MAX, SI.');
        expect('(', 'Parenthèse ouvrante attendue après ' + t.v + '.');
        const args = [];
        if (!isOp(')')) { do { args.push(cmp()); } while (isOp(';') && ++pos); }
        expect(')', 'Parenthèse fermante « ) » attendue pour ' + t.v + '.');
        if (args.length < spec[0] || args.length > spec[1]) throw new CalcError(t.v + ' attend ' + (spec[0] === spec[1] ? spec[0] : spec[0] + ' à ' + spec[1]) + ' argument(s), séparés par « ; ».');
        switch (t.v) {
          case 'ABS': return (a, b) => { const x = args[0](a, b); return x == null ? null : Math.abs(x); };
          case 'SQRT': return (a, b) => { const x = args[0](a, b); return x == null || x < 0 ? null : Math.sqrt(x); };
          case 'ROUND': return (a, b) => { const x = args[0](a, b), d = args[1] ? args[1](a, b) : 0; if (x == null || d == null) return null; const f = Math.pow(10, Math.max(0, Math.min(10, Math.round(d)))); return Math.round(x * f) / f; };
          case 'MIN': return (a, b) => { const v = args.map(f => f(a, b)); return v.some(x => x == null) ? null : Math.min(...v); };
          case 'MAX': return (a, b) => { const v = args.map(f => f(a, b)); return v.some(x => x == null) ? null : Math.max(...v); };
          default: return (a, b) => { const c = args[0](a, b); return c == null ? null : (c ? args[1](a, b) : args[2](a, b)); };   // SI / IF
        }
      }
      if (isOp('(')) { pos++; const e = cmp(); expect(')', 'Parenthèse fermante « ) » manquante.'); return e; }
      throw new CalcError('Élément inattendu « ' + (t.v) + ' » (position ' + (t.p + 1) + ').');
    }
    function unary() { if (isOp('-')) { pos++; const e = unary(); return (a, b) => { const x = e(a, b); return x == null ? null : -x; }; } if (isOp('+')) { pos++; return unary(); } return primary(); }
    function pow() { const l = unary(); if (isOp('^')) { pos++; const r = pow(); return (a, b) => { const x = l(a, b), y = r(a, b); return x == null || y == null ? null : num(Math.pow(x, y)); }; } return l; }
    function mul() {
      let l = pow();
      while (isOp('*') || isOp('/')) {
        const op = toks[pos++].v, r = pow(), pl = l;
        l = op === '*' ? (a, b) => { const x = pl(a, b), y = r(a, b); return x == null || y == null ? null : num(x * y); }
          : (a, b) => { const x = pl(a, b), y = r(a, b); return x == null || y == null || y === 0 ? null : num(x / y); };
      }
      return l;
    }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) {
        const op = toks[pos++].v, r = mul(), pl = l;
        l = (a, b) => { const x = pl(a, b), y = r(a, b); return x == null || y == null ? null : (op === '+' ? x + y : x - y); };
      }
      return l;
    }
    function cmp() {
      const l = add(), t = peek();
      if (t && t.t === 'op' && ['>', '<', '>=', '<=', '=', '<>'].includes(t.v)) {
        pos++;
        const r = add(), op = t.v;
        return (a, b) => {
          const x = l(a, b), y = r(a, b);
          if (x == null || y == null) return null;
          return (op === '>' ? x > y : op === '<' ? x < y : op === '>=' ? x >= y : op === '<=' ? x <= y : op === '=' ? x === y : x !== y) ? 1 : 0;
        };
      }
      return l;
    }
    const f = cmp();
    if (pos < toks.length) throw new CalcError('Élément inattendu « ' + toks[pos].v + ' » (position ' + (toks[pos].p + 1) + ').');
    if (!refs.length) throw new CalcError('La formule doit utiliser au moins un champ, entre crochets : [Nom du champ].');
    return { refs, fn: (rs, rn) => num(f(rs, rn)) };
  }

  /* ---------- définitions : nettoyage, items du catalogue, stockage ---------- */
  const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
  // [{name, formula}] venu du stockage / d'un import : texte brut borné, noms uniques, clés dangereuses écartées
  function sanitizeDefs(raw) {
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).slice(0, MAX_CALCS).forEach(d => {
      const name = d && clean(d.name, MAX_NAME), formula = d && clean(d.formula, MAX_FORMULA), k = name && E.normName(name);
      if (!name || !formula || BAD.has(name) || seen.has(k)) return;
      seen.add(k); out.push({ name, formula });
    });
    return out;
  }

  // Champs numériques utilisables dans une formule (colonnes d'origine, pas les dérivés ni d'autres calculs)
  const baseNumeric = cat => cat.filter(c => (c.type === 'number' && !c.derived && !c.calc && c.idx !== undefined) || c.measure || c.key === '__rows');
  function lookupFor(cat) {
    const m = new Map();
    baseNumeric(cat).forEach(c => { const k = E.normName(c.key === '__rows' ? 'Nombre de lignes' : c.label); if (!m.has(k)) m.set(k, c); });
    return name => m.get(E.normName(name)) || null;
  }
  function checkName(name, defs, cat, editing) {
    const n = clean(name, MAX_NAME);
    if (!n) return 'Donnez un nom au champ calculé.';
    if (BAD.has(n)) return 'Nom non autorisé.';
    const k = E.normName(n);
    if (cat.some(c => !c.calc && !c.derived && E.normName(c.label) === k)) return 'Ce nom est déjà celui d\'une colonne : choisissez-en un autre.';
    if (defs.some(d => E.normName(d.name) === k && d.name !== editing)) return 'Un champ calculé porte déjà ce nom.';
    return '';
  }

  // → { items, errors:[{name, error}] } : les formules invalides (champ absent des fichiers actuels…) sont signalées, pas ajoutées
  function buildItems(defs, cat) {
    const lk = lookupFor(cat), items = [], errors = [];
    defs.forEach(d => {
      try {
        const c = compile(d.formula, lk);
        items.push({ key: 'calc|' + d.name, label: d.name, type: 'number', calc: true, valueOnly: true, formula: d.formula, refs: c.refs, fn: c.fn, val: () => null, dim: () => '' });
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        errors.push({ name: d.name, error: e.message });
      }
    });
    return { items, errors };
  }

  function load(storage) {
    try { return sanitizeDefs(JSON.parse(storage.getItem(STORE) || '[]')); } catch (e) { return []; }
  }
  function save(storage, defs) {
    try { storage.setItem(STORE, JSON.stringify(sanitizeDefs(defs))); return true; } catch (e) { return false; }
  }

  const api = { compile, sanitizeDefs, buildItems, checkName, baseNumeric, load, save, CalcError, STORE, MAX_CALCS };
  root.PivotCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
