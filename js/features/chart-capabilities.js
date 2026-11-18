/* Capacités des types de graphique : quelles options (clés de PivotChart.normOpts) ont un effet sur quel type.
 * Source unique pour l'interface (options affichées) et le moteur (options non applicables ignorées, jamais effacées).
 * Table établie par mesure : pour chaque type, une option est « supportée » si elle change le rendu (voir tests). */
(function (root) {
  'use strict';
  const set = s => s.split(' ');
  const BARS = 'lab lpos leg pal grid ymin ymax step ref ord title bar talign tvert';
  const CAPS = {
    bar: set(BARS), hbar: set(BARS), stack: set(BARS), stack100: set(BARS), hstack: set(BARS), hstack100: set(BARS),
    combo: set(BARS + ' smooth scale y2min y2max y2step'),
    pyramid: set('lab lpos leg pal grid ord title bar talign tvert'),
    line: set('lab leg pal grid smooth trend trendWindow trendEquation ymin ymax step scale ref ord title talign tvert'),
    area: set('lab leg pal grid smooth ymin ymax step ref ord title talign tvert'),
    sarea: set('lab leg pal grid ymin ymax step ref ord title talign tvert'),
    pie: set('lab leg pal ord title zoom talign tvert'),
    donut: set('lab leg pal ord title zoom hole talign tvert'),
    treemap: set('lab pal title talign tvert'),
    scatter: set('pal trend trendEquation title talign tvert'),
    kpi: set('pal title kpi talign tvert'),
    gauge: set('pal title talign tvert'),
    map: set('pal title talign tvert')
  };
  const has = (Object.prototype.hasOwnProperty);
  const supports = (type, key) => has.call(CAPS, type) && CAPS[type].indexOf(key) >= 0;
  // Options visibles dans le panneau pour ce type et ces réglages (une option dépendante n'apparaît que si elle sert)
  const isData = key => key === 'cdim' || key === 'cdim2';   // options de DONNÉES (champ du graphique) : sans effet sur le rendu, valables pour tout type connu
  function visible(type, key, o) {
    if (isData(key)) return has.call(CAPS, type) && (key === 'cdim' || !!(o && o.cdim));   // les séries n'ont de sens qu'avec un champ de graphique
    if (!supports(type, key)) return false;
    o = o || {};
    if (key === 'trendWindow') return o.trend === 'ma';
    if (key === 'trendEquation') return o.trend !== 'none' && o.trend !== 'ma' && (o.trend !== 'auto' || type === 'scatter');
    return true;
  }
  // Options du rendu : celles que le type ne gère pas reprennent leur valeur par défaut (les réglages enregistrés ne sont pas touchés)
  function effective(type, o, defaults) {
    if (!has.call(CAPS, type)) return o;
    const out = Object.assign({}, o);
    Object.keys(defaults || {}).forEach(k => { if (CAPS[type].indexOf(k) < 0) out[k] = defaults[k]; });
    return out;
  }
  const api = { CAPS, supports, visible, effective, isData };
  root.PivotChartCaps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
