/* Export XLSX MIS EN FORME du tableau croisé — écrit le classeur (OOXML) à la main, sans dépendance :
 * SheetJS (édition communautaire) ne sait pas écrire les styles. Reproduit à l'écran : style du tableau,
 * en-têtes fusionnés, libellés de lignes fusionnés, sous-totaux, formats de nombres par valeur,
 * mise en forme conditionnelle native Excel, volets figés, largeurs de colonnes, mise en page paysage.
 * Pur (aucun DOM) → testable sous Node. Exposé : globalThis.PivotXlsx / module.exports. */
(function (root) {
  'use strict';
  const PF = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : root.PivotFormat;
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;

  /* ---------- thèmes (couleurs ARGB) : mêmes styles que le tableau à l'écran ---------- */
  const BASE = { hdrFill: 'FFE4EAF1', hdrFont: 'FF1B2733', font: 'FF1B2733', lab: 'FF1B2733', totFill: 'FFE4EAF1', totFont: 'FF1B2733', line: 'FFD9E1E8', vlines: true, band: null, bodyFill: null, hdrBottom: 'thin' };
  const THEMES = {
    standard: BASE,
    bandes: Object.assign({}, BASE, { band: 'FFEEF3F8' }),
    sobre: Object.assign({}, BASE, { hdrFill: null, vlines: false, hdrBottom: 'medium', totFill: null }),
    statbel: Object.assign({}, BASE, { hdrFill: 'FF1565C0', hdrFont: 'FFFFFFFF', lab: 'FF0D47A1', totFill: 'FFDBE8F7', totFont: 'FF0D47A1', line: 'FFB7CBE4' }),
    sombre: Object.assign({}, BASE, { hdrFill: 'FF26323F', hdrFont: 'FFE6EDF3', font: 'FFE6EDF3', lab: 'FFE6EDF3', totFill: 'FF26323F', totFont: 'FFE6EDF3', line: 'FF2C3845', bodyFill: 'FF1B232D' })
  };

  /* ---------- utilitaires ---------- */
  const esc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function colName(c) { let s = ''; for (c++; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s; return s; }
  const ref = (r, c) => colName(c) + (r + 1);

  /* ---------- ZIP « stocké » (sans compression) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    files.forEach(f => {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(Uint8Array.from([0x50, 0x4b, 0x03, 0x04].concat(common)), name, data);
      central.push(Uint8Array.from([0x50, 0x4b, 0x01, 0x02].concat(u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = Uint8Array.from([0x50, 0x4b, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let p = 0; all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---------- registre de styles (styles.xml) ---------- */
  function styleBook() {
    const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = [], seen = {};
    const idx = (list, xml) => { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; };
    const side = (tag, b) => (b ? `<${tag} style="${b.style}"><color rgb="${b.color}"/></${tag}>` : `<${tag}/>`);
    function xf(s) {
      const key = JSON.stringify(s);
      if (seen[key] !== undefined) return seen[key];
      const font = idx(fonts, `<font>${s.b ? '<b/>' : ''}<sz val="11"/><color rgb="${s.color || 'FF1B2733'}"/><name val="Calibri"/><family val="2"/></font>`);
      const fill = s.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const border = (s.bL || s.bR || s.bT || s.bB) ? idx(borders, `<border>${side('left', s.bL)}${side('right', s.bR)}${side('top', s.bT)}${side('bottom', s.bB)}<diagonal/></border>`) : 0;
      let nf = 0;
      if (s.z) { let i = numFmts.indexOf(s.z); if (i < 0) { numFmts.push(s.z); i = numFmts.length - 1; } nf = 164 + i; }
      const al = (s.h || s.v || s.wrap) ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
      xfs.push(`<xf numFmtId="${nf}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`);
      return (seen[key] = xfs.length - 1);
    }
    xf({});   // xf 0 = défaut
    const dxf = (font, fill, bold) => `<dxf><font>${bold ? '<b/>' : ''}<color rgb="${font}"/></font><fill><patternFill><bgColor rgb="${fill}"/></patternFill></fill></dxf>`;
    const dxfs = [dxf('FF006100', 'FFC6EFCE'), dxf('FF9C0006', 'FFFFC7CE'), dxf('FF9C0006', 'FFFFC7CE', true)];
    const xml = () => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((z, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(z)}"/>`).join('')}</numFmts>` : '')
      + `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
      + `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs></styleSheet>`;
    return { xf, xml };
  }

  /* ---------- formats de nombres (équivalent Excel des formats de l'écran) ---------- */
  function convert(v, spec, dec, isInt) {
    const f = (spec && spec.fmt) || 'auto', isPct = /^pct/.test((spec && spec.agg) || '');
    switch (f) {
      case 'int': return { v, z: '#,##0' };
      case 'd1': return { v, z: '#,##0.0' };
      case 'd2': return { v, z: '#,##0.00' };
      case 'pct': return { v: isPct ? v / 100 : v, z: '0.0%' };
      case 'eur': return { v, z: '#,##0.00 "€"' };
      case 'k': return { v, z: '#,##0.0,"k"' };   // la virgule finale divise par 1000 à l'affichage, la valeur reste exacte
      default:
        if (isPct) return { v: v / 100, z: '0.0%' };
        if (dec !== undefined && dec !== 'auto') return { v, z: '#,##0' + (+dec > 0 ? '.' + '0'.repeat(+dec) : '') };
        return { v, z: isInt ? '#,##0' : '#,##0.00' };
    }
  }

  /* ---------- construction du classeur ---------- */
  function build(res, o) {
    o = o || {};
    const th = THEMES[o.style] || THEMES.standard, book = styleBook();
    const K = res.K, cd = res.colDims.length, rd = res.rowDims.length, nl = Math.max(1, rd);
    const showRowTot = !!o.rowTot && cd > 0, showBottom = !!o.colTot && rd > 0, levels = cd + 1;
    const leaves = [];
    res.cols.forEach(c => res.specs.forEach((s, k) => leaves.push({ labels: c.labels, k })));
    const nLeaf = leaves.length, totStart = nl + nLeaf, ncols = totStart + (showRowTot ? K : 0);

    // entiers ? (choix du format automatique, par valeur)
    const isInt = res.specs.map(() => true);
    const scan = (v, k) => { if (v != null && isFinite(v) && !Number.isInteger(v)) isInt[k] = false; };
    res.rows.forEach(r => { r.cells.forEach((v, j) => scan(v, leaves[j].k)); r.tot.forEach(scan); });
    res.bottom.forEach((v, j) => scan(v, j % K)); res.grand.forEach(scan);
    (res.subs || []).forEach(m => m.forEach(s => { s.cells.forEach((v, j) => scan(v, leaves[j].k)); s.tot.forEach(scan); }));

    const grid = [], merges = [], widths = new Array(ncols).fill(8);
    const cell = (r, c) => ((grid[r] = grid[r] || [])[c] = grid[r][c] || { v: null });
    const grow = (c, len) => { if (len > widths[c]) widths[c] = len; };
    const line = { style: 'thin', color: th.line };
    const borders = () => (th.vlines ? { bL: line, bR: line, bT: line, bB: line } : { bT: line, bB: line });
    const text = (r, c, s, style) => { const x = cell(r, c); x.v = s; x.t = 's'; x.xf = book.xf(style); };
    const blank = (r, c, style) => { const x = cell(r, c); x.xf = book.xf(style); };
    const merge = (r1, c1, r2, c2) => { if (r2 > r1 || c2 > c1) merges.push([r1, c1, r2, c2]); };
    const hdr = Object.assign({ b: true, color: th.hdrFont, fill: th.hdrFill, h: 'center', v: 'center', wrap: true }, borders(), th.hdrBottom === 'medium' ? { bB: { style: 'medium', color: th.hdrFont } } : {});
    const rlab = fill => Object.assign({ b: true, color: th.lab, fill, v: 'top', wrap: true }, borders());
    const totSt = Object.assign({ b: true, color: th.totFont, fill: th.totFill }, borders());

    /* en-têtes */
    if (levels > 1) {
      for (let r = 0; r < levels - 1; r++) for (let c = 0; c < nl; c++) blank(r, c, Object.assign({}, hdr, { h: 'left' }));
      text(0, 0, res.colDims.join(' › '), Object.assign({}, hdr, { h: 'left' }));
      merge(0, 0, levels - 2, nl - 1);
    }
    for (let i = 0; i < nl; i++) { text(levels - 1, i, rd ? res.rowDims[i] : '', Object.assign({}, hdr, { h: 'left' })); grow(i, 10); }
    for (let l = 0; l < cd; l++) {
      for (let j = 0; j < nLeaf;) {
        const pre = leaves[j].labels.slice(0, l + 1).join('\u0001');
        let e = j + 1;
        while (e < nLeaf && leaves[e].labels.slice(0, l + 1).join('\u0001') === pre) e++;
        text(l, nl + j, leaves[j].labels[l], hdr);
        for (let c = j + 1; c < e; c++) blank(l, nl + c, hdr);
        merge(l, nl + j, l, nl + e - 1);
        j = e;
      }
    }
    leaves.forEach((x, j) => { const lab = res.specs[x.k].label; text(levels - 1, nl + j, lab, hdr); grow(nl + j, Math.min(24, Math.ceil(lab.length * 0.55))); });
    if (showRowTot) {
      for (let r = 0; r < cd; r++) for (let k = 0; k < K; k++) blank(r, totStart + k, hdr);
      text(0, totStart, 'Total', hdr);
      merge(0, totStart, cd - 1, totStart + K - 1);
      res.specs.forEach((s, k) => { text(levels - 1, totStart + k, s.label, hdr); grow(totStart + k, Math.min(24, Math.ceil(s.label.length * 0.55))); });
    }

    /* corps : lignes de données + sous-totaux (comme à l'écran) */
    const disp = [];
    res.rows.forEach((r, i) => {
      disp.push({ r, i });
      if (o.subTot && res.subs && res.subs.length) E.subtotalsAfter(res, i).forEach(s => disp.push({ sub: s }));
    });
    const gkey = (d, l) => (d.sub ? (l < d.sub.level ? d.sub.labels.slice(0, l + 1).join('\u0001') : null) : (rd ? d.r.labels : ['Total']).slice(0, l + 1).join('\u0001'));
    const r0 = levels, leafRows = [];
    const num = (r, c, v, k, style) => {
      const m = v == null ? { v: null, z: convert(0, res.specs[k], o.dec, isInt[k]).z } : convert(v, res.specs[k], o.dec, isInt[k]);
      const x = cell(r, c);
      x.xf = book.xf(Object.assign({ h: 'right', z: m.z }, style));
      if (v != null && isFinite(m.v)) { x.v = m.v; x.t = 'n'; grow(c, PF.formatValue(v, res.specs[k], o.dec).length + 2); }
    };
    disp.forEach((d, n) => {
      const r = r0 + n;
      if (d.sub) {
        const s = d.sub, lv = s.level;
        for (let l = 0; l < lv; l++) blank(r, l, rlab(th.bodyFill));
        text(r, lv, 'Total ' + s.labels[lv], Object.assign({}, totSt));
        for (let c = lv + 1; c < nl; c++) blank(r, c, totSt);
        merge(r, lv, r, nl - 1);
        grow(lv, Math.min(40, ('Total ' + s.labels[lv]).length + 2));
        s.cells.forEach((v, j) => num(r, nl + j, v, leaves[j].k, totSt));
        if (showRowTot) s.tot.forEach((v, k) => num(r, totStart + k, v, k, totSt));
        return;
      }
      leafRows.push(r);
      const la = rd ? d.r.labels : ['Total'], band = th.band && d.i % 2 === 1 ? th.band : th.bodyFill;
      for (let l = 0; l < nl; l++) {
        const key = gkey(d, l);
        if (n > 0 && gkey(disp[n - 1], l) === key) { blank(r, l, rlab(th.bodyFill)); continue; }
        let span = 1;
        while (n + span < disp.length && gkey(disp[n + span], l) === key) span++;
        text(r, l, la[l], rlab(th.bodyFill));
        grow(l, Math.min(40, String(la[l]).length + 2));
        merge(r, l, r + span - 1, l);
      }
      const body = Object.assign({ color: th.font, fill: band }, borders());
      d.r.cells.forEach((v, j) => num(r, nl + j, v, leaves[j].k, body));
      if (showRowTot) d.r.tot.forEach((v, k) => num(r, totStart + k, v, k, Object.assign({}, body, { b: true })));
    });
    let last = r0 + disp.length - 1;
    if (showBottom) {
      const r = ++last;
      text(r, 0, 'Total', totSt);
      for (let c = 1; c < nl; c++) blank(r, c, totSt);
      merge(r, 0, r, nl - 1);
      res.bottom.forEach((v, j) => num(r, nl + j, v, j % K, totSt));
      if (showRowTot) res.grand.forEach((v, k) => num(r, totStart + k, v, k, totSt));
    }

    /* mise en forme conditionnelle native (sur les cellules de données uniquement, par valeur) */
    const cfXml = [];
    if (o.cf && o.cf !== 'none' && leafRows.length) {
      const runs = [];   // lignes de données consécutives (les sous-totaux sont exclus)
      leafRows.forEach(r => { const t = runs[runs.length - 1]; if (t && t[1] === r - 1) t[1] = r; else runs.push([r, r]); });
      let prio = 1;
      res.specs.forEach((sp, k) => {
        const cols = leaves.map((x, j) => (x.k === k ? nl + j : -1)).filter(c => c >= 0);
        let sqref = cols.map(c => runs.map(([a, b]) => ref(a, c) + ':' + ref(b, c)).join(' ')).join(' ');
        if (sqref.length > 6000) sqref = cols.map(c => ref(leafRows[0], c) + ':' + ref(leafRows[leafRows.length - 1], c)).join(' ');
        let rules = '';
        const stored = convert(1, sp, o.dec, false).v === 0.01;   // pourcentage stocké /100 : le seuil suit
        switch (o.cf) {
          case 'heat': rules = `<cfRule type="colorScale" priority="${prio++}"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFF1F6FB"/><color rgb="FF7FA8D8"/></colorScale></cfRule>`; break;
          case 'scale3': rules = `<cfRule type="colorScale" priority="${prio++}"><colorScale><cfvo type="min"/><cfvo type="percent" val="50"/><cfvo type="max"/><color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale></cfRule>`; break;
          case 'bars': rules = `<cfRule type="dataBar" priority="${prio++}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF6B9BD6"/></dataBar></cfRule>`; break;
          case 'top': rules = `<cfRule type="top10" dxfId="0" priority="${prio++}" percent="1" rank="10"/><cfRule type="top10" dxfId="1" priority="${prio++}" percent="1" bottom="1" rank="10"/>`; break;
          case 'rule': {
            const thr = parseFloat(String(o.cfVal).replace(',', '.'));
            if (!isFinite(thr)) break;
            const op = { '>': 'greaterThan', '<': 'lessThan', '>=': 'greaterThanOrEqual', '<=': 'lessThanOrEqual', '=': 'equal' }[o.cfOp || '>'];
            rules = `<cfRule type="cellIs" dxfId="2" priority="${prio++}" operator="${op}"><formula>${stored ? thr / 100 : thr}</formula></cfRule>`;
            break;
          }
        }
        if (rules) cfXml.push(`<conditionalFormatting sqref="${sqref}">${rules}</conditionalFormatting>`);
      });
    }

    /* feuille */
    const rowsXml = [];
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r] || [];
      let cx = '';
      for (let c = 0; c < ncols; c++) {
        const x = row[c];
        if (!x) continue;
        const a = ref(r, c), s = x.xf ? ` s="${x.xf}"` : '';
        if (x.t === 's') cx += `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(x.v)}</t></is></c>`;
        else if (x.t === 'n') cx += `<c r="${a}"${s}><v>${x.v}</v></c>`;
        else cx += `<c r="${a}"${s}/>`;
      }
      rowsXml.push(`<row r="${r + 1}">${cx}</row>`);
    }
    const colsXml = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, i < nl ? 12 : 10), 45)}" customWidth="1"/>`).join('');
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<dimension ref="A1:${ref(Math.max(last, 0), Math.max(ncols - 1, 0))}"/>`
      + `<sheetViews><sheetView workbookViewId="0"${th.bodyFill ? ' showGridLines="0"' : ''}><pane xSplit="${nl}" ySplit="${levels}" topLeftCell="${ref(levels, nl)}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight"/></sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + `<cols>${colsXml}</cols><sheetData>${rowsXml.join('')}</sheetData>`
      + (merges.length ? `<mergeCells count="${merges.length}">${merges.map(([a, b, c, d]) => `<mergeCell ref="${ref(a, b)}:${ref(c, d)}"/>`).join('')}</mergeCells>` : '')
      + cfXml.join('')
      + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';

    const enc = new TextEncoder(), X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zip([
      { name: '[Content_Types].xml', data: enc.encode(X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: enc.encode(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: enc.encode(X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tableau croisé" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: enc.encode(book.xml()) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }
    ]);
  }

  const api = { build, convert, zip, crc32, THEMES };
  root.PivotXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
