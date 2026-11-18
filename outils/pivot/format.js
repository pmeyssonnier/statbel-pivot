/* Mise en forme du tableau croisé : formats de nombres et mise en forme conditionnelle.
 * Pur (aucun DOM) → testable sous Node. Exposé : globalThis.PivotFormat / module.exports. */
(function (root) {
  'use strict';

  const FORMATS = {
    auto: 'Automatique',
    int: 'Entier (1 234)',
    d1: '1 décimale (1 234,5)',
    d2: '2 décimales (1 234,56)',
    pct: 'Pourcentage (0,25 → 25 %)',
    eur: 'Euro (1 234,56 €)',
    k: 'En milliers (1,2 k)'
  };
  const CF_MODES = {
    none: 'Aucune',
    heat: 'Carte de chaleur (bleu)',
    scale3: 'Échelle 3 couleurs',
    bars: 'Barres de données',
    top: 'Top / Flop 10 %',
    rule: 'Règle : valeur …'
  };

  const nfs = {};
  const nf = (min, max) => nfs[min + '/' + max] || (nfs[min + '/' + max] = new Intl.NumberFormat('fr-BE', { minimumFractionDigits: min, maximumFractionDigits: max }));

  // spec = { agg, fmt } ; dec = 'auto' | nombre de décimales (réglage global, utilisé par le format « auto »)
  function formatValue(v, spec, dec) {
    if (v == null) return '';
    const f = (spec && spec.fmt) || 'auto', isPct = /^pct/.test((spec && spec.agg) || '');
    switch (f) {
      case 'int': return nf(0, 0).format(v);
      case 'd1': return nf(1, 1).format(v);
      case 'd2': return nf(2, 2).format(v);
      case 'pct': return nf(0, 1).format(isPct ? v : v * 100) + ' %';
      case 'eur': return nf(2, 2).format(v) + ' €';
      case 'k': return nf(0, 1).format(v / 1000) + ' k';
      default:
        if (isPct) return nf(0, 1).format(v) + ' %';
        return dec === undefined || dec === 'auto' ? nf(0, 2).format(v) : nf(+dec, +dec).format(v);
    }
  }

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (c1, c2, t) => 'rgb(' + hex(c1).map((x, i) => lerp(x, hex(c2)[i], t)).join(',') + ')';
  const DARK = 'color:#1b2733;';

  // values[k] = tableau des valeurs numériques de la colonne k ; renvoie style(v, k) → chaîne CSS ('' si rien).
  function buildStyler(mode, values, opts) {
    opts = opts || {};
    const stats = values.map(list => {
      const v = list.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
      return { min: v[0], max: v[v.length - 1], sorted: v };
    });
    const thr = parseFloat(String(opts.val).replace(',', '.'));
    return (v, k) => {
      if (v == null || !stats[k] || stats[k].min === undefined) return '';
      const s = stats[k], t = s.max > s.min ? (v - s.min) / (s.max - s.min) : 0;
      if (s.max === s.min && (mode === 'scale3' || mode === 'bars')) return '';   // colonne constante : rien à comparer
      switch (mode) {
        case 'heat': return 'background:rgba(21,101,192,' + (0.06 + 0.5 * t).toFixed(2) + ');';
        case 'scale3': return 'background:' + (t < 0.5 ? mix('#f8696b', '#ffeb84', t * 2) : mix('#ffeb84', '#63be7b', (t - 0.5) * 2)) + ';' + DARK;
        case 'bars': return 'background:linear-gradient(to right,rgba(21,101,192,.35) ' + (t * 100).toFixed(0) + '%,transparent ' + (t * 100).toFixed(0) + '%);';
        case 'top': {
          const n = s.sorted.length;
          if (n < 5) return '';
          if (v >= s.sorted[Math.ceil(0.9 * (n - 1))]) return 'background:#c6efce;color:#006100;';
          if (v <= s.sorted[Math.floor(0.1 * (n - 1))]) return 'background:#ffc7ce;color:#9c0006;';
          return '';
        }
        case 'rule': {
          if (!isFinite(thr)) return '';
          const ok = { '>': v > thr, '<': v < thr, '>=': v >= thr, '<=': v <= thr, '=': v === thr }[opts.op || '>'];
          return ok ? 'background:#ffc7ce;color:#9c0006;font-weight:600;' : '';
        }
        default: return '';
      }
    };
  }

  const api = { FORMATS, CF_MODES, formatValue, buildStyler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PivotFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
