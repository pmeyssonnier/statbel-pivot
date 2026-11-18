/* Hiérarchies de champs du projet : ordre du plus large au plus fin (ex. Région › Province › Commune ; Année › Trimestre › Mois).
 *  - sert aux filtres en pastilles : les valeurs proposées pour un niveau se limitent à celles compatibles avec les niveaux supérieurs déjà choisis
 *    (ex. Région = Wallonie → seules les provinces wallonnes), et un niveau devenu incohérent revient à « Toutes » ;
 *  - `detect` reconnaît les niveaux courants (géographie, temps) d'après le libellé des champs ; l'utilisateur peut aussi les composer à la main.
 * Fonctions pures (aucun accès au DOM). Exposé : globalThis.PivotHier / module.exports. */
(function (root) {
  'use strict';
  const MAX_HIER = 6, MAX_LEVELS = 8, MAX_NAME = 40;
  const key = k => typeof k === 'string' && k.length > 0 && k.length <= 200;

  // hiérarchies : [{ name, levels:[clé…] }] → nettoyé (noms bornés et uniques, 2 à 8 niveaux, un champ au plus une fois par hiérarchie)
  function sanitize(list) {
    const out = [], names = new Set();
    (Array.isArray(list) ? list : []).slice(0, MAX_HIER).forEach(h => {
      if (!h || typeof h !== 'object' || typeof h.name !== 'string') return;
      const name = h.name.trim().slice(0, MAX_NAME), levels = [...new Set((Array.isArray(h.levels) ? h.levels : []).filter(key))].slice(0, MAX_LEVELS);
      if (!name || names.has(name.toLowerCase()) || levels.length < 2) return;
      names.add(name.toLowerCase()); out.push({ name, levels });
    });
    return out;
  }

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // mots-clés par niveau, du plus large au plus fin (FR / NL / EN) ; un libellé correspond si l'un des mots y figure en tant que mot entier
  const GEO = [['pays', 'land', 'country'], ['region', 'gewest', 'regio'], ['province', 'provincie'], ['arrondissement'], ['commune', 'gemeente', 'municipalite', 'municipality', 'ville', 'stad']];
  const TIME = [['annee', 'jaar', 'year'], ['trimestre', 'kwartaal', 'quarter'], ['mois', 'maand', 'month'], ['semaine', 'week'], ['jour', 'dag', 'day']];
  const has = (label, words) => { const t = norm(label).split(/[^a-z0-9]+/).filter(Boolean); return words.some(w => t.includes(w)); };
  // fields : [{ key, label }] → hiérarchies reconnues (au moins 2 niveaux présents)
  function detect(fields) {
    const out = [];
    [['Géographie', GEO], ['Temps', TIME]].forEach(([name, table]) => {
      const levels = [];
      table.forEach(words => { const f = (fields || []).find(x => key(x.key) && has(x.label, words) && !levels.includes(x.key)); if (f) levels.push(f.key); });
      if (levels.length >= 2) out.push({ name, levels });
    });
    return out;
  }

  // niveaux SUPÉRIEURS (plus larges) d'un champ dans les hiérarchies : [clé…] (sans doublon)
  function uppers(hier, k) {
    const out = [];
    (hier || []).forEach(h => { const i = h.levels.indexOf(k); if (i > 0) h.levels.slice(0, i).forEach(u => { if (!out.includes(u)) out.push(u); }); });
    return out;
  }

  // Valeurs autorisées d'un champ compte tenu des choix `chosen` ([{ key, val }], val '' = toutes) sur ses niveaux supérieurs.
  // rows : lignes ; dim(clé) → fonction ligne → valeur. Renvoie null quand rien ne restreint (toutes les valeurs).
  function allowed(hier, k, chosen, rows, dimOf) {
    const up = uppers(hier, k), act = (chosen || []).filter(s => s && s.val !== '' && up.includes(s.key));
    if (!act.length) return null;
    const fs = act.map(s => [dimOf(s.key), s.val]), get = dimOf(k), set = new Set();
    for (const r of rows) { let ok = true; for (const [f, v] of fs) { if (f(r) !== v) { ok = false; break; } } if (ok) set.add(get(r)); }
    return set;
  }

  // Remet à « Toutes » (val '') chaque sélecteur de `list` dont la valeur n'est plus compatible avec ses niveaux supérieurs (parmi `ctx` = tous les sélecteurs actifs).
  // Traite les niveaux dans l'ordre des hiérarchies (du plus large au plus fin) pour que la correction se propage vers le bas.
  function fix(hier, list, ctx, rows, dimOf) {
    const rank = k => { let r = 0; (hier || []).forEach(h => { const i = h.levels.indexOf(k); if (i > r) r = i; }); return r; };
    const all = (ctx || []).map(s => Object.assign({}, s)), byKey = new Map(all.map(s => [s.key, s]));
    const out = list.map(s => Object.assign({}, s));
    [...out.map(s => s.key)].sort((a, b) => rank(a) - rank(b)).forEach(k => {
      const s = out.find(x => x.key === k); if (!s || s.val === '') return;
      const set = allowed(hier, k, [...byKey.values()], rows, dimOf);
      if (set && !set.has(s.val)) { s.val = ''; const c = byKey.get(k); if (c) c.val = ''; }
    });
    return out;
  }

  const api = { MAX_HIER, MAX_LEVELS, sanitize, detect, uppers, allowed, fix };
  root.PivotHier = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
