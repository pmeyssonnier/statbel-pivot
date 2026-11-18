/* Graphiques du tableau croisé : SVG généré sans bibliothèque (hors-ligne, export PNG/SVG possible).
 * Fonction pure build(res, opt) → { svg, w, h, note } ; res = résultat de PivotEngine.compute.
 * Types ici : bar, hbar, stack, stack100, hstack, hstack100, combo, pyramid, line, area, sarea (aires), pie, donut. Types ajoutés par chart-more.js (register) : treemap, scatter, map, kpi, gauge.
 * Séries = colonnes du tableau, catégories = lignes (les `max` premières, dans l'ordre affiché).
 * Exposé : globalThis.PivotChart / module.exports. */
(function (root) {
  'use strict';
  const TR = root.PivotChartTrend || (typeof require === 'function' ? require('./chart-trend.js') : null);
  const AX = root.PivotChartAxis || (typeof require === 'function' ? require('./chart-axis.js') : null);
  if (!AX) throw new Error('PivotChartAxis must load before PivotChart');
  const CAPS = root.PivotChartCaps || (typeof require === 'function' ? require('./chart-capabilities.js') : null);
  if (!CAPS) throw new Error('PivotChartCaps must load before PivotChart');
  const TYPES = { none: 'Aucun graphique', bar: 'Colonnes groupées', hbar: 'Barres horizontales', stack: 'Colonnes empilées', stack100: 'Colonnes empilées 100 %', hstack: 'Barres empilées (horizontales)', hstack100: 'Barres empilées 100 % (horizontales)', combo: 'Combiné : colonnes + ligne (2 valeurs)', pyramid: 'Pyramide (2 groupes face à face)', line: 'Lignes', area: 'Aires', sarea: 'Aires empilées', pie: 'Secteurs', donut: 'Anneau (donut)', treemap: 'Treemap (carte arborescente)', scatter: 'Nuage de points', map: 'Carte à bulles (géographique)', kpi: 'Indicateurs (KPI)', gauge: 'Jauges' };
  const REG = {};   // constructeurs des types ajoutés (chart-more.js) : (res, opt, ctx) → { svg, w, h, note }
  const PALETTE = ['#2f6fb3', '#e08a1e', '#3a9d6b', '#c0453f', '#8662c7', '#17a2b8', '#b5a02a', '#d6609a', '#6b7b8c', '#8a5a3c'];
  const PALS = {
    std: PALETTE,
    vif: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990', '#9a6324'],
    pastel: ['#8fb8de', '#f2c48d', '#9ed3b6', '#e8a09b', '#c3b1e1', '#8fd3dd', '#dcd08f', '#eab0cf', '#b4bec8', '#c9a58f'],
    bleus: ['#1b4f8a', '#2f6fb3', '#4f8fcf', '#76aedf', '#9cc6ea', '#bcd8f0', '#5b7fa6', '#34567a', '#8aa9c9', '#d3e4f4'],
    chaud: ['#a3261f', '#c0453f', '#e08a1e', '#e9b24a', '#b5a02a', '#8a5a3c', '#d6609a', '#7d3c98', '#c97b4a', '#f0d08a'],
    dalto: ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#999999', '#000000', '#8c564b']
  };
  const PAL_NAMES = { std: 'Standard', vif: 'Vives', pastel: 'Pastel', bleus: 'Camaïeu de bleus', chaud: 'Tons chauds', dalto: 'Daltonien' };
  const MAX_SERIES = 12, MAX_SLICES = 12;
  // Options d'un graphique (étiquettes, légende, palette, quadrillage, axe, repère, courbes lissées, ordre, titre) : valeurs relues toujours nettoyées
  function normOpts(o) {
    o = o && typeof o === 'object' ? o : {};
    const rng = (v, lo, hi, d) => { const x = Math.round(+v); return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(x) && x >= lo && x <= hi ? x : d; };   // entier borné ; hors bornes → défaut
    const en = (v, list, d) => (list.indexOf(v) >= 0 ? v : d), nm = v => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(+v) ? +v : null);
    return {
      lab: en(o.lab, ['none', 'value', 'pct', 'both'], 'none'), lpos: en(o.lpos, ['auto', 'in', 'out', 'top'], 'auto'), leg: en(o.leg, ['auto', 'bottom', 'top', 'right', 'none'], 'auto'),
      pal: Object.prototype.hasOwnProperty.call(PAL_NAMES, o.pal) ? o.pal : 'std', grid: o.grid !== false, smooth: o.smooth === true, trend: en(o.trend, ['auto','linear','none','poly2','poly3','ma'], 'auto'), trendWindow: rng(o.trendWindow, 2, 100, 3), trendEquation: o.trendEquation === true,
      ymin: nm(o.ymin), ymax: nm(o.ymax), step: nm(o.step) > 0 ? nm(o.step) : null, scale: en(o.scale, ['linear', 'log'], 'linear'), y2min: nm(o.y2min), y2max: nm(o.y2max), y2step: nm(o.y2step) > 0 ? nm(o.y2step) : null, ref: nm(o.ref), ord: en(o.ord, ['none', 'asc', 'desc'], 'none'),
      cdim: typeof o.cdim === 'string' ? o.cdim.slice(0, 200) : '', cdim2: typeof o.cdim2 === 'string' ? o.cdim2.slice(0, 200) : '',   // champ(s) du graphique (clés du catalogue) : lus par l'application, sans effet sur le rendu
      title: typeof o.title === 'string' ? o.title.slice(0, 120) : '', kpi: en(o.kpi, ['val', 'col'], 'val'),
      bar: rng(o.bar, 10, 100, 0), zoom: rng(o.zoom, 50, 200, 100), hole: rng(o.hole, 30, 85, 58),
      talign: en(o.talign, ['left', 'center', 'right'], 'left'), tvert: en(o.tvert, ['top', 'bottom', 'hidden'], 'top')
    };
  }
  // Configuration d'un graphique de vue (type, valeurs, max des jauges, position, options) : toujours relue nettoyée
  const CH_POS = ['top', 'bottom', 'left', 'right'];
  function normChart(c) {
    c = c && typeof c === 'object' ? c : {};
    const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v < hi ? v : d);
    return {
      type: typeof c.type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, c.type) ? c.type : 'none',
      k: int(c.k, 0, 20, 0), k2: int(c.k2, -1, 20, -1), gmax: Number.isFinite(c.gmax) && c.gmax > 0 ? c.gmax : 0,
      pos: CH_POS.indexOf(c.pos) >= 0 ? c.pos : 'top', o: normOpts(c.o)
    };
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  // Largeur d'un graphique (opt.width bornée) ; le contexte de rendu CX = { W, pal, th, color } est créé à chaque build (aucun état partagé)
  const widthOf = opt => Math.max((opt && opt.minW) || 420, Math.min(1800, Math.round(+((opt && opt.width) || 0)) || 760));
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const r1 = v => Math.round(v * 10) / 10;

  const ticks = AX.ticks;

  // Légende à retour à la ligne ; renvoie { svg, h }
  function legend(CX, items, y0, th) {
    let x = 12, y = y0, s = '';
    items.forEach(it => {
      const label = cut(it.label, 34), w = 32 + label.length * 7.2;
      if (x + w > CX.W - 8 && x > 12) { x = 12; y += 20; }
      s += `<rect x="${x}" y="${y - 9}" width="12" height="12" rx="2" fill="${it.color}"/><text x="${x + 17}" y="${y + 1}" fill="${th.ink}">${esc(label)}</text>`;
      x += w;
    });
    return { svg: s, h: y + 14 - y0 };
  }

  // Légende verticale (à droite) ; renvoie { svg, h }
  function legendV(items, x0, y0, th, wmax) {
    let s = '';
    items.forEach((it, i) => { const y = y0 + i * 20; s += `<rect x="${x0}" y="${y - 9}" width="12" height="12" rx="2" fill="${it.color}"/><text x="${x0 + 17}" y="${y + 1}" fill="${th.ink}">${esc(cut(it.label, Math.max(6, Math.floor((wmax - 20) / 6.6))))}</text>`; });
    return { svg: s, h: items.length * 20 };
  }
  // Texte d'une étiquette de donnée : valeur, pourcentage ou les deux
  function labText(mode, v, share, fmv) {
    if (v == null || mode === 'none') return '';
    const pc = share != null && isFinite(share) ? r1(share).toLocaleString('fr-BE') + ' %' : '';
    return mode === 'value' ? fmv(v) : mode === 'pct' ? pc : pc ? fmv(v) + ' (' + pc + ')' : fmv(v);
  }
  const HALO = 'paint-order="stroke" stroke-width="3" stroke-linejoin="round"';
  const tx = (x, y, t, th, anchor, extra) => `<text x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor || 'middle'}" font-size="10.5" fill="${th.ink}" stroke="${th.bg}" ${HALO}${extra || ''}>${esc(t)}</text>`;
  // Courbe lissée (Catmull-Rom → Bézier) passant par les points [[x, y], …]
  function curve(pts) {
    if (pts.length < 3) return 'M' + pts.map(q => q.join(',')).join(' L');
    let d = 'M' + pts[0].join(',');
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i - 1] || pts[i], b = pts[i], c = pts[i + 1], e = pts[i + 2] || c;
      d += ` C${r1(b[0] + (c[0] - a[0]) / 6)},${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)},${r1(c[1] - (e[1] - b[1]) / 6)} ${c[0]},${c[1]}`;
    }
    return d;
  }

  function wrapSvg(CX, inner, h, th) {
    const W = CX.W;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="12" role="img"><rect width="${W}" height="${h}" fill="${th.bg}"/>${inner}</svg>`;
  }

  function collect(res, opt) {
    const K = res.K, k = Math.min(Math.max(0, opt.k | 0), K - 1), spec = res.specs[k];
    const max = opt.max || 30;
    let rowsAll = res.rows;
    if (opt.O && opt.O.ord !== 'none') {   // tri des catégories par valeur (total de ligne de la valeur affichée)
      const ko = Number.isInteger(opt.ordK) && opt.ordK >= 0 && opt.ordK < K ? opt.ordK : k;
      const sg = opt.O.ord === 'asc' ? 1 : -1;
      // Keep missing values last in both directions. Avoid Infinity-Infinity => NaN in comparators.
      rowsAll = rowsAll.map((row, index) => ({ row, index, value: num(row.tot[ko]) }))
        .sort((a, b) => {
          if (a.value == null || b.value == null) return a.value == null && b.value == null ? a.index - b.index : a.value == null ? 1 : -1;
          return (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) * sg || a.index - b.index;
        }).map(item => item.row);
    }
    const cats = rowsAll.slice(0, max).map(r => ({ label: res.rowDims.length ? r.labels.join(' › ') : 'Total', r }));
    const hasCols = res.colDims.length > 0;
    const sCols = hasCols ? res.cols.slice(0, MAX_SERIES) : res.cols.slice(0, 1);
    const series = sCols.map((c, j) => ({ name: hasCols ? c.labels.join(' › ') : spec.label, values: cats.map(x => num(x.r.cells[j * K + k])) }));
    const notes = [];
    if (res.rows.length > max) notes.push(`${max} premières lignes sur ${res.rows.length} (triez ou filtrez pour choisir)`);
    if (hasCols && res.cols.length > MAX_SERIES) notes.push(`${MAX_SERIES} premières colonnes sur ${res.cols.length}`);
    return { k, spec, cats, series, hasCols, notes };
  }

  function pie(CX, res, opt, d, th) {
    const { W, color } = CX;
    // une seule série → ses valeurs ; sinon totaux de ligne
    let vals = d.cats.map((c, i) => (d.hasCols && res.cols.length > 1 ? num(c.r.tot[d.k]) : d.series[0] ? d.series[0].values[i] : null));
    let items = d.cats.map((c, i) => ({ label: c.label, v: vals[i] })).filter(x => x.v != null && x.v > 0);
    const neg = d.cats.length - items.length;
    if (items.length > MAX_SLICES) {
      const rest = items.slice(MAX_SLICES - 1).reduce((a, x) => a + x.v, 0);
      items = items.slice(0, MAX_SLICES - 1).concat([{ label: 'Autres', v: rest }]);
    }
    if (neg) d.notes.push(`${neg} valeur(s) nulle(s), négative(s) ou vide(s) ignorée(s)`);
    const total = items.reduce((a, x) => a + x.v, 0);
    if (!total) return null;
    // Légende : « auto » = à droite si large, dessous si étroit (tuile, téléphone) ; sinon à droite / dessous / dessus / masquée
    const narrow = W < 640, fm = v => opt.fmt(v, d.spec), donut = opt.type === 'donut', nIt = items.length, ROW = 22;
    const pos = opt.O.leg === 'auto' ? (narrow ? 'bottom' : 'right') : opt.O.leg, side = pos === 'right';
    // Étroit (tuile, téléphone) : la zone du disque = largeur moins la place RÉELLEMENT nécessaire à la légende (libellés + valeurs, estimation prudente 7,4 px/car.)
    const legNeed = side && narrow ? 18 + 14 + 7.4 * (Math.max(...items.map(x => Math.min(14, x.label.length))) + Math.max(...items.map(x => (fm(x.v) + ' · ' + r1(x.v / total * 100) + ' %').length))) : 0;
    const lx0 = side ? (narrow ? Math.max(Math.round(W * 0.4), Math.min(Math.round(W * 0.7), Math.round(W - legNeed - 12))) : Math.max(390, Math.round(W * 0.5))) : 0;   // x du bloc légende quand il est à droite du disque (valeur de base)
    const tile = opt.fitH > 0, rmaxS = tile ? 320 : 220, rmaxB = tile ? 320 : 200;   // plafond du rayon : relevé pour une tuile (grand écran, tuile large), inchangé pour le graphique du Pivot
    const rad0 = side ? Math.min(rmaxS, Math.round((lx0 - (narrow ? 24 : 40)) / 2)) : (narrow ? Math.max(70, Math.min(150, Math.round((W - 40) / 2))) : Math.min(rmaxB, Math.round((W - 40) / 2)));
    const capH = opt.fitH > 0 ? Math.floor((opt.fitH - (pos === 'top' || pos === 'bottom' ? nIt * ROW + 90 : 66)) / 2) : 1e9;   // tuile : taille automatique bornée par la hauteur voulue
    // Zoom : multiplie la taille AUTOMATIQUE (jamais bloqué par la hauteur de la tuile). Légende à droite : la zone du disque s'élargit avec le zoom
    // (la légende garde un minimum) ; sinon le disque est borné par la largeur du graphique.
    const want = Math.max(30, Math.round(Math.min(rad0, capH) * opt.O.zoom / 100));
    const lx = side ? Math.min(Math.max(lx0, 2 * want + 24), Math.max(lx0, W - (narrow ? 150 : 260))) : 0;
    const rad = Math.max(30, Math.min(want, side ? Math.floor((lx - 24) / 2) : Math.floor((W - 24) / 2)));
    const cx = side ? Math.round(lx / 2) : Math.round(W / 2);
    const lw = narrow ? W - 24 : Math.min(W - 24, 420), lgx = side ? lx : Math.round((W - lw) / 2), lgr = side ? W - 12 : lgx + lw;   // bloc légende : x de gauche, bord droit des valeurs
    let cy, ly0, h;
    if (pos === 'top') { ly0 = 46; cy = ly0 + (nIt - 1) * ROW + 24 + rad; h = cy + rad + 24; }
    else if (pos === 'bottom') { cy = rad + 36; ly0 = cy + rad + 28; h = ly0 + nIt * ROW + 8; }
    else if (pos === 'none') { cy = rad + 36; ly0 = 0; h = cy + rad + 24; }
    else { cy = rad + 36; ly0 = 40; h = Math.max(2 * rad + 60, 40 + nIt * ROW + 20); }
    let a0 = -Math.PI / 2, inner = '';
    const hole = donut ? Math.round(rad * opt.O.hole / 100) : 0;
    items.forEach((it, i) => {
      const part = it.v / total, a1 = a0 + part * 2 * Math.PI, tip = `<title>${esc(it.label)} : ${esc(fm(it.v))} (${r1(part * 100)} %)</title>`;
      if (items.length === 1) inner += donut ? `<path d="M${cx - rad},${cy} A${rad},${rad} 0 1 1 ${cx + rad},${cy} A${rad},${rad} 0 1 1 ${cx - rad},${cy} Z M${cx - hole},${cy} A${hole},${hole} 0 1 0 ${cx + hole},${cy} A${hole},${hole} 0 1 0 ${cx - hole},${cy} Z" fill-rule="evenodd" fill="${color(i)}">${tip}</path>` : `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${color(i)}">${tip}</circle>`;
      else {
        const x0 = cx + rad * Math.cos(a0), y0 = cy + rad * Math.sin(a0), x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1), lg = part > 0.5 ? 1 : 0;
        if (donut) {
          const u0 = cx + hole * Math.cos(a0), v0 = cy + hole * Math.sin(a0), u1 = cx + hole * Math.cos(a1), v1 = cy + hole * Math.sin(a1);
          inner += `<path d="M${r1(x0)},${r1(y0)} A${rad},${rad} 0 ${lg} 1 ${r1(x1)},${r1(y1)} L${r1(u1)},${r1(v1)} A${hole},${hole} 0 ${lg} 0 ${r1(u0)},${r1(v0)} Z" fill="${color(i)}" stroke="${th.bg}" stroke-width="1.5">${tip}</path>`;
        } else inner += `<path d="M${cx},${cy} L${r1(x0)},${r1(y0)} A${rad},${rad} 0 ${lg} 1 ${r1(x1)},${r1(y1)} Z" fill="${color(i)}" stroke="${th.bg}" stroke-width="1.5">${tip}</path>`;
      }
      if (opt.O.lab !== 'none' && part >= 0.06) {
        const am = (a0 + a1) / 2, rr = donut ? (rad + hole) / 2 : rad * 0.68, t = labText(opt.O.lab === 'both' && part < 0.1 ? 'pct' : opt.O.lab, it.v, part * 100, fm);
        inner += tx(cx + rr * Math.cos(am), cy + rr * Math.sin(am) + 4, t, th);
      }
      a0 = a1;
    });
    if (donut) inner += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="${Math.round(rad / 5.5)}" font-weight="700" fill="${th.ink}">${esc(fm(total))}</text><text x="${cx}" y="${cy + Math.round(rad / 6)}" text-anchor="middle" fill="${th.muted}">Total</text>`;
    if (pos !== 'none') items.forEach((it, i) => {
      const y = ly0 + i * ROW;
      inner += `<rect x="${lgx}" y="${y - 10}" width="12" height="12" rx="2" fill="${color(i)}"/><text x="${lgx + 18}" y="${y}" fill="${th.ink}">${esc(cut(it.label, side && narrow ? 14 : 30))}</text>`
        + `<text x="${lgr}" y="${y}" text-anchor="end" fill="${th.muted}">${esc(fm(it.v))} · ${r1(it.v / total * 100)} %</text>`;
    });
    return { svg: wrapSvg(CX, inner, h, th), h };
  }

  // Légende selon la position choisie ; renvoie les marges à réserver
  function legendLayout(CX, items, O, th) {
    const W = CX.W;
    if (!items.length || O.leg === 'none') return { top: 0, right: 0, draw: () => ({ svg: '', h: 0 }) };
    if (O.leg === 'right') { const wl = Math.min(220, Math.max(...items.map(i => cut(i.label, 34).length)) * 6.6 + 34); return { top: 0, right: wl, draw: (h, mt) => { const lg = legendV(items, W - wl + 6, mt + 10, th, wl); return { svg: lg.svg, h: Math.max(0, mt + 10 + lg.h - h + 10) }; } }; }
    if (O.leg === 'top') { const lg = legend(CX, items, 34, th); return { top: lg.h + 6, right: 0, top$: lg, draw: () => ({ svg: lg.svg, h: 0 }) }; }
    return { top: 0, right: 0, draw: h => { const lg = legend(CX, items, h + 8, th); return { svg: lg.svg, h: lg.h + 8 }; } };
  }

  // Échelle verticale/horizontale commune : bornes automatiques, surchargées par ymin/ymax
  const scaleOf = AX.scaleOf;

  // Titre d'un graphique : UN seul gabarit (TITLE_OPEN), que placeTitle retrouve pour le déplacer ; le texte par défaut est remplacé par O.title s'il est défini
  const TITLE_OPEN = '<text x="12" y="16" font-weight="700" fill="';
  const TITLE_RE = new RegExp(TITLE_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^"]*)">([\\s\\S]*?)<\\/text>');
  const byDims = res => (res.rowDims.length ? ' par ' + res.rowDims.join(' › ') : '');
  const baseTitle = (res, spec) => spec.label + byDims(res);
  const titleEl = (CX, O, text) => `${TITLE_OPEN}${CX.th.ink}">${esc(O.title || text)}</text>`;
  function titleOf(CX, res, d, O) { return titleEl(CX, O, baseTitle(res, d.spec)); }

  // Barres/colonnes (groupées, empilées, 100 %), lignes et aires
  // Cartesian SVG rendering lives in chart-cartesian.js; shared helpers are injected.
  // Combiné : colonnes (valeur choisie, axe de gauche) + ligne(s) (2e valeur, axe de droite)
  function combo(CX, res, opt, d, th, O) {
    const { W, color } = CX;
    if (res.K < 2) return { svg: '', w: 0, h: 0, note: 'Combiné : ajoutez une 2e valeur (ex. un pourcentage ou une moyenne) pour la superposer en ligne.' };
    const k2 = Number.isInteger(opt.k2) && opt.k2 >= 0 && opt.k2 < res.K && opt.k2 !== d.k ? opt.k2 : (d.k + 1) % res.K;
    const d2 = collect(res, Object.assign({}, opt, { k: k2, ordK: d.k })), fm = v => opt.fmt(v, d.spec), fm2 = v => opt.fmt(v, d2.spec);
    const S = d.series.length, n = d.cats.length, PH = Math.max(opt.minPH || 200, Math.min(opt.fit ? 900 : 640, Math.round(+opt.plotH) || 300));
    let hi1 = 0, lo1 = 0, hi2 = 0, lo2 = 0;
    d.series.forEach(s => s.values.forEach(v => { if (v != null) { hi1 = Math.max(hi1, v); lo1 = Math.min(lo1, v); } }));
    d2.series.forEach(s => s.values.forEach(v => { if (v != null) { hi2 = Math.max(hi2, v); lo2 = Math.min(lo2, v); } }));
    const pos2 = d2.series.flatMap(s => s.values).filter(v => v != null && v > 0);
    const log2 = O.scale === 'log';
    const A = scaleOf(lo1, hi1, Object.assign({}, O, { scale: 'linear' })), B = scaleOf(log2 ? (pos2.length ? Math.min(...pos2) : 0) : lo2, hi2, { ymin: O.y2min, ymax: O.y2max, step: O.y2step, scale: O.scale });
    if (B.invalid) return { svg: '', w: 0, h: 0, note: B.invalid };
    const catLab = d.cats.map(c => cut(c.label, 22)), rot = n > 6 || Math.max(...catLab.map(t => t.length)) > 9;
    const items = d.series.map((s, j) => ({ label: s.name, color: color(j) })).concat(d2.series.map((s, j) => ({ label: d.hasCols ? s.name + ' · ' + d2.spec.label : d2.spec.label, color: color(S + j) })));
    const LG = legendLayout(CX, items, O, th);
    let inner = titleEl(CX, O, d.spec.label + ' et ' + d2.spec.label + byDims(res)) + (LG.top ? LG.top$.svg : '');
    const mt = 30 + LG.top, ml = Math.max(...A.tk.map(v => fm(v).length)) * 6.6 + 20, mrr = Math.max(...B.tk.map(v => fm2(v).length)) * 6.6 + 20, mr = mrr + LG.right, ph = PH, pw = W - ml - mr, mb = rot ? Math.min(110, Math.max(...catLab.map(t => t.length)) * 4 + 22) : 26;
    const yA = v => mt + ph * (1 - A.ratio(v)), yB = v => mt + ph * (1 - B.ratio(v)), band = pw / n, X = i => ml + band * (i + 0.5);
    A.tk.forEach(v => { inner += (O.grid ? `<line x1="${ml}" y1="${r1(yA(v))}" x2="${ml + pw}" y2="${r1(yA(v))}" stroke="${th.line}"/>` : '') + `<text x="${ml - 6}" y="${r1(yA(v) + 4)}" text-anchor="end" fill="${th.muted}">${esc(fm(v))}</text>`; });
    B.tk.forEach(v => { inner += `<text x="${ml + pw + 6}" y="${r1(yB(v) + 4)}" fill="${color(S)}">${esc(fm2(v))}</text>`; });
    const lab = [], catTot = d.cats.map((_, i) => d.series.reduce((a, s) => a + (s.values[i] > 0 ? s.values[i] : 0), 0)), tot2 = d2.series[0].values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
    d.cats.forEach((c, i) => {
      const cx = X(i), ty = mt + ph + 14, gw = band * (O.bar ? O.bar / 100 : 0.7), bw = gw / S;
      inner += rot ? `<text transform="translate(${r1(cx + 4)},${ty}) rotate(-40)" text-anchor="end" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>` : `<text x="${r1(cx)}" y="${ty + 2}" text-anchor="middle" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>`;
      d.series.forEach((s, j) => {
        const v = s.values[i]; if (v == null) return;
        const ya = yA(Math.max(0, v)), yb = yA(Math.min(0, v)), bx = cx - gw / 2 + j * bw;
        inner += `<rect x="${r1(bx)}" y="${r1(ya)}" width="${r1(Math.max(1, bw - 1))}" height="${Math.max(0.5, r1(yb - ya))}" fill="${color(j)}"><title>${esc(c.label + (S > 1 ? ' · ' + s.name : ''))} : ${esc(fm(v))}</title></rect>`;
        const t = labText(O.lab, v, S > 1 ? (catTot[i] > 0 ? v / catTot[i] * 100 : null) : null, fm); if (t && bw >= 14) lab.push(O.lpos === 'in' && yb - ya >= 14 && bw >= t.length * 5.6 + 4 ? tx(bx + bw / 2, (ya + yb) / 2 + 4, t, th) : tx(bx + bw / 2, ya - 4, t, th));
      });
    });
    d2.series.forEach((s, j) => {
      const col = color(S + j); let seg = [];
      const flush = () => { if (seg.length > 1) inner += `<path d="${O.smooth ? curve(seg) : 'M' + seg.map(q => q.join(',')).join(' L')}" fill="none" stroke="${col}" stroke-width="2.5"/>`; seg = []; };
      s.values.forEach((v, k) => { if (v == null || (log2 && v <= 0)) { flush(); return; } seg.push([r1(X(k)), r1(yB(v))]); }); flush();
      s.values.forEach((v, k) => { if (v == null || (log2 && v <= 0)) return; inner += `<circle cx="${r1(X(k))}" cy="${r1(yB(v))}" r="4" fill="${col}" stroke="${th.bg}" stroke-width="1.5"><title>${esc(d2.cats[k].label + ' · ' + d2.spec.label)} : ${esc(fm2(v))}</title></circle>`; const t = labText(O.lab === 'pct' ? (tot2 > 0 ? 'pct' : 'none') : O.lab, v, tot2 > 0 ? v / tot2 * 100 : null, fm2); if (t) lab.push(tx(X(k), yB(v) - 9, t, th, 'middle', ` fill-opacity="1"`)); });
    });
    inner += `<line x1="${ml}" y1="${r1(yA(0))}" x2="${ml + pw}" y2="${r1(yA(0))}" stroke="${th.muted}"/>` + lab.join('');
    if (O.ref != null && O.ref >= A.tmin && O.ref <= A.tmax) inner += `<line x1="${ml}" y1="${r1(yA(O.ref))}" x2="${ml + pw}" y2="${r1(yA(O.ref))}" stroke="#c0453f" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${ml + pw}" y="${r1(yA(O.ref) - 4)}" text-anchor="end" font-size="10.5" fill="#c0453f">${esc('Repère ' + fm(O.ref))}</text>`;
    let h = mt + ph + mb;
    const lg = LG.draw(h, mt); inner += lg.svg; h += lg.h;
    return { svg: wrapSvg(CX, inner, h, th), w: W, h, note: d.notes.concat(d2.notes.filter(x => !d.notes.includes(x))).join(' · ') };
  }

  // Pyramide : deux groupes face à face (ex. hommes / femmes par classe d'âge) ; la première ligne est en bas
  function pyramid(CX, res, opt, d, th, O) {
    const { W, color } = CX;
    let L, R, nameL, nameR, fmL = v => opt.fmt(v, d.spec), fmR = fmL;
    if (d.series.length >= 2) { L = d.series[0].values; R = d.series[1].values; nameL = d.series[0].name; nameR = d.series[1].name; if (d.series.length > 2) d.notes.push('Pyramide : seules les deux premières colonnes sont comparées'); }
    else if (res.K >= 2) {
      const k2 = Number.isInteger(opt.k2) && opt.k2 >= 0 && opt.k2 < res.K && opt.k2 !== d.k ? opt.k2 : (d.k + 1) % res.K, d2 = collect(res, Object.assign({}, opt, { k: k2, ordK: d.k }));
      L = d.series[0].values; R = d2.series[0].values; nameL = d.spec.label; nameR = d2.spec.label; fmR = v => opt.fmt(v, d2.spec);
    } else return { svg: '', w: 0, h: 0, note: 'Pyramide : placez en colonnes un champ à 2 modalités (ex. Sexe) ou ajoutez une 2e valeur ; les lignes sont les classes (ex. âge, première ligne en bas).' };
    const n = d.cats.length, absMax = Math.max(1e-9, ...L.concat(R).map(v => (v == null ? 0 : Math.abs(v)))), tk = ticks(0, absMax).filter(v => v >= 0), tmax = tk[tk.length - 1] || 1;
    const sumAll = L.concat(R).reduce((a, v) => a + (v > 0 ? v : 0), 0), catLab = d.cats.map(c => cut(c.label, 22));
    const items = [{ label: nameL, color: color(0) }, { label: nameR, color: color(1) }], LG = legendLayout(CX, items, O, th);
    const mt = 30 + LG.top, ml = Math.min(160, Math.max(46, Math.max(...catLab.map(t => t.length)) * 6.2 + 12)), mr = 14 + LG.right, pw = W - ml - mr, cx = ml + pw / 2, half = pw / 2 - 4, band = opt.fit ? Math.max(O.bar ? 24 : 18, Math.min(52, Math.round(+opt.plotH) / n)) : (O.bar ? Math.max(24, Math.min(44, 420 / n + 8)) : Math.max(18, Math.min(30, 320 / n + 6))), ph = n * band, bh = O.bar ? Math.max(2, band * O.bar / 100) : band - 4;
    const xv = v => half * v / tmax;
    let inner = titleEl(CX, O, 'Pyramide : ' + nameL + ' / ' + nameR + byDims(res)) + (LG.top ? LG.top$.svg : '');
    const fmA = d.series.length >= 2 || res.K < 2 ? fmL : v => r1(v).toLocaleString('fr-BE');
    tk.forEach(v => {
      [-1, 1].forEach(sg => { if (v === 0 && sg === 1) return; const x = cx + sg * xv(v); inner += (O.grid ? `<line x1="${r1(x)}" y1="${mt}" x2="${r1(x)}" y2="${mt + ph}" stroke="${th.line}"/>` : '') + `<text x="${r1(x)}" y="${mt + ph + 16}" text-anchor="middle" fill="${th.muted}">${esc(fmA(v))}</text>`; });
    });
    const lab = [];
    d.cats.forEach((c, i) => {
      const y0 = mt + (n - 1 - i) * band + 2;
      inner += `<text x="${ml - 6}" y="${r1(y0 + bh / 2 + 4)}" text-anchor="end" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>`;
      [[L[i], -1, 0, fmL], [R[i], 1, 1, fmR]].forEach(([v, sg, j, f]) => {
        if (v == null || !(v > 0)) return;
        const w = Math.max(0.5, xv(v)), x = sg < 0 ? cx - w : cx;
        inner += `<rect x="${r1(x)}" y="${r1(y0)}" width="${r1(w)}" height="${bh}" fill="${color(j)}"><title>${esc(c.label + ' · ' + (j ? nameR : nameL))} : ${esc(f(v))}${sumAll > 0 ? ' (' + r1(v / sumAll * 100).toLocaleString('fr-BE') + ' %)' : ''}</title></rect>`;
        const t = labText(O.lab, v, sumAll > 0 ? v / sumAll * 100 : null, f);
        if (t) lab.push(O.lpos === 'in' && w >= t.length * 5.8 + 6 ? tx(x + w / 2, y0 + bh / 2 + 4, t, th) : tx(sg < 0 ? x - 4 : x + w + 4, y0 + bh / 2 + 4, t, th, sg < 0 ? 'end' : 'start'));
      });
    });
    inner += `<line x1="${r1(cx)}" y1="${mt}" x2="${r1(cx)}" y2="${mt + ph}" stroke="${th.muted}"/>` + lab.join('');
    let h = mt + ph + 28;
    const lg = LG.draw(h, mt); inner += lg.svg; h += lg.h;
    return { svg: wrapSvg(CX, inner, h, th), w: W, h, note: d.notes.join(' · ') };
  }

  // Titre du graphique : alignement (gauche / centre / droite) et place (haut / bas / masqué) — appliqué après construction, pour tous les types
  function placeTitle(r, O, W) {
    if (!r.svg || (O.talign === 'left' && O.tvert === 'top')) return r;
    const re = TITLE_RE, m = re.exec(r.svg);
    if (!m) return r;
    let svg = r.svg.replace(re, () => ''), h = r.h;
    if (O.tvert === 'hidden') return Object.assign({}, r, { svg });
    const x = O.talign === 'center' ? Math.round(W / 2) : O.talign === 'right' ? W - 12 : 12, anchor = O.talign === 'center' ? 'middle' : O.talign === 'right' ? 'end' : 'start';
    let y = 16;
    if (O.tvert === 'bottom') {
      const nh = h + 28; y = h + 18;
      svg = svg.replace(`viewBox="0 0 ${W} ${h}" width="${W}" height="${h}"`, `viewBox="0 0 ${W} ${nh}" width="${W}" height="${nh}"`).replace(`<rect width="${W}" height="${h}"`, `<rect width="${W}" height="${nh}"`);
      h = nh;
    }
    const t = `<text x="${x}" y="${y}" text-anchor="${anchor}" font-weight="700" fill="${m[1]}">${m[2]}</text></svg>`;
    svg = svg.replace(/<\/svg>$/, () => t);
    return Object.assign({}, r, { svg, h });
  }
  // opt.fitH : hauteur TOTALE voulue (tuile du tableau de bord). La hauteur du tracé est cherchée par essais successifs (la hauteur totale
  // = tracé + titre / axes / légende, ou n × épaisseur de barre bornée) : le graphique épouse la tuile au lieu d'avoir une taille fixe.
  function fitBuild(res, opt) {
    const no = normOpts(opt.o), wd = widthOf(opt), one = ph => placeTitle(buildCore(res, Object.assign({}, opt, { plotH: ph, minPH: 60, fit: true })), no, wd);
    let ph = 200, r = one(ph);
    if (!r.svg || !r.h) return r;
    for (let i = 0; i < 3; i++) {
      const slope = (one(ph + 60).h - r.h) / 60;
      if (!(slope > 0.2)) break;   // hauteur indépendante du tracé (secteurs, KPI, jauges) ou bornée : rien à ajuster
      const next = Math.max(60, Math.min(900, Math.round(ph + (opt.fitH - r.h) / slope)));
      if (Math.abs(next - ph) < 2) break;
      ph = next; r = one(ph);
    }
    return r;
  }
  function build(res, opt) {
    if (opt && opt.fitH > 0) return fitBuild(res, opt);
    const r = buildCore(res, opt);
    return placeTitle(r, normOpts(opt && opt.o), widthOf(opt));
  }
  function buildCore(res, opt) {
    const W = widthOf(opt);
    const O = CAPS.effective(opt.type, normOpts(opt.o), normOpts());   // options sans effet sur ce type : valeurs par défaut au rendu
    opt = Object.assign({}, opt, { O });
    const PH = Math.max(opt.minPH || 200, Math.min(opt.fit ? 900 : 640, Math.round(+opt.plotH) || 300));
    const th = Object.assign({ bg: '#ffffff', ink: '#1b2733', muted: '#5a6b7b', line: '#d9e1e8' }, opt.theme || {});
    const pal = PALS[O.pal], CX = { W, pal, th, color: i => pal[i % pal.length] };   // contexte de rendu propre à ce graphique
    if (!res || res.empty || !res.rows.length || !TYPES[opt.type] || opt.type === 'none') return { svg: '', w: 0, h: 0, note: '' };
    if (REG[opt.type]) {
      const o = Object.assign({}, opt, { max: opt.type === 'kpi' || opt.type === 'gauge' ? 12 : 300 });
      const dd = collect(res, o);
      const out = REG[opt.type](res, o, { fit: !!opt.fit, title: text => titleEl(CX, O, text), titleBase: () => baseTitle(res, dd.spec), W, PH, th, esc, cut, color: CX.color, num, r1, ticks, wrapSvg: (inner, h) => wrapSvg(CX, inner, h, th), legend: (items, y0) => legend(CX, items, y0, th), spec: dd.spec, fm: v => opt.fmt(v, dd.spec), collected: dd, palette: pal, O, labText: (v, share, fmv) => labText(O.lab, v, share, fmv) });
      return out || { svg: '', w: 0, h: 0, note: '' };
    }
    const type = opt.type, d = collect(res, Object.assign({}, opt, { ordK: undefined }));
    if (!d.cats.length || !d.series.length) return { svg: '', w: 0, h: 0, note: '' };
    if (type === 'pie' || type === 'donut') {
      const p = pie(CX, res, opt, d, th);
      if (!p) return { svg: '', w: 0, h: 0, note: 'Rien à représenter (aucune valeur positive).' };
      return { svg: p.svg.replace('</svg>', () => titleOf(CX, res, d, O) + '</svg>'), w: W, h: p.h, note: d.notes.join(' · ') };
    }
    if (type === 'combo') return combo(CX, res, opt, d, th, O);
    if (type === 'pyramid') return pyramid(CX, res, opt, d, th, O);
    const CART = root.PivotChartCartesian || (typeof require === 'function' ? require('./chart-cartesian.js') : null);
    if (!CART) throw new Error('PivotChartCartesian must load before PivotChart.build');
    return CART.cartesian(res, opt, d, th, O, { r1, labText, scaleOf, cut, color: CX.color, legendLayout: (items, O2, th2) => legendLayout(CX, items, O2, th2), titleOf: (res2, d2, O2) => titleOf(CX, res2, d2, O2), esc, W, tx, curve, TR, wrapSvg: (inner, h) => wrapSvg(CX, inner, h, th) });
  }

  const api = { build, TYPES, ticks, MAX_SERIES, normOpts, normChart, caps: CAPS, PALETTES: PAL_NAMES, register: (type, fn) => { REG[type] = fn; } };
  root.PivotChart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
