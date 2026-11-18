/* Standalone cartesian SVG renderer: bars, stacked bars, lines and areas.
 * Dependencies are injected per build to avoid sharing mutable chart state. */
(function(root){
  'use strict';
  function cartesian(res, opt, d, th, O, ctx) {
    const { r1, labText, scaleOf, cut, color, legendLayout, titleOf, esc, W, tx, curve, TR, wrapSvg } = ctx;
    const type = opt.type, fm = v => opt.fmt(v, d.spec);
    const horiz = type === 'hbar' || type === 'hstack' || type === 'hstack100', p100 = type === 'stack100' || type === 'hstack100';
    const stacked = type === 'stack' || type === 'sarea' || type === 'hstack' || p100, areaT = type === 'area' || type === 'sarea';
    const S = d.series.length, n = d.cats.length, PH = Math.max(opt.minPH || 200, Math.min(opt.fit ? 900 : 640, Math.round(+opt.plotH) || 300));
    const catPos = d.cats.map((_, i) => d.series.reduce((a, s) => a + (s.values[i] > 0 ? s.values[i] : 0), 0));
    const serTot = d.series[0].values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const series = p100 ? d.series.map(s => ({ name: s.name, raw: s.values, values: s.values.map((v, i) => (v == null ? null : catPos[i] > 0 ? Math.max(0, v) / catPos[i] * 100 : 0)) })) : d.series.map(s => ({ name: s.name, raw: s.values, values: s.values }));
    const fmA = p100 ? v => r1(v).toLocaleString('fr-BE') + ' %' : fm;
    const lt = (i, j) => { const raw = series[j].raw[i]; return labText(O.lab, raw, p100 ? series[j].values[i] : (S > 1 ? (catPos[i] > 0 ? raw / catPos[i] * 100 : null) : (serTot > 0 ? raw / serTot * 100 : null)), fm); };
    let lo = 0, hi = 0;
    if (p100) hi = 100;
    else if (stacked) d.cats.forEach((_, i) => { let a = 0, b = 0; series.forEach(s => { const v = s.values[i]; if (v != null) { if (v >= 0) a += v; else b += v; } }); hi = Math.max(hi, a); lo = Math.min(lo, b); });
    else series.forEach(s => s.values.forEach(v => { if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } }));
    const positive = series.flatMap(s => s.values).filter(v => v != null && v > 0);
    const logLine = type === 'line' && O.scale === 'log';
    const sc = scaleOf(logLine ? (positive.length ? Math.min(...positive) : 0) : lo, hi, Object.assign({}, O, { scale: logLine ? 'log' : 'linear' }));
    if (sc.invalid) return { svg: '', w: 0, h: 0, note: sc.invalid };
    const tk = sc.tk, tmin = sc.tmin, tickLab = tk.map(v => fmA(v));
    const catLab = d.cats.map(c => cut(c.label, horiz ? 32 : 22));
    const items = S > 1 || d.hasCols ? series.map((s, j) => ({ label: s.name, color: color(j) })) : [];
    // Position des étiquettes : auto = au bout de la barre (dans le segment si plusieurs séries empilées) ; in = dans la barre ; out = à côté ; top = au-dessus
    const lmode = stacked && S > 1 ? 'in' : (O.lpos === 'auto' ? 'out' : O.lpos);
    const LG = legendLayout(items, O, th), nm = (c, s) => c.label + (items.length ? ' · ' + s.name : '');
    let inner = titleOf(res, d, O), h;
    const mt = 30 + LG.top, mr = (horiz ? 24 : 14) + LG.right;
    if (LG.top) inner += LG.top$.svg;
    const refSvg = (pos, vert) => O.ref == null || O.ref < tmin || O.ref > sc.tmax ? '' : (vert
      ? `<line x1="${pos.a}" y1="${r1(pos.v)}" x2="${pos.b}" y2="${r1(pos.v)}" stroke="#c0453f" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${pos.b}" y="${r1(pos.v - 4)}" text-anchor="end" font-size="10.5" fill="#c0453f">${esc('Repère ' + fmA(O.ref))}</text>`
      : `<line x1="${r1(pos.v)}" y1="${pos.a}" x2="${r1(pos.v)}" y2="${pos.b}" stroke="#c0453f" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${r1(pos.v + 4)}" y="${pos.a + 10}" font-size="10.5" fill="#c0453f">${esc('Repère ' + fmA(O.ref))}</text>`);
    if (horiz) {
      const ml = Math.min(230, Math.max(70, Math.max(...catLab.map(t => t.length)) * 7.8 + 12), Math.max(90, Math.round(W * 0.4))), pw = W - ml - mr;
      const maxCh = Math.max(6, Math.floor((ml - 12) / 7.8));
      for (let i = 0; i < catLab.length; i++) catLab[i] = cut(d.cats[i].label, Math.min(32, maxCh));   // étiquettes raccourcies pour tenir dans la zone
      const base = O.bar ? Math.max((stacked ? 1 : S) * 18 + 10, 34) : Math.max((stacked ? 1 : S) * 11 + 8, 22), band = (opt.fit ? Math.max(base, Math.min(52, PH / n)) : base) + (lmode === 'top' && S === 1 && O.lab !== 'none' ? 14 : 0), ph = n * band;
      const bh = O.bar ? Math.max(2, base * O.bar / 100 / (stacked ? 1 : S)) : (stacked ? Math.min(opt.fit ? 34 : 22, band - 6) : Math.min(opt.fit ? 26 : 16, (band - 6) / S));
      const x = v => ml + pw * sc.ratio(v);
      tk.forEach((v, i) => { inner += (O.grid ? `<line x1="${r1(x(v))}" y1="${mt}" x2="${r1(x(v))}" y2="${mt + ph}" stroke="${th.line}"/>` : '') + `<text x="${r1(x(v))}" y="${mt + ph + 16}" text-anchor="middle" fill="${th.muted}">${esc(tickLab[i])}</text>`; });
      d.cats.forEach((c, i) => {
        inner += `<text x="${ml - 6}" y="${r1(mt + i * band + band / 2 + 4)}" text-anchor="end" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>`;
        let pos = 0, neg = 0;
        series.forEach((s, j) => {
          const v = s.values[i]; if (v == null) return;
          let a, b, y0;
          if (stacked) { y0 = mt + i * band + (band - bh) / 2; if (v >= 0) { a = pos; b = pos + v; pos = b; } else { b = neg; a = neg + v; neg = a; } } else { y0 = mt + i * band + (band - S * bh) / 2 + j * bh; a = Math.min(0, v); b = Math.max(0, v); }
          const xa = x(a), xb = x(b), w = Math.max(0.5, xb - xa);
          inner += `<rect x="${r1(xa)}" y="${r1(y0)}" width="${r1(w)}" height="${r1(bh - (stacked ? 0 : 1))}" fill="${color(j)}"><title>${esc(nm(c, s))} : ${esc(fm(s.raw[i]))}${p100 ? ' (' + esc(fmA(v)) + ')' : ''}</title></rect>`;
          const t = O.lab !== 'none' ? lt(i, j) : '';
          if (t) {
            const fitIn = w >= t.length * 5.8 + 6;
            if (lmode === 'in' && fitIn) inner += tx((xa + xb) / 2, y0 + bh / 2 + 4, t, th);
            else if (stacked && S > 1) { /* segment trop étroit : pas d'étiquette */ }
            else if (lmode === 'top' && S === 1) inner += tx(v >= 0 ? xa + 2 : xb - 2, y0 - 3, t, th, v >= 0 ? 'start' : 'end');
            else inner += v >= 0 ? tx(xb + 4, y0 + bh / 2 + 4, t, th, 'start') : tx(xa - 4, y0 + bh / 2 + 4, t, th, 'end');
          }
        });
      });
      inner += `<line x1="${r1(x(0))}" y1="${mt}" x2="${r1(x(0))}" y2="${mt + ph}" stroke="${th.muted}"/>` + (O.ref != null ? refSvg({ v: x(O.ref), a: mt, b: mt + ph }, false) : '');
      h = mt + ph + 28;
    } else {
      const rot = n > 6 || Math.max(...catLab.map(t => t.length)) > 9;
      let ml = Math.max(...tickLab.map(t => t.length)) * 6.6 + 20;
      const ph = PH, mb = rot ? Math.min(110, Math.max(...catLab.map(t => t.length)) * 4 + 22) : 26;
      if (rot) { const over = Math.ceil(0.77 * Math.max(...catLab.map(t => t.length)) * 7.4 + 10 - (W - ml - mr) / (2 * n) - 2); if (over > ml) ml = Math.min(over, Math.round(W * 0.35)); }   // la 1re étiquette inclinée ne sort plus du cadre
      const pw = W - ml - mr, labStep = rot ? Math.max(1, Math.ceil(14 / (pw / n))) : 1;   // catégories très serrées : une étiquette sur N
      const y = v => mt + ph * (1 - sc.ratio(v)), band = pw / n, X = i => ml + band * (i + 0.5);
      tk.forEach((v, i) => { inner += (O.grid ? `<line x1="${ml}" y1="${r1(y(v))}" x2="${ml + pw}" y2="${r1(y(v))}" stroke="${th.line}"/>` : '') + `<text x="${ml - 6}" y="${r1(y(v) + 4)}" text-anchor="end" fill="${th.muted}">${esc(tickLab[i])}</text>`; });
      const lab = [];   // étiquettes dessinées en dernier (au-dessus des formes)
      d.cats.forEach((c, i) => {
        const cx = X(i), ty = mt + ph + 14;
        inner += rot ? (i % labStep ? '' : `<text transform="translate(${r1(cx + 4)},${ty}) rotate(-40)" text-anchor="end" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>`)
          : `<text x="${r1(cx)}" y="${ty + 2}" text-anchor="middle" fill="${th.ink}"><title>${esc(c.label)}</title>${esc(catLab[i])}</text>`;
        if (type === 'line' || areaT) return;
        const gw = band * (O.bar ? O.bar / 100 : 0.8), bw = stacked ? gw : gw / S;
        let pos = 0, neg = 0;
        series.forEach((s, j) => {
          const v = s.values[i]; if (v == null) return;
          let ya, yb;
          if (stacked) { if (v >= 0) { ya = y(pos + v); yb = y(pos); pos += v; } else { ya = y(neg); yb = y(neg + v); neg += v; } }
          else { ya = y(Math.max(0, v)); yb = y(Math.min(0, v)); }
          const bx = cx - gw / 2 + (stacked ? 0 : j * bw), bwid = Math.max(1, bw - (stacked ? 0 : 1)), t = O.lab !== 'none' ? lt(i, j) : '';
          inner += `<rect x="${r1(bx)}" y="${r1(ya)}" width="${r1(bwid)}" height="${Math.max(0.5, r1(yb - ya))}" fill="${color(j)}"><title>${esc(nm(c, s))} : ${esc(fm(s.raw[i]))}${p100 ? ' (' + esc(fmA(v)) + ')' : ''}</title></rect>`;
          if (t) {
            if (lmode === 'in' && yb - ya >= 14 && bwid >= t.length * 5.6 + 4) lab.push(tx(bx + bwid / 2, (ya + yb) / 2 + 4, t, th));
            else if (lmode === 'in' && bwid >= 12 && yb - ya >= t.length * 5.6 + 6) { const rx = bx + bwid / 2 + 4, ry = (ya + yb) / 2; lab.push(tx(rx, ry, t, th, 'middle', ` transform="rotate(-90 ${r1(rx)} ${r1(ry)})"`)); }   // barre trop étroite pour le texte à l'horizontale : étiquette verticale
            else if (!(stacked && S > 1) && bwid >= Math.min(t.length * 5.6, 40) * 0.7) lab.push(tx(bx + bwid / 2, (v >= 0 ? ya - 4 : yb + 12), t, th));
          }
        });
      });
      if (type === 'sarea') {   // aires empilées : valeurs négatives ou absentes comptées pour 0
        const cum = d.cats.map(() => 0);
        series.forEach((s, j) => {
          const top = [], bot = [];
          s.values.forEach((v, i) => { const b0 = cum[i]; cum[i] += v != null && v > 0 ? v : 0; top.push([r1(X(i)), r1(y(cum[i]))]); bot.unshift([r1(X(i)), r1(y(b0))]); });
          inner += `<polygon points="${top.concat(bot).map(q => q.join(',')).join(' ')}" fill="${color(j)}" fill-opacity="0.78" stroke="${color(j)}" stroke-width="1.2"><title>${esc(items.length ? s.name : d.spec.label)}</title></polygon>`;
          if (O.lab !== 'none') s.values.forEach((v, i) => { const t = lt(i, j); if (t && v > 0) lab.push(tx(X(i), (y(cum[i]) + y(cum[i] - v)) / 2 + 4, t, th)); });
        });
      } else if (type === 'area' || type === 'line') {
        series.forEach((s, j) => {
          let seg = [];
          const flush = () => {
            if (seg.length > 1) {
              const pl = seg.map(q => q.join(',')).join(' ');
              if (O.smooth) {
                const line = curve(seg);
                if (type === 'area') inner += `<path d="${line} L${seg[seg.length - 1][0]},${r1(y(0))} L${seg[0][0]},${r1(y(0))} Z" fill="${color(j)}" fill-opacity="0.28"/>`;
                inner += `<path d="${line}" fill="none" stroke="${color(j)}" stroke-width="2"/>`;
              } else {
                if (type === 'area') inner += `<polygon points="${pl} ${seg[seg.length - 1][0]},${r1(y(0))} ${seg[0][0]},${r1(y(0))}" fill="${color(j)}" fill-opacity="0.28"/>`;
                inner += `<polyline points="${pl}" fill="none" stroke="${color(j)}" stroke-width="2"/>`;
              }
            }
            seg = [];
          };
          s.values.forEach((v, i) => { if (v == null || (logLine && v <= 0)) { flush(); return; } seg.push([r1(X(i)), r1(y(v))]); });
          flush();
          s.values.forEach((v, i) => { if (v != null && (!logLine || v > 0)) { inner += `<circle cx="${r1(X(i))}" cy="${r1(y(v))}" r="${type === 'line' ? 3.5 : 3}" fill="${color(j)}"><title>${esc(nm(d.cats[i], s))} : ${esc(fm(v))}</title></circle>`; const t = O.lab !== 'none' ? lt(i, j) : ''; if (t) lab.push(tx(X(i), y(v) - 8, t, th)); } });
        });
      }
      if (type === 'line' && O.trend !== 'none' && O.trend !== 'auto') {
        series.forEach((s,j)=>{
          const points=s.values.map((v,i)=>({x:i,y:v})).filter(p=>Number.isFinite(p.y));
          const fit=O.trend === 'ma' ? null : TR.polynomial(points,O.trend==='poly2'?2:O.trend==='poly3'?3:1);
          const vals=O.trend==='ma' ? TR.movingAverage(s.values,O.trendWindow) : fit ? s.values.map((_,i)=>fit.predict(i)) : [];
          if (O.trendEquation && fit) d.notes.push('Tendance '+s.name+' : '+TR.equation(fit)+' · R² = '+(fit.r2==null?'n/d':fit.r2.toFixed(3)));
          const segments=[];let segment=[];
          vals.forEach((v,i)=>{if(Number.isFinite(v) && (!logLine || v>0)){segment.push(r1(X(i))+','+r1(y(v)));}else if(segment.length){segments.push(segment);segment=[];}});
          if(segment.length)segments.push(segment);
          segments.filter(q=>q.length>1).forEach(q=>{inner += `<polyline points="${q.join(' ')}" fill="none" stroke="${color(j)}" stroke-dasharray="7 4" stroke-width="2" opacity="0.8"><title>Tendance ${esc(s.name)}</title></polyline>`;});
        });
      }
      inner += `<line x1="${ml}" y1="${r1(y(0))}" x2="${ml + pw}" y2="${r1(y(0))}" stroke="${th.muted}"/>` + lab.join('') + (O.ref != null ? refSvg({ v: y(O.ref), a: ml, b: ml + pw }, true) : '');
      h = mt + ph + mb;
    }
    const lg = LG.draw(h, mt); inner += lg.svg; h += lg.h;
    return { svg: wrapSvg(inner, h, th), w: W, h, note: d.notes.join(' · ') };
  }


  const api={cartesian};
  root.PivotChartCartesian=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
