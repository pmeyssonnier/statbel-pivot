/* js/ui/app-tableau.js — Interface du tableau croisé (index.html) : Tableau croisé, liste des données (composant « table ») et détail des lignes d'une cellule.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- tableau ---------- */
const fmt = (v, spec) => PF.formatValue(v, spec, st.o.dec);
// HTML du tableau d'un résultat : vue active et tuiles du tableau de bord (o = réglages d'affichage, L = disposition)
function tableHtml(res, o, L, folded, limit) {
  const fmt = (v, spec) => PF.formatValue(v, spec, o.dec);
  const K = res.K, cd = res.colDims.length, rd = res.rowDims.length, nl = Math.max(1, rd);
  const showRowTot = o.rowTot && cd > 0, showBottom = o.colTot && rd > 0, showVal = true;
  const levels = cd + (showVal ? 1 : 0);
  const leaves = [];
  res.cols.forEach(c => res.specs.forEach((s, k) => leaves.push({ labels: c.labels, s, k, key: c.key })));
  const sortAttr = (j, k, key) => `class="srt" data-col="${esc(j == null ? '__tot' : key)}" data-k="${k}"`;
  const arrow = (col, k) => (L.sort && L.sort.col === col && L.sort.k === k ? (L.sort.dir < 0 ? ' ▼' : ' ▲') : '');
  let h = '';
  for (let l = 0; l < levels; l++) {
    h += '<tr>';
    if (l === 0 && levels > 1) h += `<th class="corner fc" colspan="${nl}" rowspan="${levels - 1}">${esc(res.colDims.join(' › '))}</th>`;
    if (l === levels - 1) for (let i = 0; i < nl; i++) h += rd ? `<th class="rl srt${i === 0 ? ' fc' : ''}" data-rk="${esc(res.rowKeys[i])}" title="Trier cette colonne">${esc(res.rowDims[i])}${res.rowDirs[i] < 0 ? ' ▼' : ' ▲'}</th>` : '<th class="rl fc"></th>';
    if (l < cd) {
      for (let j = 0; j < leaves.length;) {
        const pre = leaves[j].labels.slice(0, l + 1).join('\u0001');
        let e = j + 1;
        while (e < leaves.length && leaves[e].labels.slice(0, l + 1).join('\u0001') === pre) e++;
        const sortable = !showVal && l === cd - 1;
        h += `<th colspan="${e - j}" ${sortable ? sortAttr(j, leaves[j].k, leaves[j].key) : ''}>${esc(leaves[j].labels[l])}${sortable ? arrow(leaves[j].key, leaves[j].k) : ''}</th>`;
        j = e;
      }
      if (showRowTot && l === 0) {
        h += showVal ? `<th class="tot" colspan="${K}" rowspan="${cd}">Total</th>`
          : `<th class="tot" rowspan="${cd}" ${sortAttr(null, 0)}>Total${arrow('__tot', 0)}</th>`;
      }
    } else {
      leaves.forEach((x, j) => { h += `<th ${sortAttr(j, x.k, x.key)}>${esc(x.s.label)}${arrow(x.key, x.k)}</th>`; });
      if (showRowTot) res.specs.forEach((s, k) => { h += `<th class="tot" ${sortAttr(null, k)}>${esc(s.label)}${arrow('__tot', k)}</th>`; });
    }
    h += '</tr>';
  }
  const shown = res.rows.slice(0, limit);
  const colVals = res.specs.map(() => []);
  if (o.cf !== 'none') shown.forEach(r => leaves.forEach((x, j) => { if (r.cells[j] != null) colVals[x.k].push(r.cells[j]); }));
  const styler = PF.buildStyler(o.cf, colVals, { op: o.cfOp, val: o.cfVal });
  // Lignes affichées = lignes de données + (option) lignes « Total <groupe> » des niveaux externes
  const disp = [];
  const subOn = !!o.subTot && res.subs.length > 0;
  const foldedAt = labels => {   // plus petit niveau replié parmi les groupes contenant ces libellés (-1 si aucun)
    for (let lv = 0; lv < res.subs.length; lv++) if (folded.has(lv + '|' + labels.slice(0, lv + 1).join('\u0001'))) return lv;
    return -1;
  };
  shown.forEach((r, i) => {
    if (!subOn) { disp.push({ r, i }); return; }
    if (foldedAt(r.labels) < 0) disp.push({ r, i });
    E.subtotalsAfter(res, i).forEach(s => { const f = foldedAt(s.labels); if (f < 0 || f === s.level) disp.push({ sub: s, folded: f === s.level }); });
  });
  // Clé du groupe de niveau l auquel appartient une ligne affichée (null si elle n'en fait pas partie)
  const gkey = (d, l) => (d.sub ? (l < d.sub.level ? d.sub.labels.slice(0, l + 1).join('\u0001') : null) : (rd ? d.r.labels : ['Total']).slice(0, l + 1).join('\u0001'));
  let b = '';
  disp.forEach((d, n) => {
    if (d.sub) {
      const s = d.sub, lv = s.level;
      const fk = lv + '|' + s.labels.slice(0, lv + 1).join('\u0001');
      b += `<tr class="sub${d.folded ? ' collapsed' : ''}"><th class="rlab${lv === 0 ? ' fc' : ''}" colspan="${nl - lv}"${d.folded ? ` data-fold="${esc(fk)}" title="Déplier ce groupe"` : ''}>${d.folded ? '<span class="fold">▸</span>' : ''}Total ${esc(s.labels[lv])}</th>`;
      s.cells.forEach((v, j) => { b += `<td data-sub="1">${esc(fmt(v, leaves[j].s))}</td>`; });
      if (showRowTot) s.tot.forEach((v, k) => { b += `<td class="tot">${esc(fmt(v, res.specs[k]))}</td>`; });
      b += '</tr>';
      return;
    }
    const { r, i } = d;
    b += '<tr>';
    const la = rd ? r.labels : ['Total'];
    for (let l = 0; l < nl; l++) {
      const key = gkey(d, l);
      if (n > 0 && gkey(disp[n - 1], l) === key) continue;
      let span = 1;
      while (n + span < disp.length && gkey(disp[n + span], l) === key) span++;
      const tg = subOn && rd && l < res.subs.length ? `<span class="fold" data-fold="${esc(l + '|' + la.slice(0, l + 1).join('\u0001'))}" title="Replier ce groupe">▾</span>` : '';
      b += `<th class="rlab${l === 0 ? ' fc' : ''}" rowspan="${span}">${tg}${esc(la[l])}</th>`;
    }
    leaves.forEach((x, j) => {
      const v = r.cells[j];
      const css = styler(v, x.k), style = css ? ` style="${css}"` : '';
      b += `<td data-r="${i}" data-c="${Math.floor(j / K)}"${style}>${esc(fmt(v, x.s))}</td>`;
    });
    if (showRowTot) r.tot.forEach((v, k) => { b += `<td class="tot" data-r="${i}" data-c="-1">${esc(fmt(v, res.specs[k]))}</td>`; });
    b += '</tr>';
  });
  if (showBottom) {
    b += `<tr class="tot"><th class="rlab fc" colspan="${nl}">Total</th>`;
    res.bottom.forEach((v, j) => { b += `<td data-r="-1" data-c="${Math.floor(j / K)}">${esc(fmt(v, res.specs[j % K]))}</td>`; });
    if (showRowTot) res.grand.forEach((v, k) => { b += `<td data-r="-1" data-c="-1">${esc(fmt(v, res.specs[k]))}</td>`; });
    b += '</tr>';
  }
  const cls = ['pv', 'pv-s-' + o.style, 'pv-d-' + o.density, 'pv-w-' + o.colw, o.freeze ? 'pv-freeze' : '', o.wrap ? 'pv-wrap' : ''].filter(Boolean).join(' ');
  return { subOn, html: `<table class="${cls}">${capHtml(o)}<thead>${h}</thead><tbody>${b}</tbody></table>`
    + (res.rows.length > limit ? `<p class="hint">Affichage limité à ${limit} lignes sur ${res.rows.length} (les exports contiennent tout).</p>` : '') };
}
function renderTable() {
  renderChart();
  const box = $('#out'), res = st.res, info = $('#info');
  const listOn = st.o.mode === 'list' && st.rows.length > 0;
  $('#listBar').hidden = !listOn; $('#optSort').hidden = listOn; $('#btnSwap').hidden = listOn; $('#foldBtns').hidden = $('#foldBtns').hidden || listOn;
  if (listOn) { renderList(false); return; }
  if (!st.rows.length) { box.innerHTML = '<p class="hint big">Ajoutez un ou plusieurs fichiers Excel pour commencer.</p>'; info.textContent = ''; return; }
  if (!res || res.empty) { box.innerHTML = '<p class="hint big">Ajoutez au moins un champ dans « Valeurs » (ou « Nombre de lignes »).</p>'; info.textContent = ''; return; }
  const t = tableHtml(res, st.o, st.L, st.folded, LIMIT);
  $('#foldBtns').hidden = !t.subOn;
  box.innerHTML = t.html;
  stickyHeads();
  info.textContent = `${res.nf.toLocaleString('fr-BE')} / ${res.n.toLocaleString('fr-BE')} lignes de données · ${res.rows.length.toLocaleString('fr-BE')} lignes × ${(res.cols.length * res.K).toLocaleString('fr-BE')} colonnes` + (res.top && res.top.hidden ? ` · ${st.o.topMode === 'flop' ? 'Derniers' : 'Top'} ${res.top.n} sur ${res.top.total.toLocaleString('fr-BE')}` : '');
}

/* ---------- liste des données : composant « table » (lignes filtrées, colonnes au choix, recherche, tri, pages) ---------- */
const ls = { q: '', page: 0, data: null }, LS_PAGE = 100;
const listFields = () => st.cat.filter(c => !c.derived && !c.valueOnly && !c.calc && c.idx !== undefined);
function listCols(o) {
  const keys = (o.listCols || []).filter(k => st.byKey.has(k) && !st.byKey.get(k).derived && !st.byKey.get(k).calc);
  return (keys.length ? keys.map(k => st.byKey.get(k)) : listFields()).slice(0, 60);
}
const cellOf = (it, r) => { const v = it.val(r); return v === null || v === undefined ? '' : v instanceof Date ? E.dateLabel(v) : typeof v === 'number' ? v.toLocaleString('fr-BE', { maximumFractionDigits: 6 }) : String(v); };
const cellRaw = (it, r) => { const v = it.val(r); return v === null || v === undefined ? '' : v instanceof Date ? E.dateLabel(v) : v; };
// données de la liste d'une vue : filtres de la disposition, recherche (vue active seulement), tri
function listData(o, L, q) {
  const cols = listCols(o);
  let rows = E.filterRows(st.rows, st.cat, L);
  const total = rows.length, nq = E.normName(q || '');
  if (nq) rows = rows.filter(r => E.normName(cols.map(c => cellOf(c, r)).join(' ')).includes(nq));
  const S = o.listSort, sc = S && cols.find(c => c.key === S.key);
  if (sc) {
    const key = r => { const v = sc.val(r); return v === null || v === undefined ? null : v instanceof Date ? v.getTime() : v; };
    rows = rows.map(r => [key(r), r]).sort((a, b) => {
      const x = a[0], y = b[0];
      if (x === null) return y === null ? 0 : 1; if (y === null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true })) * (S.dir === -1 ? -1 : 1);
    }).map(p => p[1]);
  }
  return { cols, rows, total };
}
function listHtml(d, o, from, count, interactive) {   // (capHtml : titre du tableau)
  const S = o.listSort, shown = d.rows.slice(from, from + count);
  return '<table class="pv ls pv-s-' + o.style + ' pv-d-' + o.density + '">' + capHtml(o) + '<thead><tr>' + d.cols.map(c => `<th${interactive ? ` data-ls="${esc(c.key)}" title="Trier"` : ''}>${esc(c.label)}${S && S.key === c.key ? (S.dir === -1 ? ' ▼' : ' ▲') : ''}</th>`).join('') + '</tr></thead><tbody>'
    + shown.map(r => '<tr>' + d.cols.map(c => `<td${c.type === 'number' ? ' class="num"' : ''}>${esc(cellOf(c, r))}</td>`).join('') + '</tr>').join('') + '</tbody></table>'
    + (d.rows.length > from + count && !interactive ? `<p class="hint">${count} premières lignes sur ${d.rows.length.toLocaleString('fr-BE')}.</p>` : '');
}
function renderList(keep) {
  const box = $('#out'), info = $('#info');
  if (!keep || !ls.data) ls.data = listData(st.o, st.L, ls.q);
  const d = ls.data, pages = Math.max(1, Math.ceil(d.rows.length / LS_PAGE));
  ls.page = Math.min(ls.page, pages - 1);
  box.innerHTML = d.rows.length ? listHtml(d, st.o, ls.page * LS_PAGE, LS_PAGE, true) : '<p class="hint big">Aucune ligne ne correspond aux filtres ou à la recherche.</p>';
  $('#lsPage').textContent = `page ${ls.page + 1} / ${pages}`; $('#lsPrev').disabled = ls.page === 0; $('#lsNext').disabled = ls.page >= pages - 1;
  info.textContent = `${d.rows.length.toLocaleString('fr-BE')} ligne(s)${d.rows.length !== d.total ? ' (sur ' + d.total.toLocaleString('fr-BE') + ' après filtres)' : ''} × ${d.cols.length} colonne(s)`;
  stickyHeads();
}
let lsT = null;

/* ---------- détail des lignes d'une cellule ---------- */
let detail = null;
function openDetail(r, c) {
  const res = st.res; if (!res || res.empty) return;
  const rl = r >= 0 && res.rowDims.length ? res.rows[r].labels : null, cl = c >= 0 && res.colDims.length ? res.cols[c].labels : null;
  const recs = E.drill(st.rows, st.cat, st.L, rl, cl, res.top);
  const fields = st.fields;
  detail = [fields.map(f => f.label)].concat(recs.map(x => x.map(v => (v instanceof Date ? E.dateLabel(v) : v))));
  const ctx = [].concat(rl ? res.rowDims.map((d, i) => d + ' = ' + rl[i]) : [], cl ? res.colDims.map((d, i) => d + ' = ' + cl[i]) : []);
  $('#dTitle').textContent = recs.length.toLocaleString('fr-BE') + ' ligne(s)' + (ctx.length ? ' — ' + ctx.join(' ; ') : '');
  const cap = recs.slice(0, 1000);
  $('#dBody').innerHTML = '<table class="map"><thead><tr>' + fields.map(f => `<th>${esc(f.label)}</th>`).join('') + '</tr></thead><tbody>'
    + cap.map(x => '<tr>' + x.map(v => `<td>${esc(v instanceof Date ? E.dateLabel(v) : v == null ? '' : v)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'
    + (recs.length > 1000 ? '<p class="hint">1000 premières lignes affichées (l’export contient tout).</p>' : '');
  $('#dlgDetail').showModal();
}
