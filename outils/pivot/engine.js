/* Moteur de tableau croisé dynamique — pur (aucun DOM), testable sous Node.
 * Charge des « sources » (feuilles Excel / CSV déjà lues en tableau de tableaux),
 * unifie leurs colonnes (noms différents → champs communs), puis agrège.
 * Exposé : globalThis.PivotEngine (navigateur) / module.exports (Node). */
(function (root) {
  'use strict';

  const EMPTY = '(vide)';
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'par', 'et', 'au', 'aux', 'of', 'the', 'van', 'het', 'een', 'der']);
  const AGG_LABELS = {
    sum: 'Somme', count: 'Nombre', countd: 'Nombre distinct', avg: 'Moyenne', min: 'Minimum', max: 'Maximum',
    pctgrand: '% du total', pctrow: '% de la ligne', pctcol: '% de la colonne'
  };

  /* ---------- noms & similarité ---------- */
  function normName(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function tokens(s) { return normName(s).split(' ').filter(t => t && !STOP.has(t)); }
  // Jaccard sur les mots ; deux mots « concordent » s'ils sont égaux ou si l'un (≥ 3 lettres) préfixe l'autre (Prov. ≈ Province).
  function sameTok(x, y) { return x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x))); }
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return 0;
    const inter = A.filter(x => B.some(y => sameTok(x, y))).length;
    return inter / (A.length + B.length - inter);
  }

  /* ---------- valeurs ---------- */
  // Nombres belges/français : « 1.234 » = 1234 (séparateur de milliers), « 1,5 » = 1.5.
  function parseNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    const s = v.replace(/[\s  ]/g, '');
    if (!s) return NaN;
    if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
    if (/^[-+]?[1-9]\d{0,2}(,\d{3}){2,}(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
    if (/^[-+]?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
    return NaN;
  }
  function parseDateString(s) {
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
    if (m) return mkDate(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return mkDate(+m[3], +m[2], +m[1]);
    return null;
  }
  function mkDate(y, mo, d) {
    const x = new Date(y, mo - 1, d, 12, 0, 0);
    return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? x : null;
  }
  const p2 = n => (n < 10 ? '0' : '') + n;
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  // Périodes écrites en texte : « 2024 T1 », « 2024-Q3 », « T2 2025 », « 4ème trimestre 2024 », « 2024-11 ».
  const RX_QT1 = /^(\d{4})\s*[-/ ]?\s*[TQ]\s*([1-4])$/i, RX_QT2 = /^[TQ]\s*([1-4])\s*[-/ ]?\s*(\d{4})$/i;
  const RX_QT3 = /^([1-4])\s*(?:e|è|ème|er|de|ste)?\s*(?:trimestre|kwartaal|quarter|quartal)\s*(\d{4})$/i;
  const RX_YM = /^(\d{4})\s*[-/]\s*(0?[1-9]|1[0-2])$/;
  function parsePeriod(s) {
    s = String(s).trim();
    let m = RX_QT1.exec(s);
    if (m) return { y: +m[1], q: +m[2] };
    if ((m = RX_QT2.exec(s))) return { y: +m[2], q: +m[1] };
    if ((m = RX_QT3.exec(s))) return { y: +m[2], q: +m[1] };
    if ((m = RX_YM.exec(s))) return { y: +m[1], mo: +m[2], q: Math.floor((+m[2] - 1) / 3) + 1 };
    return null;
  }
  // +1 min : SheetJS produit parfois des dates à quelques secondes avant minuit.
  function dateParts(d) { const x = new Date(d.getTime() + 60000); return [x.getFullYear(), x.getMonth() + 1, x.getDate()]; }
  // Parties d'une valeur : date (Date) ou période texte → { y, mo?, d?, q, dow? } ; null sinon.
  function partsOf(v) {
    if (v instanceof Date && !isNaN(v)) {
      const [y, mo, d] = dateParts(v);
      return { y, mo, d, q: Math.floor((mo - 1) / 3) + 1, dow: (new Date(y, mo - 1, d).getDay() + 6) % 7 };
    }
    return typeof v === 'string' ? parsePeriod(v) : null;
  }
  function dateLabel(d) { const [y, m, j] = dateParts(d); return y + '-' + p2(m) + '-' + p2(j); }
  function dimLabel(v) { return v == null ? EMPTY : (v instanceof Date ? dateLabel(v) : String(v)); }
  function normCell(v) {
    if (v == null) return null;
    if (typeof v === 'string') { const t = v.trim(); return t === '' ? null : t; }
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
    return String(v);
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = c => first.split(c).length - 1;
    const delim = [';', '\t', ',', '|'].reduce((best, c) => (count(c) > count(best) ? c : best), ';');
    const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; out.push(row); row = [];
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); }
    return out.filter(r => r.some(c => String(c).trim() !== ''));
  }

  /* ---------- sources & colonnes ---------- */
  function detectHeaderRow(aoa) {
    const lim = Math.min(aoa.length, 30);
    const cnt = [];
    let max = 0;
    for (let i = 0; i < lim; i++) {
      cnt[i] = (aoa[i] || []).filter(v => normCell(v) !== null).length;
      if (cnt[i] > max) max = cnt[i];
    }
    for (let i = 0; i < lim; i++) if (cnt[i] >= 2 && cnt[i] >= 0.7 * max) return i;
    return 0;
  }
  // Colonnes d'une source : [{col, name, sample}] (noms dédoublonnés, colonnes vides ignorées).
  function columnsOf(src) {
    const aoa = src.aoa, hr = src.headerRow || 0, head = aoa[hr] || [];
    let width = head.length;
    for (let i = hr + 1; i < Math.min(aoa.length, hr + 200); i++) width = Math.max(width, (aoa[i] || []).length);
    const seen = new Map(), cols = [];
    for (let c = 0; c < width; c++) {
      let sample = null;
      for (let i = hr + 1; i < Math.min(aoa.length, hr + 200) && sample === null; i++) sample = normCell((aoa[i] || [])[c]);
      let name = normCell(head[c]);
      name = name === null ? '' : (name instanceof Date ? dateLabel(name) : String(name).replace(/\s+/g, ' '));
      if (!name && sample === null) continue;
      if (!name) name = 'Colonne ' + (c + 1);
      const k = normName(name) || name, n = seen.get(k) || 0;
      seen.set(k, n + 1);
      if (n) name += ' (' + (n + 1) + ')';
      cols.push({ col: c, name, sample: sample instanceof Date ? dateLabel(sample) : sample });
    }
    return cols;
  }

  // Unifie les sources : over = { 'idSource|col': 'nom du champ unifié' ('' = ignorer) }.
  function unify(sources, over) {
    over = over || {};
    const fields = [{ key: '__source', label: 'Source', type: 'text', sources: new Set() }];
    const index = new Map();
    const maps = sources.map(s => columnsOf(s).map(c => {
      const o = over[s.id + '|' + c.col];
      const target = String(o === undefined ? c.name : o).trim();
      if (!target) return null;
      const key = normName(target) || target;
      let i = index.get(key);
      if (i === undefined) {
        i = fields.length; index.set(key, i);
        fields.push({ key: 'f:' + key, label: target, type: 'text', sources: new Set() });
      }
      fields[i].sources.add(s.id);
      return { col: c.col, i };
    }).filter(Boolean));
    const MAX_SAMPLES = 100;
    const n = fields.length, rows = [], conflicts = [], ambiguityMap = new Map();
    let conflictCount = 0;
    sources.forEach((s, si) => {
      for (let r = (s.headerRow || 0) + 1; r < s.aoa.length; r++) {
        const src = s.aoa[r] || [], arr = new Array(n).fill(null);
        arr[0] = s.label;
        let any = false;
        for (const m of maps[si]) {
          const v = normCell(src[m.col]);
          if (v !== null) {
            any = true;
            if (arr[m.i] === null) arr[m.i] = v;
            else if (dimLabel(arr[m.i]) !== dimLabel(v)) {
              conflictCount++;
              if (conflicts.length < MAX_SAMPLES) conflicts.push({ source: s.label, row: r + 1, field: fields[m.i].label, first: dimLabel(arr[m.i]), other: dimLabel(v) });
            }
          }
        }
        if (any) rows.push(arr);
      }
    });
    // Détection du type de chaque champ, puis conversion (nombres / dates en texte).
    for (let i = 1; i < n; i++) {
      let ne = 0, nums = 0, dates = 0, zero = false;
      for (const r of rows) {
        const v = r[i];
        if (v === null) continue;
        ne++;
        if (v instanceof Date) dates++;
        else if (typeof v === 'number') nums++;
        else {
          if (/^0\d+$/.test(v)) zero = true;
          if (/^[+-]?\d{1,3}\.\d{3}$/.test(v) || /^[+-]?\d{1,3},\d{3}$/.test(v)) {
            const amb = ambiguityMap.get(i);
            if (amb) amb.count++; else ambiguityMap.set(i, { field: fields[i].label, value: v, count: 1 });
          }
          if (parseNumber(v) === parseNumber(v)) nums++;
          else if (parseDateString(v)) dates++;
        }
      }
      const f = fields[i];
      if (ne && !zero && nums >= 0.9 * ne) f.type = 'number';
      else if (ne && dates >= 0.9 * ne) f.type = 'date';
      if (f.type === 'text' && ne) {
        let per = 0, withMonth = 0;
        for (const r of rows) {
          const p = typeof r[i] === 'string' ? parsePeriod(r[i]) : null;
          if (p) { per++; if (p.mo) withMonth++; }
        }
        if (per >= 0.9 * ne) { f.period = true; f.periodMonth = withMonth === per; }
      }
      if (f.type === 'number') {
        for (const r of rows) if (typeof r[i] === 'string') { const x = parseNumber(r[i]); if (x === x) r[i] = x; }
      } else if (f.type === 'date') {
        for (const r of rows) if (typeof r[i] === 'string') { const d = parseDateString(r[i]); if (d) r[i] = d; }
      }
    }
    // un seul exemple par champ (avec le nombre de valeurs concernées) : tous les champs sont signalés
    return { fields, rows, conflicts, conflictCount, ambiguities: [...ambiguityMap.values()] };
  }

  /* ---------- catalogue de dimensions / mesures ---------- */
  function buildCatalog(fields) {
    const cat = [{ key: '__rows', label: 'Nombre de lignes (∗)', type: 'number', valueOnly: true, val: () => 1, dim: () => '' }];
    fields.forEach((f, i) => {
      cat.push({ key: f.key, label: f.label, type: f.type, idx: i, nsrc: f.sources ? f.sources.size : 0, val: r => r[i], dim: r => dimLabel(r[i]) });
      if (f.type === 'date' || f.period) {
        // Dérivations : date → année / trimestre / mois / jour de la semaine ; période texte → année / trimestre / mois.
        const isDate = f.type === 'date';
        const defs = [
          ['y', 'année', p => String(p.y), true],
          ['q', 'année-trimestre', p => p.y + '-T' + p.q, isDate || f.periodMonth],
          ['qn', 'trimestre T1–T4', p => 'T' + p.q, true],
          ['m', 'année-mois', p => p.y + '-' + p2(p.mo), isDate],
          ['mn', 'mois', p => p2(p.mo) + ' ' + MOIS[p.mo - 1], isDate || f.periodMonth],
          ['dow', 'jour de la semaine', p => (p.dow + 1) + ' ' + JOURS[p.dow], isDate]
        ];
        defs.filter(d => d[3]).forEach(([suffix, label, fn]) => cat.push({
          key: f.key + '|' + suffix, label: f.label + ' (' + label + ')', type: 'text', derived: true, idx: i,
          val: r => r[i], dim: r => { const p = partsOf(r[i]); return p ? fn(p) : EMPTY; }
        }));
      }
    });
    return cat;
  }

  /* ---------- agrégation ---------- */
  function specLabel(item, agg) {
    if (item.calc || (item.measure && agg === item.agg0)) return item.label;
    if (item.key === '__rows') return agg === 'sum' ? 'Nombre de lignes' : AGG_LABELS[agg] + ' (lignes)';
    return AGG_LABELS[agg] + ' de ' + item.label;
  }
  // dirs[i] = 1 (A→Z) ou -1 (Z→A) pour le niveau i ; « (vide) » reste toujours en dernier.
  function cmpLabels(a, b, dirs) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] === EMPTY) return 1;
      if (b[i] === EMPTY) return -1;
      return collator.compare(a[i], b[i]) * ((dirs && dirs[i]) || 1);
    }
    return 0;
  }
  function finalize(a, agg, den) {
    switch (agg) {
      case 'sum': return a.nn ? a.sum : null;
      case 'count': return a.n;
      case 'countd': return a.set.size;
      case 'avg': return a.nn ? a.sum / a.nn : null;
      case 'min': return a.nn ? a.min : null;
      case 'max': return a.nn ? a.max : null;
      case 'calc': return a.fn(a.rs, a.rn);   // champ calculé : formule sur les sommes de la cellule
      default: return a.nn && den ? a.sum / den * 100 : null;
    }
  }

  // Tri par valeur en CONSERVANT la hiérarchie des lignes : à chaque niveau, les groupes sont triés selon la valeur
  // agrégée de leurs lignes (somme pour somme/nombre/%, minimum pour min, maximum sinon), puis les lignes dans le groupe.
  function sortRows(rows, get, dir, agg, getAccumulator) {
    const cmp = (x, y) => (x == null ? (y == null ? 0 : 1) : y == null ? -1 : (x - y) * dir);
    const depth = rows.length && rows[0].labels.length;
    const score = list => {
      if (agg === 'calc' && getAccumulator) {
        let fn = null, rs = null, rn = null;
        for (const row of list) {
          const a = getAccumulator(row);
          if (!a) continue;
          if (!rs) { fn = a.fn; rs = a.rs.map(() => 0); rn = a.rn.map(() => 0); }
          a.rs.forEach((x, j) => { rs[j] += x; rn[j] += a.rn[j]; });
        }
        return fn ? fn(rs, rn) : null;
      }
      if (agg === 'avg' && getAccumulator) {
        // Une moyenne de groupe doit pondérer les sous-groupes par le nombre de valeurs numériques.
        let sum = 0, count = 0;
        for (const row of list) {
          const a = getAccumulator(row);
          if (a) { sum += a.sum; count += a.nn; }
        }
        return count ? sum / count : null;
      }
      const v = list.map(get).filter(x => x != null);
      if (!v.length) return null;
      if (agg === 'min') return Math.min(...v);
      return /^(sum|count|pct)/.test(agg) ? v.reduce((a, b) => a + b, 0) : Math.max(...v);
    };
    const rec = (list, level) => {
      if (level >= depth - 1 || depth <= 1) return list.slice().sort((a, b) => cmp(get(a), get(b)));
      const groups = new Map();
      list.forEach(r => { const k = r.labels[level]; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
      return [...groups.values()].map(g => ({ g, s: score(g) })).sort((a, b) => cmp(a.s, b.s))
        .flatMap(x => rec(x.g, level + 1));
    };
    return rec(rows, 0);
  }

  // layout = { rows:[key], cols:[key], vals:[{key,agg}], filters:{key:Set(libellés exclus)}, sort:{col,k,dir}|null }
  const OTHERS_LABEL = 'Autres';

  /* ---------- filtres : valeurs exclues (L.filters) + règles (L.rules) : texte, plage, top / flop ----------
   * L.rules[clé] = { text:{op,q}, range:{min,max}, top:{n,mode,by,agg} } ; toutes les conditions se cumulent (ET).
   * Un classement « top » se calcule sur les lignes qui passent déjà les autres filtres, puis devient un filtre de plus. */
  function dateKey(v) { const d = v instanceof Date ? v : (typeof v === 'string' ? parseDateString(v) : null); return d && !isNaN(d) ? dateLabel(d) : null; }
  function textPred(it, t) {
    const terms = String(t.q == null ? '' : t.q).split(';').map(normName).filter(Boolean);
    if (!terms.length) return null;
    const memo = new Map(), op = t.op;
    const test = n => (op === 'notcontains' ? !terms.some(q => n.includes(q)) : op === 'starts' ? terms.some(q => n.startsWith(q)) : op === 'ends' ? terms.some(q => n.endsWith(q)) : op === 'equals' ? terms.some(q => n === q) : terms.some(q => n.includes(q)));
    return row => { const lab = it.dim(row); let r = memo.get(lab); if (r === undefined) { r = test(normName(lab)); memo.set(lab, r); } return r; };
  }
  function rangePred(it, r) {
    if (it.type === 'date') {
      const lo = typeof r.min === 'string' && r.min ? r.min : null, hi = typeof r.max === 'string' && r.max ? r.max : null;
      if (!lo && !hi) return null;
      return row => { const k = dateKey(it.val(row)); return k !== null && (!lo || k >= lo) && (!hi || k <= hi); };
    }
    const lo = Number.isFinite(r.min) ? r.min : null, hi = Number.isFinite(r.max) ? r.max : null;
    if (lo === null && hi === null) return null;
    return row => {
      const v = it.val(row), x = typeof v === 'number' ? v : (v == null || v instanceof Date ? NaN : parseNumber(v));
      return x === x && (lo === null || x >= lo) && (hi === null || x <= hi);
    };
  }
  function buildPass(rows, cat, L) {
    const byKey = new Map(cat.map(c => [c.key, c]));
    const sets = [], preds = [], tops = [];
    for (const k in L.filters || {}) { const it = byKey.get(k), ex = L.filters[k]; if (it && ex && ex.size) sets.push([it, ex]); }
    for (const k in L.rules || {}) {
      const it = byKey.get(k), r = L.rules[k];
      if (!it || !r || typeof r !== 'object' || it.calc) continue;
      if (r.text) { const p = textPred(it, r.text); if (p) preds.push(p); }
      if (r.range) { const p = rangePred(it, r.range); if (p) preds.push(p); }
      if (r.top && r.top.n > 0 && byKey.get(r.top.by)) tops.push([it, r.top, byKey.get(r.top.by)]);
    }
    if (!sets.length && !preds.length && !tops.length) return () => true;
    const base = row => { for (const [it, ex] of sets) if (ex.has(it.dim(row))) return false; for (const p of preds) if (!p(row)) return false; return true; };
    if (!tops.length) return base;
    const keeps = tops.map(([it, t, by]) => {
      const acc = new Map();
      for (const row of rows) {
        if (!base(row)) continue;
        const lab = it.dim(row);
        let a = acc.get(lab);
        if (!a) { a = { sum: 0, n: 0, nn: 0, min: Infinity, max: -Infinity }; acc.set(lab, a); }
        a.n++;
        const v = by.val(row), x = typeof v === 'number' ? v : (v == null || v instanceof Date ? NaN : parseNumber(v));
        if (x === x) { a.nn++; a.sum += x; if (x < a.min) a.min = x; if (x > a.max) a.max = x; }
      }
      const val = a => (t.agg === 'count' ? a.n : !a.nn ? null : t.agg === 'avg' ? a.sum / a.nn : t.agg === 'max' ? a.max : t.agg === 'min' ? a.min : a.sum);
      const flop = t.mode === 'flop', sgn = flop ? 1 : -1;
      const rank = [...acc].map(([l, a]) => ({ l, v: val(a) })).map(x => ({ l: x.l, v: x.v == null ? (flop ? Infinity : -Infinity) : x.v }))
        .sort((x, y) => (x.v === y.v ? 0 : sgn * (x.v < y.v ? -1 : 1)) || String(x.l).localeCompare(String(y.l), 'fr', { numeric: true }));
      return new Set(rank.slice(0, t.n).map(x => x.l));
    });
    return row => base(row) && tops.every(([it], i) => keeps[i].has(it.dim(row)));
  }

  // Lignes de données qui passent les filtres de la disposition (cases décochées + règles texte / plage / top)
  function filterRows(rows, cat, L) { return rows.filter(buildPass(rows, cat, L)); }

  function compute(rows, cat, L) {
    const byKey = new Map(cat.map(c => [c.key, c]));
    const rowDims = L.rows.map(k => byKey.get(k)).filter(Boolean);
    const colDims = L.cols.map(k => byKey.get(k)).filter(Boolean);
    const specs = L.vals.map(v => ({ item: byKey.get(v.key), agg: v.agg, fmt: v.fmt, name: v.name })).filter(s => s.item)
      .map(s => ({ item: s.item, agg: s.item.calc ? 'calc' : s.agg, fmt: s.fmt, key: s.item.key, label: (typeof s.name === 'string' && s.name.trim()) || specLabel(s.item, s.agg) }));
    if (!specs.length) return { empty: true };
    const K = specs.length;
    const filt = [];
    for (const k in L.filters || {}) { const it = byKey.get(k), ex = L.filters[k]; if (it && ex && ex.size) filt.push([it, ex]); }
    const pass = buildPass(rows, cat, L);   // règles (texte, plage, top) + valeurs exclues
    const mk = () => specs.map(s => {
      const a = { n: 0, nn: 0, sum: 0, min: Infinity, max: -Infinity, set: s.agg === 'countd' ? new Set() : null };
      if (s.agg === 'calc') { a.fn = s.item.fn; a.rs = s.item.refs.map(() => 0); a.rn = s.item.refs.map(() => 0); }
      return a;
    });
    const upd = (accs, row) => {
      for (let k = 0; k < K; k++) {
        const a = accs[k];
        if (a.rs) {   // champ calculé : somme de chaque champ de la formule
          const refs = specs[k].item.refs;
          for (let j = 0; j < refs.length; j++) {
            const rv = refs[j].val(row);
            if (rv == null) continue;
            const rx = typeof rv === 'number' ? rv : (rv instanceof Date ? NaN : parseNumber(rv));
            if (rx === rx) { a.rs[j] += rx; a.rn[j]++; }
          }
          a.n++; a.nn++;
          continue;
        }
        const v = specs[k].item.val(row);
        if (v == null) continue;
        a.n++;
        const x = typeof v === 'number' ? v : (v instanceof Date ? NaN : parseNumber(v));
        if (x === x) { a.nn++; a.sum += x; if (x < a.min) a.min = x; if (x > a.max) a.max = x; }
        if (a.set) a.set.add(dimLabel(v));
      }
    };
    // Top N : ne garder que les N premiers (ou derniers) libellés du 1er champ en Lignes, classés par la valeur k
    // (calculée par un premier passage) ; le reste est regroupé en « Autres » ou écarté.
    let top = null;
    const T = L.top;
    if (T && T.n > 0 && rowDims.length) {
      const kk = Math.min(Math.max(0, T.k | 0), K - 1), d0 = rowDims[0];
      const pre = compute(rows, cat, { rows: [d0.key], cols: [], vals: [{ key: specs[kk].key, agg: specs[kk].agg }], filters: L.filters, rules: L.rules, sort: null });
      const flop = T.mode === 'flop', sgn = flop ? 1 : -1;
      const rk = pre.rows.map(r => ({ l: r.labels[0], v: r.cells[0] == null ? (flop ? Infinity : -Infinity) : r.cells[0] }))
        .sort((a, b) => (a.v === b.v ? 0 : sgn * (a.v < b.v ? -1 : 1)) || String(a.l).localeCompare(String(b.l), 'fr', { numeric: true }));
      const keep = new Set(rk.slice(0, T.n).map(x => x.l));
      top = { key: d0.key, keep, others: T.others !== false, n: T.n, total: rk.length, hidden: Math.max(0, rk.length - keep.size) };
      if (top.others) rowDims[0] = Object.assign({}, d0, { dim: r => { const v = d0.dim(r); return keep.has(v) ? v : OTHERS_LABEL; } });
      else filt.push([{ dim: r => (keep.has(d0.dim(r)) ? '' : '\u0000') }, new Set(['\u0000'])]);
    }
    const subOn = !!L.subtotals && rowDims.length > 1;
    const subMaps = subOn ? rowDims.slice(0, -1).map(() => new Map()) : [];
    const rowMap = new Map(), colMap = new Map(), grand = mk();
    let nf = 0;
    outer:
    for (const row of rows) {
      if (!pass(row)) continue;
      for (const [it, ex] of filt) if (ex.has(it.dim(row))) continue outer;
      nf++;
      const rl = rowDims.map(d => d.dim(row)), cl = colDims.map(d => d.dim(row));
      const rk = rl.join('\u0001'), ck = cl.join('\u0001');
      let re = rowMap.get(rk);
      if (!re) { re = { labels: rl, key: rk, cols: new Map(), tot: mk() }; rowMap.set(rk, re); }
      let ce = colMap.get(ck);
      if (!ce) { ce = { labels: cl, key: ck, tot: mk() }; colMap.set(ck, ce); }
      let cell = re.cols.get(ck);
      if (!cell) { cell = mk(); re.cols.set(ck, cell); }
      upd(cell, row); upd(re.tot, row); upd(ce.tot, row); upd(grand, row);
      for (let lv = 0; lv < subMaps.length; lv++) {
        const sk = rl.slice(0, lv + 1).join('\u0001');
        let se = subMaps[lv].get(sk);
        if (!se) { se = { labels: rl.slice(0, lv + 1), cols: new Map(), tot: mk() }; subMaps[lv].set(sk, se); }
        let sc = se.cols.get(ck);
        if (!sc) { sc = mk(); se.cols.set(ck, sc); }
        upd(sc, row); upd(se.tot, row);
      }
    }
    if (!rowDims.length && !rowMap.size) rowMap.set('', { labels: [], key: '', cols: new Map(), tot: mk() });
    if (!colDims.length && !colMap.size) colMap.set('', { labels: [], key: '', tot: mk() });
    const rowDirs = rowDims.map(d => (L.rowDir || {})[d.key] || 1);
    const rEnt = [...rowMap.values()].sort((a, b) => cmpLabels(a.labels, b.labels, rowDirs));
    const cEnt = [...colMap.values()].sort((a, b) => cmpLabels(a.labels, b.labels));
    const den = (agg, k, ra, ca) => (agg === 'pctrow' ? (ra || grand)[k].sum : agg === 'pctcol' ? (ca || grand)[k].sum : grand[k].sum);
    const fin = (accs, k, ra, ca) => (accs ? finalize(accs[k], specs[k].agg, den(specs[k].agg, k, ra, ca)) : null);
    const outRows = rEnt.map(re => {
      const cells = [];
      cEnt.forEach(ce => { const a = re.cols.get(ce.key); for (let k = 0; k < K; k++) cells.push(a ? fin(a, k, re.tot, ce.tot) : null); });
      return { labels: re.labels, cells, tot: specs.map((_, k) => fin(re.tot, k, re.tot, null)), _acc: re.tot, _cellAcc: re.cols };
    });
    // subs[niveau] : Map(préfixe de libellés → { labels, cells, tot }) — lignes « Total <groupe> » des niveaux externes
    const subs = subMaps.map(m => new Map([...m].map(([sk, se]) => {
      const cells = [];
      cEnt.forEach(ce => { const a = se.cols.get(ce.key); for (let k = 0; k < K; k++) cells.push(a ? fin(a, k, se.tot, ce.tot) : null); });
      return [sk, { labels: se.labels, cells, tot: specs.map((_, k) => fin(se.tot, k, se.tot, null)) }];
    })));
    const res = {
      subs,
      rowDims: rowDims.map(d => d.label), rowKeys: rowDims.map(d => d.key), rowDirs, colDims: colDims.map(d => d.label), specs, K,
      top,
      rows: outRows,
      cols: cEnt.map(ce => ({ labels: ce.labels, key: ce.key })),
      bottom: [], grand: specs.map((_, k) => fin(grand, k, null, null)),
      n: rows.length, nf
    };
    cEnt.forEach(ce => specs.forEach((_, k) => res.bottom.push(fin(ce.tot, k, null, ce.tot))));
    const S = L.sort;
    if (S && S.k < K) {
      const ci = S.col === '__tot' ? -1 : res.cols.findIndex(c => c.key === S.col);
      if (S.col === '__tot' || ci >= 0) {
        const get = r => (ci < 0 ? r.tot[S.k] : r.cells[ci * K + S.k]);
        const getAccumulator = r => ci < 0 ? r._acc[S.k] : (r._cellAcc.get(res.cols[ci].key) || [])[S.k];
        res.rows = sortRows(res.rows, get, S.dir, specs[S.k].agg, getAccumulator);
      }
    }
    // « Autres » toujours en dernier (quel que soit le tri) ; les lignes d'un même groupe restent contiguës
    if (top && top.others) res.rows = res.rows.filter(r => r.labels[0] !== OTHERS_LABEL).concat(res.rows.filter(r => r.labels[0] === OTHERS_LABEL));
    // Les accumulateurs bruts ne sont utiles que pendant le tri : ne pas les conserver dans le résultat public.
    for (const row of res.rows) { delete row._acc; delete row._cellAcc; }
    return res;
  }

  // Lignes de données derrière une cellule : rowLabels / colLabels = libellés de la cellule (null = toutes).
  function drill(rows, cat, L, rowLabels, colLabels, top) {
    const byKey = new Map(cat.map(c => [c.key, c]));
    const test = [];
    L.rows.map(k => byKey.get(k)).filter(Boolean).forEach((d, i) => { if (rowLabels) test.push([d, rowLabels[i]]); });
    L.cols.map(k => byKey.get(k)).filter(Boolean).forEach((d, i) => { if (colLabels) test.push([d, colLabels[i]]); });
    const filt = [];
    for (const k in L.filters || {}) { const it = byKey.get(k), ex = L.filters[k]; if (it && ex && ex.size) filt.push([it, ex]); }
    const d0 = top && byKey.get(top.key);
    if (d0) {   // Top N : « Autres » = tout ce qui n'est pas dans le palmarès ; sans « Autres », les lignes hors palmarès sont écartées
      filt.push([{ dim: r => (top.keep.has(d0.dim(r)) ? '' : '\u0000') }, new Set(top.others ? [] : ['\u0000'])]);
      const i = test.findIndex(([d]) => d === d0);
      if (top.others && i >= 0 && test[i][1] === OTHERS_LABEL) test[i] = [{ dim: r => (top.keep.has(d0.dim(r)) ? '' : OTHERS_LABEL) }, OTHERS_LABEL];
    }
    const pass = buildPass(rows, cat, L);
    return rows.filter(r => pass(r) && filt.every(([it, ex]) => !ex.has(it.dim(r))) && test.every(([d, lab]) => d.dim(r) === lab));
  }

  /* ---------- export à plat (CSV / XLSX / presse-papiers) ---------- */
  // Sous-totaux à afficher après la ligne i : groupes qui se terminent à cette ligne, du niveau le plus profond au plus externe.
  function subtotalsAfter(res, i) {
    const out = [], r = res.rows[i], nx = res.rows[i + 1];
    for (let lv = res.subs.length - 1; lv >= 0; lv--) {
      const key = r.labels.slice(0, lv + 1).join('\u0001');
      if (nx && nx.labels.slice(0, lv + 1).join('\u0001') === key) break;   // le groupe continue : pas de sous-total (ni aux niveaux externes)
      const s = res.subs[lv].get(key);
      if (s) out.push(Object.assign({ level: lv }, s));
    }
    return out;
  }

  function flatMatrix(res, o) {
    const cd = res.colDims.length, rd = res.rowDims.length, nl = Math.max(1, rd);
    const showRowTot = !!o.rowTot && cd > 0, showBottom = !!o.colTot && rd > 0, showVal = true;
    const levels = cd + (showVal ? 1 : 0);
    const leaves = [];
    res.cols.forEach(c => res.specs.forEach((s, k) => leaves.push({ labels: c.labels, s, ci: leaves.length, k })));
    const hdr = [];
    for (let l = 0; l < levels; l++) {
      const line = [];
      for (let i = 0; i < nl; i++) line.push(l === levels - 1 ? (rd ? res.rowDims[i] : '') : '');
      leaves.forEach(x => line.push(l < cd ? x.labels[l] : x.s.label));
      if (showRowTot) res.specs.forEach(s => line.push(l < cd ? 'Total' : s.label));
      hdr.push(line);
    }
    const body = [];
    const pushRow = (labels, cells, tot) => {
      const line = labels.slice();
      while (line.length < nl) line.push('');
      for (let j = 0; j < leaves.length; j++) line.push(cells[j]);
      if (showRowTot) tot.forEach(v => line.push(v));
      body.push(line);
    };
    const subOn = !!o.subTot && res.subs && res.subs.length > 0;
    res.rows.forEach((r, i) => {
      pushRow(rd ? r.labels : ['Total'], r.cells, r.tot);
      if (subOn) subtotalsAfter(res, i).forEach(s => pushRow(s.labels.slice(0, -1).concat(['Total ' + s.labels[s.labels.length - 1]]), s.cells, s.tot));
    });
    if (showBottom) {
      const line = ['Total'];
      for (let i = 1; i < nl; i++) line.push('');
      res.bottom.forEach(v => line.push(v));
      if (showRowTot) res.grand.forEach(v => line.push(v));
      body.push(line);
    }
    return hdr.concat(body);
  }

  const api = {
    EMPTY, OTHERS_LABEL, AGG_LABELS, specLabel, normName, similarity, parseNumber, parseDateString, dateLabel, parseCSV,
    detectHeaderRow, columnsOf, unify, buildCatalog, compute, filterRows, drill, flatMatrix, subtotalsAfter
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PivotEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
