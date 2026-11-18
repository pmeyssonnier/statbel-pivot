/* Graphiques supplémentaires du tableau croisé (s'enregistrent auprès de chart.js) :
 *  treemap (carte arborescente), scatter (nuage de points), kpi (indicateurs), gauge (jauges), map (carte à bulles).
 * Même principe que chart.js : fonctions pures qui produisent un SVG (hors-ligne, export PNG/SVG).
 * Chaque constructeur reçoit (res, opt, ctx) et renvoie { svg, w, h, note }. */
(function (root) {
  'use strict';
  const PC = (typeof module !== 'undefined' && module.exports) ? require('./chart.js') : root.PivotChart;
  const TR = root.PivotChartTrend || (typeof require === 'function' ? require('./chart-trend.js') : null);
  const normLabel = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const NONE = note => ({ svg: '', w: 0, h: 0, note });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- treemap : rectangles proportionnels, regroupés par premier niveau de ligne si plusieurs ---------- */
  // Disposition « squarified » (Bruls et al.) : vals = [{ v }] triées par valeur décroissante → [{ it, x, y, w, h }]
  function squarify(vals, x, y, w, h) {
    const out = [], total = vals.reduce((a, b) => a + b.v, 0);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total;
    let rest = vals.map(it => ({ it, a: it.v * scale }));
    const worst = (areas, s) => { const sum = areas.reduce((a, b) => a + b, 0), mx = Math.max(...areas), mn = Math.min(...areas); return Math.max((s * s * mx) / (sum * sum), (sum * sum) / (s * s * mn)); };
    while (rest.length) {
      const side = Math.min(w, h);
      let cur = [], i = 0;
      while (i < rest.length) {
        const test = cur.concat(rest[i].a);
        if (!cur.length || worst(test, side) <= worst(cur, side)) { cur = test; i++; } else break;
      }
      const sum = cur.reduce((a, b) => a + b, 0);
      if (w >= h) { const cw = sum / h; let yy = y; cur.forEach((a, j) => { const hh = a / cw; out.push({ it: rest[j].it, x, y: yy, w: cw, h: hh }); yy += hh; }); x += cw; w -= cw; }
      else { const rh = sum / w; let xx = x; cur.forEach((a, j) => { const ww = a / rh; out.push({ it: rest[j].it, x: xx, y, w: ww, h: rh }); xx += ww; }); y += rh; h -= rh; }
      rest = rest.slice(cur.length);
    }
    return out;
  }

  PC.register('treemap', (res, opt, c) => {
    const k = c.collected.k, { esc, cut, color, r1, th, W } = c;
    const items = res.rows.slice(0, 300).map(r => ({ label: r.labels.length ? r.labels.join(' › ') : 'Total', labels: r.labels, v: c.num(r.tot[k]) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    if (!items.length) return NONE('Rien à représenter (aucune valeur positive).');
    const total = items.reduce((a, b) => a + b.v, 0), H = c.fit ? c.PH + 150 : clamp(c.PH + 150, 320, 720), top = 26, nested = res.rowDims.length >= 2;
    const hasMore = res.rows.length > 300;
    let inner = c.title(c.titleBase());
    const pct = v => (Math.round(v / total * 1000) / 10).toLocaleString('fr-BE') + ' %';
    const cell = (r, col, op, name, big) => {
      const w = r.w, h = r.h, fit = Math.floor((w - 6) / 6.3);
      let s = `<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${Math.max(0, r1(w))}" height="${Math.max(0, r1(h))}" fill="${col}" fill-opacity="${op}" stroke="${th.bg}" stroke-width="1.5"><title>${esc(name)} : ${esc(c.fm(r.it.v))} (${pct(r.it.v)})</title></rect>`;
      if (w > 44 && h > 20 && fit >= 3) {
        s += `<text x="${r1(r.x + 4)}" y="${r1(r.y + 14)}" fill="#fff" font-weight="600" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2.5px">${esc(cut(name, fit))}</text>`;
        if (h > 38) s += `<text x="${r1(r.x + 4)}" y="${r1(r.y + 28)}" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2.5px">${esc(cut(c.O.lab === 'none' ? c.fm(r.it.v) : c.labText(r.it.v, r.it.v / total * 100, c.fm), fit))}</text>`;
      }
      return s;
    };
    if (!nested) {
      squarify(items, 6, top, W - 12, H - top - 6).forEach((r, i) => { inner += cell(r, color(i), 0.92, r.it.label); });
    } else {
      const groups = new Map();
      items.forEach(it => { const g = it.labels[0]; (groups.get(g) || groups.set(g, { label: g, v: 0, kids: [] }).get(g)).v += it.v; groups.get(g).kids.push({ label: it.labels.slice(1).join(' › '), v: it.v, full: it.label }); });
      const gl = [...groups.values()].sort((a, b) => b.v - a.v);
      squarify(gl, 6, top, W - 12, H - top - 6).forEach((g, gi) => {
        const col = color(gi), hdr = g.h > 46 && g.w > 60 ? 16 : 0;
        inner += `<rect x="${r1(g.x)}" y="${r1(g.y)}" width="${r1(g.w)}" height="${r1(g.h)}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="1.5"><title>${esc(g.it.label)} : ${esc(c.fm(g.it.v))} (${pct(g.it.v)})</title></rect>`;
        if (hdr) inner += `<text x="${r1(g.x + 4)}" y="${r1(g.y + 12)}" fill="${th.ink}" font-weight="700">${esc(cut(g.it.label, Math.floor((g.w - 6) / 6.5)))}</text>`;
        squarify(g.it.kids.sort((a, b) => b.v - a.v), g.x + 2, g.y + hdr + 1, g.w - 4, g.h - hdr - 3).forEach((r, ci) => { inner += cell(r, col, 0.95 - Math.min(0.4, ci * 0.07), r.it.full, false); });
      });
    }
    return { svg: c.wrapSvg(inner, H), w: W, h: H, note: [c.collected.notes.length ? '' : '', hasMore ? '300 premières lignes (triez ou filtrez pour choisir)' : '', 'Surface proportionnelle à la valeur (lignes à valeur positive)'].filter(Boolean).join(' · ') };
  });

  /* ---------- nuage de points : deux indicateurs croisés (un point par ligne), droite de tendance et R² ---------- */
  PC.register('scatter', (res, opt, c) => {
    const K = res.K, { esc, cut, color, r1, th, W, PH } = c;
    if (K < 2) return NONE('Nuage de points : ajoutez une deuxième valeur dans « Valeurs » pour croiser deux indicateurs.');
    const kx = c.collected.k, ky = Number.isInteger(opt.k2) && opt.k2 >= 0 && opt.k2 < K && opt.k2 !== kx ? opt.k2 : (kx + 1) % K;
    const fx = v => opt.fmt(v, res.specs[kx]), fy = v => opt.fmt(v, res.specs[ky]);
    const pts = res.rows.slice(0, 300).map(r => ({ label: r.labels.length ? r.labels.join(' › ') : 'Total', x: c.num(r.tot[kx]), y: c.num(r.tot[ky]) })).filter(p => p.x != null && p.y != null);
    if (pts.length < 2) return NONE('Pas assez de points à représenter (au moins deux lignes avec les deux valeurs).');
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), mn = a => Math.min(...a), mx = a => Math.max(...a);
    const tkx = c.ticks(mn(xs), mx(xs)), tky = c.ticks(mn(ys), mx(ys)), x0 = tkx[0], x1 = tkx[tkx.length - 1], y0 = tky[0], y1 = tky[tky.length - 1];
    const ylab = tky.map(fy), lw = Math.max(...ylab.map(t => t.length)) * 6.6 + 30;
    const ml = lw, mr = 18, mt = 30, mb = 46, pw = W - ml - mr, ph = PH, H = mt + ph + mb;
    const X = v => ml + pw * (v - x0) / ((x1 - x0) || 1), Y = v => mt + ph * (1 - (v - y0) / ((y1 - y0) || 1));
    let inner = c.title(res.specs[ky].label + ' selon ' + res.specs[kx].label);
    tkx.forEach(v => { inner += `<line x1="${r1(X(v))}" y1="${mt}" x2="${r1(X(v))}" y2="${mt + ph}" stroke="${th.line}"/><text x="${r1(X(v))}" y="${mt + ph + 16}" text-anchor="middle" fill="${th.muted}">${esc(fx(v))}</text>`; });
    tky.forEach((v, i) => { inner += `<line x1="${ml}" y1="${r1(Y(v))}" x2="${ml + pw}" y2="${r1(Y(v))}" stroke="${th.line}"/><text x="${ml - 6}" y="${r1(Y(v) + 4)}" text-anchor="end" fill="${th.muted}">${esc(ylab[i])}</text>`; });
    inner += `<text x="${ml + pw / 2}" y="${H - 8}" text-anchor="middle" fill="${th.ink}">${esc(cut(res.specs[kx].label, 60))}</text><text transform="translate(14,${mt + ph / 2}) rotate(-90)" text-anchor="middle" fill="${th.ink}">${esc(cut(res.specs[ky].label, 50))}</text>`;
    const n = pts.length, mxm = xs.reduce((a,b)=>a+b,0)/n, mym = ys.reduce((a,b)=>a+b,0)/n;
    const sxx = pts.reduce((s,p)=>s+(p.x-mxm)**2,0), syy = pts.reduce((s,p)=>s+(p.y-mym)**2,0);
    // options du panneau (opt.O) ; « auto » = droite de régression ; opt.trend (racine) reste accepté
    const trendMode = opt.O && opt.O.trend !== 'auto' ? opt.O.trend : (opt.trend || 'linear'), showEq = !!((opt.O && opt.O.trendEquation) || opt.trendEquation);
    const fit = TR.polynomial(pts, trendMode === 'poly2' ? 2 : trendMode === 'poly3' ? 3 : 1);
    let note = '';
    if (fit && trendMode !== 'none' && trendMode !== 'ma') {
      const xa = mn(xs), xb = mx(xs), steps = fit.degree === 1 ? 1 : 48;
      const path = Array.from({length:steps+1},(_,i)=>{const x=xa+(xb-xa)*i/steps;return (i?'L':'M')+r1(X(x))+','+r1(Y(fit.predict(x)));}).join(' ');
      inner += `<path d="${path}" fill="none" stroke="${th.muted}" stroke-width="1.5" stroke-dasharray="6 4"><title>Tendance ${fit.degree === 1 ? 'linéaire' : 'polynomiale'}</title></path>`;
      note = `Tendance ${fit.degree === 1 ? 'linéaire' : 'polynomiale'} : R² = ${fit.r2 == null ? 'n/d' : (Math.round(fit.r2*1000)/1000).toLocaleString('fr-BE')}${showEq ? ' · '+TR.equation(fit) : ''} · ${n} point(s)`;
    }
    pts.forEach(p => { inner += `<circle cx="${r1(X(p.x))}" cy="${r1(Y(p.y))}" r="5" fill="${color(0)}" fill-opacity="0.68" stroke="${color(0)}"><title>${esc(p.label)} : ${esc(fx(p.x))} ; ${esc(fy(p.y))}</title></circle>`; });
    // étiquettes : les points les plus éloignés du centre du nuage
    const sx = Math.sqrt(sxx / n) || 1, sy = Math.sqrt(syy / n) || 1;
    pts.map(p => ({ p, d: ((p.x - mxm) / sx) ** 2 + ((p.y - mym) / sy) ** 2 })).sort((a, b) => b.d - a.d).slice(0, 8).forEach(({ p }) => {
      inner += `<text x="${r1(X(p.x) + 8)}" y="${r1(Y(p.y) - 7)}" fill="${th.ink}" font-size="11" style="paint-order:stroke;stroke:${th.bg};stroke-width:3px">${esc(cut(p.label, 22))}</text>`;
    });
    return { svg: c.wrapSvg(inner, H), w: W, h: H, note: [note, res.rows.length > 300 ? '300 premières lignes' : ''].filter(Boolean).join(' · ') };
  });

  /* ---------- indicateurs (KPI) : cartes (liseré de couleur, grande valeur centrée, libellé en capitales) ----------
   * Mode « par valeur » : une carte par champ de valeur (total, évolution entre les deux dernières colonnes, mini-courbe).
   * Mode « par colonne » : une carte par colonne du tableau pour la valeur choisie, avec sa part du total. */
  PC.register('kpi', (res, opt, c) => {
    const K = res.K, { esc, cut, color, r1, th, W } = c, nc = res.cols.length, byCol = c.O.kpi === 'col' && res.colDims.length > 0 && nc >= 1;
    const k0 = c.collected.k, trend = !byCol && res.colDims.length > 0 && nc >= 2;
    const cards = byCol
      ? res.cols.slice(0, 12).map((cl, j) => ({ label: cl.labels.join(' › '), v: c.num(res.bottom[j * K + k0]), spec: res.specs[k0], idx: j, j }))
      : res.specs.map((s, k) => ({ label: s.label, v: res.grand[k], spec: s, idx: k, k }));
    const n = cards.length, cols = W < 520 ? Math.min(n, 2) : W < 800 ? Math.min(n, 3) : Math.min(n, 4), gap = 12, cw = (W - 24 - gap * (cols - 1)) / cols, chh = trend ? 132 : 104, rows = Math.ceil(n / cols);
    const H = 30 + rows * (chh + gap);
    const tot = byCol ? cards.reduce((a, x) => a + (x.v > 0 ? x.v : 0), 0) : 0;
    let inner = c.title(byCol ? c.spec.label + ' par ' + res.colDims.join(' › ') : 'Indicateurs clés');
    cards.forEach(cd => {
      const x = 12 + (cd.idx % cols) * (cw + gap), y = 28 + Math.floor(cd.idx / cols) * (chh + gap), mid = x + cw / 2, v = cd.v;
      inner += `<rect x="${r1(x)}" y="${y}" width="${r1(cw)}" height="${chh}" rx="8" fill="${th.bg}" stroke="${th.line}"/><path d="M${r1(x)},${y + 8} a8,8 0 0 1 8,-8 h${r1(cw - 16)} a8,8 0 0 1 8,8 v-4 h-${r1(cw)} z" fill="${color(cd.idx)}"/>`
        + `<text x="${r1(mid)}" y="${y + 56}" text-anchor="middle" font-size="${cw < 150 ? 24 : 30}" font-weight="700" fill="${th.ink}"><title>${esc(cd.label)}</title>${esc(v == null ? '—' : opt.fmt(v, cd.spec))}</text>`
        + `<text x="${r1(mid)}" y="${y + 78}" text-anchor="middle" font-size="11" letter-spacing=".6" fill="${th.muted}">${esc(cut(cd.label, Math.floor((cw - 16) / 7)).toUpperCase())}</text>`;
      if (byCol && tot > 0 && v > 0) inner += `<text x="${r1(mid)}" y="${y + 96}" text-anchor="middle" font-size="12" fill="${th.muted}">${(Math.round(v / tot * 1000) / 10).toLocaleString('fr-BE')} % du total</text>`;
      if (trend) {
        const k = cd.k, tt = res.cols.map((_, j) => c.num(res.bottom[j * K + k]));
        const last = tt[nc - 1], prev = tt[nc - 2], lab = res.cols[nc - 2].labels.join(' › ');
        if (last != null && prev != null && prev !== 0) {
          const dp = (last - prev) / Math.abs(prev) * 100, up = dp > 0.05, dn = dp < -0.05;
          inner += `<text x="${r1(mid)}" y="${y + 98}" text-anchor="middle" fill="${up ? '#3a9d6b' : dn ? '#c0453f' : th.muted}" font-weight="600">${up ? '▲' : dn ? '▼' : '■'} ${(dp > 0 ? '+' : '') + (Math.round(dp * 10) / 10).toLocaleString('fr-BE')} % <tspan fill="${th.muted}" font-weight="400">vs ${esc(cut(lab, 22))}</tspan></text>`;
        }
        const vals = tt.filter(t => t != null);
        if (vals.length > 1) {
          const lo = Math.min(...vals), hi = Math.max(...vals), sx = x + 16, sw = cw - 32, sy = y + chh - 12, sh = 16;
          const pts = tt.map((t, j) => (t == null ? null : [r1(sx + sw * j / (nc - 1)), r1(sy - sh * ((t - lo) / ((hi - lo) || 1)))])).filter(Boolean);
          inner += `<polyline points="${pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="${color(cd.idx)}" stroke-width="2"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3" fill="${color(cd.idx)}"/>`;
        }
      }
    });
    return { svg: c.wrapSvg(inner, H), w: W, h: H, note: byCol ? 'Une carte par colonne du tableau (part du total sous la valeur)' : trend ? 'Évolution : dernière colonne comparée à l\'avant-dernière' : 'Totaux du tableau (ajoutez un champ en colonnes, ex. l\'année, pour voir l\'évolution ; option « Cartes » pour une carte par colonne)' };
  });

  /* ---------- jauges : valeur totale par rapport à un maximum (objectif) ---------- */
  PC.register('gauge', (res, opt, c) => {
    const K = res.K, { esc, cut, color, r1, th, W } = c;
    const cols = W < 520 ? 1 : W < 800 ? Math.min(K, 2) : Math.min(K, 3), gap = 12, cw = (W - 24 - gap * (cols - 1)) / cols, R = clamp(Math.floor((cw - 48) / 2), 50, 100), ch = R + 86, rows = Math.ceil(K / cols);
    const H = 30 + rows * (ch + gap), gmax = Number.isFinite(opt.gmax) && opt.gmax > 0 ? opt.gmax : null;
    let inner = c.title('Jauges');
    const notes = [];
    res.specs.forEach((s, k) => {
      const x = 12 + (k % cols) * (cw + gap), y = 28 + Math.floor(k / cols) * (ch + gap), v = res.grand[k];
      const pctSpec = /^pct/.test(s.agg || '');
      const max = gmax || (pctSpec ? 100 : (v != null && v > 0 ? c.ticks(0, v * 1.25).pop() : 1));
      const frac = v == null ? 0 : clamp(v / max, 0, 1), cx = x + cw / 2, cy = y + R + 34, th0 = Math.PI * (1 + frac);
      const px = Math.cos(th0) * R + cx, py = Math.sin(th0) * R + cy;
      inner += `<rect x="${r1(x)}" y="${y}" width="${r1(cw)}" height="${ch}" rx="8" fill="${th.bg}" stroke="${th.line}"/>`
        + `<text x="${r1(cx)}" y="${y + 20}" text-anchor="middle" fill="${th.muted}">${esc(cut(s.label, Math.floor((cw - 20) / 6.4)))}</text>`
        + `<path d="M${r1(cx - R)},${r1(cy)} A${R},${R} 0 0 1 ${r1(cx + R)},${r1(cy)}" fill="none" stroke="${th.line}" stroke-width="16"/>`
        + (frac > 0 ? `<path d="M${r1(cx - R)},${r1(cy)} A${R},${R} 0 0 1 ${r1(px)},${r1(py)}" fill="none" stroke="${color(k)}" stroke-width="16"><title>${esc(s.label)} : ${esc(v == null ? '—' : opt.fmt(v, s))} sur ${esc(opt.fmt(max, s))}</title></path>` : '')
        + `<text x="${r1(cx)}" y="${r1(cy - 6)}" text-anchor="middle" font-size="${R > 70 ? 24 : 18}" font-weight="700" fill="${th.ink}">${esc(v == null ? '—' : opt.fmt(v, s))}</text>`
        + `<text x="${r1(cx)}" y="${r1(cy + 14)}" text-anchor="middle" fill="${th.muted}">${v == null ? '' : (Math.round(v / max * 1000) / 10).toLocaleString('fr-BE') + ' % de ' + esc(opt.fmt(max, s))}</text>`
        + `<text x="${r1(cx - R)}" y="${r1(cy + 16)}" text-anchor="middle" fill="${th.muted}" font-size="11">0</text><text x="${r1(cx + R)}" y="${r1(cy + 16)}" text-anchor="middle" fill="${th.muted}" font-size="11">${esc(cut(opt.fmt(max, s), 10))}</text>`;
      if (v != null && v > max) notes.push(esc(s.label) + ' dépasse le maximum de la jauge');
    });
    return { svg: c.wrapSvg(inner, H), w: W, h: H, note: (gmax ? 'Maximum fixé à ' + gmax.toLocaleString('fr-BE') : 'Maximum automatique (100 pour un pourcentage) : renseignez « Objectif » pour le fixer') + (notes.length ? ' · ' + notes.join(', ') : '') };
  });

  /* ---------- carte à bulles : lieux reconnus par leur nom (pays, province, région, commune / code NIS, ville) ou valeurs Latitude / Longitude ---------- */
  PC.register('map', (res, opt, c) => {
    const { esc, cut, color, r1, th, W } = c, geo = opt.geo;
    if (!geo || !geo.data) return Object.assign(NONE('Chargement des fonds de carte…'), { pending: true });
    const k = c.collected.k, specs = res.specs, rows = res.rows.slice(0, 300);
    const idxOf = re => specs.findIndex(s => re.test(normLabel(s.label)));
    const latK = idxOf(/(^| )(lat|latitude)( |$)/), lonK = idxOf(/(^| )(lon|lng|long|longitude)( |$)/);
    const pts = [], missing = [];
    if (latK >= 0 && lonK >= 0 && latK !== lonK) {   // coordonnées fournies par les valeurs
      const sk = k !== latK && k !== lonK ? k : specs.findIndex((_, i) => i !== latK && i !== lonK);
      rows.forEach(r => {
        const lat = c.num(r.tot[latK]), lon = c.num(r.tot[lonK]), v = sk >= 0 ? c.num(r.tot[sk]) : 1, label = r.labels.length ? r.labels.join(' › ') : 'Total';
        if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { missing.push(label); return; }
        if (v != null && v > 0) pts.push({ label, lat, lon, v });
      });
    } else {
      const hint = res.rowDims[0] || '';
      rows.forEach(r => {
        const v = c.num(r.tot[k]), label = r.labels.length ? r.labels.join(' › ') : 'Total';
        if (!(v > 0)) return;
        let p = null;
        for (let i = r.labels.length - 1; i >= 0 && !p; i--) p = geo.locate(r.labels[i], res.rowDims[i] || hint);
        if (p) pts.push({ label, lat: p.lat, lon: p.lon, v, kind: p.kind, name: p.name }); else missing.push(label);
      });
    }
    if (!pts.length) return NONE('Aucun lieu reconnu. Mettez en lignes des pays, provinces, régions, communes belges (nom ou code NIS) ou villes du monde — ou ajoutez des valeurs « Latitude » et « Longitude » (moyenne).');
    // cadre de la carte
    const H = c.fit ? c.PH + 100 : clamp(c.PH + 100, 350, 650), top = 26, bot = 50, ph = H - top - bot, pw = W - 12;
    let lo0 = Math.min(...pts.map(p => p.lon)), lo1 = Math.max(...pts.map(p => p.lon)), la0 = Math.min(...pts.map(p => p.lat)), la1 = Math.max(...pts.map(p => p.lat));
    const spanLon = Math.max(lo1 - lo0, 4), spanLat = Math.max(la1 - la0, 3), cLon = (lo0 + lo1) / 2, cLat = (la0 + la1) / 2;
    lo0 = cLon - spanLon * 0.7; lo1 = cLon + spanLon * 0.7; la0 = cLat - spanLat * 0.7; la1 = cLat + spanLat * 0.7;
    const wide = (lo1 - lo0) > 150;
    if (wide) { lo0 = -180; lo1 = 180; la0 = -58; la1 = 84; }
    if (!wide) {   // élargit la vue (dans la limite du fond détaillé) pour occuper la largeur disponible
      const b0 = geo.data.box || [1.0, 48.3, 8.6, 53.8], inside = lo0 >= b0[0] && lo1 <= b0[2] && la0 >= b0[1] && la1 <= b0[3];
      const cos0 = Math.cos(((la0 + la1) / 2) * Math.PI / 180), A = pw / ph, a = ((lo1 - lo0) * cos0) / (la1 - la0);
      if (a < A) {
        const span = A * (la1 - la0) / cos0, mid = (lo0 + lo1) / 2;
        let n0 = mid - span / 2, n1 = mid + span / 2;
        if (inside) { n0 = Math.max(n0, b0[0]); n1 = Math.min(n1, b0[2]); }
        if (n1 - n0 > lo1 - lo0) { lo0 = n0; lo1 = n1; }
      }
    }
    const midLat = wide ? 0 : (la0 + la1) / 2, cosM = Math.cos(midLat * Math.PI / 180);
    // cadre ajusté au territoire affiché (pas de zone vide), centré dans la largeur disponible
    const s = Math.min(pw / ((lo1 - lo0) * cosM), ph / (la1 - la0)), fw = (lo1 - lo0) * cosM * s, fh = (la1 - la0) * s, fx = 6 + (pw - fw) / 2, fy = top + (ph - fh) / 2;
    const X = lon => fx + (lon - lo0) * cosM * s, Y = lat => fy + (la1 - lat) * s;
    const box = geo.data.box || [1.0, 48.3, 8.6, 53.8];
    const inDetail = lo0 >= box[0] && lo1 <= box[2] && la0 >= box[1] && la1 <= box[3] && geo.data.detail && geo.data.detail.length;
    const polys = inDetail ? geo.data.detail : geo.data.world;
    let land = '';
    polys.forEach(([cc, list]) => {
      const isBE = cc === 'BE';
      let d = '';
      list.forEach(poly => {
        poly.forEach(ring => {
          let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, seg = '';
          for (let i = 0; i < ring.length; i += 2) { const lon = ring[i], lat = ring[i + 1]; if (lon < minx) minx = lon; if (lon > maxx) maxx = lon; if (lat < miny) miny = lat; if (lat > maxy) maxy = lat; seg += (i ? 'L' : 'M') + r1(X(lon)) + ',' + r1(Y(lat)); }
          if (maxx < lo0 || minx > lo1 || maxy < la0 || miny > la1) return;   // hors cadre
          d += seg + 'Z';
        });
      });
      if (d) land += `<path d="${d}" fill="${isBE && inDetail ? th.line : th.line}" fill-opacity="${isBE && inDetail ? 1 : 0.55}" stroke="${th.muted}" stroke-width="0.6" stroke-opacity="0.6" fill-rule="evenodd"/>`;
    });
    const vmax = Math.max(...pts.map(p => p.v)), rmax = clamp(Math.min(fw, fh) * (pts.length > 150 ? 0.025 : pts.length > 40 ? 0.04 : 0.06), 8, 34);
    const R = v => Math.max(2.5, rmax * Math.sqrt(v / vmax));
    let inner = c.title(c.titleBase())
      + `<clipPath id="mapclip"><rect x="${r1(fx)}" y="${r1(fy)}" width="${r1(fw)}" height="${r1(fh)}"/></clipPath><rect x="${r1(fx)}" y="${r1(fy)}" width="${r1(fw)}" height="${r1(fh)}" fill="${th.bg}" stroke="${th.line}"/><g clip-path="url(#mapclip)">${land}`;
    pts.slice().sort((a, b) => b.v - a.v).forEach(p => {
      inner += `<circle cx="${r1(X(p.lon))}" cy="${r1(Y(p.lat))}" r="${r1(R(p.v))}" fill="${color(0)}" fill-opacity="0.55" stroke="${color(0)}" stroke-width="1"><title>${esc(p.label)} : ${esc(c.fm(p.v))}${p.kind ? ' (' + esc(p.kind) + ')' : ''}</title></circle>`;
    });
    pts.slice().sort((a, b) => b.v - a.v).slice(0, 8).forEach(p => {
      inner += `<text x="${r1(X(p.lon) + R(p.v) + 3)}" y="${r1(Y(p.lat) + 4)}" font-size="11" fill="${th.ink}" style="paint-order:stroke;stroke:${th.bg};stroke-width:3px">${esc(cut(p.label, 20))}</text>`;
    });
    inner += '</g>';
    // légende de taille + attribution
    const ly = fy + fh + 22;
    [vmax, vmax / 4].forEach((v, i) => { const x = fx + 8 + i * 120; inner += `<circle cx="${x + 6}" cy="${ly - 4}" r="${r1(Math.min(9, R(v)))}" fill="${color(0)}" fill-opacity="0.55" stroke="${color(0)}"/><text x="${x + 22}" y="${ly}" fill="${th.muted}">${esc(c.fm(v))}</text>`; });
    inner += `<text x="${r1(fx + fw)}" y="${ly + 15}" text-anchor="end" font-size="10" fill="${th.muted}">${esc(geo.data.attribution || '')}</text>`;
    const note = `${pts.length} lieu(x) placé(s)` + (missing.length ? ` · ${missing.length} non localisé(s) : ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : '') + (rows.length < res.rows.length ? ' · 300 premières lignes' : '');
    return { svg: c.wrapSvg(inner, H), w: W, h: H, note };
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = { squarify };
  root.PivotChartMore = { squarify };
})(typeof globalThis !== 'undefined' ? globalThis : window);
