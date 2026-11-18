/* Contrôle qualité des données unifiées : profil de chaque champ (remplissage, valeurs distinctes, min / max / moyenne,
 * valeurs non numériques, aberrantes, variantes d'écriture…) et liste des anomalies à vérifier avant d'analyser.
 * Fonctions pures (testables sous Node) ; exposé : globalThis.PivotQuality / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;
  const DISTINCT_CAP = 20000, SAMPLES = 4;

  const quant = (s, q) => { const p = (s.length - 1) * q, i = Math.floor(p), f = p - i; return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i]; };
  const rowKey = (r) => { let k = ''; for (let i = 1; i < r.length; i++) { const v = r[i]; k += (v === null || v === undefined ? '' : v instanceof Date ? 'D' + v.getTime() : typeof v + ':' + v) + '\u0001'; } return k; };

  // rows : lignes unifiées (r[i] = valeur du champ i) ; fields : champs unifiés (le champ 0 « Source » est ignoré)
  // opts.activeSources : nombre de feuilles utilisées (pour repérer un champ absent de certaines sources)
  function profile(rows, fields, opts) {
    opts = opts || {};
    const n = rows.length, out = [], issues = [];
    for (let i = 1; i < fields.length; i++) {
      const f = fields[i], type = f.type;
      let filled = 0, bad = 0, ws = 0, neg = 0, zero = 0, sum = 0, maxLen = 0, tmin = Infinity, tmax = -Infinity, capped = false;
      const nums = [], badSamples = [], distinct = new Map();
      for (let r = 0; r < n; r++) {
        const v = rows[r][i];
        if (v === null || v === undefined) continue;
        filled++;
        if (type === 'number' && typeof v === 'number') { nums.push(v); sum += v; if (v < 0) neg++; else if (v === 0) zero++; }
        else if (type === 'date' && v instanceof Date) { const t = v.getTime(); if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
        else if (type === 'number' || type === 'date') { bad++; if (badSamples.length < SAMPLES && !badSamples.includes(String(v))) badSamples.push(String(v)); }
        if (typeof v === 'string') { if (v.length > maxLen) maxLen = v.length; if (/\s{2,}/.test(v)) ws++; }
        const key = v instanceof Date ? E.dateLabel(v) : String(v);
        const c = distinct.get(key);
        if (c !== undefined) distinct.set(key, c + 1); else if (distinct.size < DISTINCT_CAP) distinct.set(key, 1); else capped = true;
      }
      const p = { i, key: f.key, label: f.label, type, filled, empty: n - filled, pctFilled: n ? filled / n : 0, distinct: distinct.size, capped, bad, badSamples, ws, maxLen };
      if (type === 'number' && nums.length) {
        const s = Float64Array.from(nums).sort();
        p.min = s[0]; p.max = s[s.length - 1]; p.mean = sum / nums.length; p.median = quant(s, 0.5); p.sum = sum; p.neg = neg; p.zero = zero;
        const q1 = quant(s, 0.25), q3 = quant(s, 0.75), iqr = q3 - q1;
        p.outliers = 0;
        if (s.length >= 8 && iqr > 0) {
          const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
          for (const x of s) if (x < lo || x > hi) p.outliers++;
          p.fence = [lo, hi];
        }
      }
      if (type === 'date' && tmin !== Infinity) { p.min = new Date(tmin); p.max = new Date(tmax); }
      p.top = [...distinct].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, 5);
      // variantes d'écriture d'une même valeur (casse, accents, ponctuation) : comptées séparément par l'outil
      p.variants = [];
      if (type === 'text' && !capped) {
        const g = new Map();
        for (const k of distinct.keys()) { const nk = E.normName(k); if (!nk) continue; const l = g.get(nk); if (l) l.push(k); else g.set(nk, [k]); }
        for (const l of g.values()) if (l.length > 1) p.variants.push(l.slice(0, 4));
        p.variants.sort((a, b) => b.length - a.length);
      }
      p.constant = filled > 0 && distinct.size === 1 && !capped;
      p.sources = f.sources ? f.sources.size : 0;
      out.push(p);
    }
    // lignes de contenu identique (le champ « Source » est ignoré : un fichier chargé deux fois est repéré)
    const seen = new Set(); let dupRows = 0;
    for (let r = 0; r < n; r++) { const k = rowKey(rows[r]); if (seen.has(k)) dupRows++; else seen.add(k); }
    const fmt = x => (Math.round(x * 100) / 100).toLocaleString('fr-BE');
    if (dupRows) issues.push({ sev: 'warn', field: null, text: `${dupRows.toLocaleString('fr-BE')} ligne(s) de contenu identique à une autre (hors colonne Source) — fichier chargé deux fois ? Elles sont comptées séparément.` });
    out.forEach(p => {
      const L = '« ' + p.label + ' »';
      if (p.filled === 0) { issues.push({ sev: 'warn', field: p.label, text: `${L} : entièrement vide.` }); return; }
      if (p.bad) issues.push({ sev: 'warn', field: p.label, text: `${L} : ${p.bad.toLocaleString('fr-BE')} valeur(s) ${p.type === 'number' ? 'non numérique(s)' : 'qui ne sont pas des dates'} (ex. ${p.badSamples.map(s => '« ' + s + ' »').join(', ')}) — ignorée(s) dans les ${p.type === 'number' ? 'sommes et moyennes' : 'dérivations de date'}.` });
      if (p.variants.length) issues.push({ sev: 'warn', field: p.label, text: `${L} : ${p.variants.length} valeur(s) écrite(s) de plusieurs façons, comptées séparément : ${p.variants.slice(0, 2).map(l => l.map(s => '« ' + s + ' »').join(' / ')).join(' ; ')}${p.variants.length > 2 ? '…' : ''}.` });
      if (p.empty / n >= 0.2) issues.push({ sev: 'info', field: p.label, text: `${L} : ${Math.round(p.empty / n * 100)} % de valeurs manquantes (${p.empty.toLocaleString('fr-BE')}).` });
      if (p.outliers) issues.push({ sev: 'info', field: p.label, text: `${L} : ${p.outliers.toLocaleString('fr-BE')} valeur(s) aberrante(s) (hors de ${fmt(p.fence[0])} … ${fmt(p.fence[1])}, règle 1,5 × IQR).` });
      if (p.ws) issues.push({ sev: 'info', field: p.label, text: `${L} : ${p.ws.toLocaleString('fr-BE')} valeur(s) avec des espaces multiples.` });
      if (p.constant && p.filled === n && n > 1) issues.push({ sev: 'info', field: p.label, text: `${L} : une seule valeur (« ${p.top[0][0]} ») — champ sans intérêt pour l'analyse.` });
      if (opts.activeSources > 1 && p.sources > 0 && p.sources < opts.activeSources) issues.push({ sev: 'info', field: p.label, text: `${L} : présent dans ${p.sources} feuille(s) sur ${opts.activeSources} seulement.` });
    });
    issues.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'warn' ? -1 : 1));
    return { n, fields: out, dupRows, issues };
  }

  const api = { profile };
  root.PivotQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
