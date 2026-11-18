/* outils/pivot/app-navigation.js — Interface du tableau croisé (outils/statbel_pivot.html) : Navigation : mobile, menu « Données », exclusions / inversion, accordéons, info-bulle, panneau des sources, liste des champs, zones, grand écran.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et outils/pivot/README.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- mobile : écran « Configurer » / écran « Tableau » ---------- */
function setMode(m) {
  document.body.classList.toggle('m-cfg', m === 'cfg');
  document.body.classList.toggle('m-table', m === 'table');
  $('#btnCfg').textContent = m === 'cfg' ? '▦ Tableau' : '⚙ Configurer';
  window.scrollTo(0, 0);
}
const curMode = () => (document.body.classList.contains('m-table') ? 'table' : 'cfg');

/* ---------- exclure des colonnes / inverser lignes et colonnes ---------- */
const fieldKeyOf = name => 'f:' + (E.normName(name) || String(name).trim());
function removeField(key) {
  st.sources.forEach(s => E.columnsOf(s).forEach(c => {
    const k = s.id + '|' + c.col, target = st.over[k] === undefined ? c.name : st.over[k];
    if (String(target).trim() && fieldKeyOf(String(target).trim()) === key) st.over[k] = '';
  }));
  rebuild();
}
const nbExclues = () => Object.keys(st.over).filter(k => st.over[k] === '').length;
function swapAxes() {
  const L = st.L;
  [L.rows, L.cols] = [L.cols, L.rows];
  L.sort = null;
  renderZones(); refresh();
}

/* ---------- accordéons (Sources / Champs / zones) : état mémorisé sur l'appareil ---------- */
const ACC = ['accFld', 'accZ_filters', 'accZ_cols', 'accZ_rows', 'accZ_vals'];

/* ---------- info-bulle immédiate : nom complet d'un libellé tronqué (liste des champs, onglets, tuiles) ---------- */
const TIP_SEL = '.fld .fl, .vtabs .vt, .tile .th b, #btnProj, .chip > a, .chip > span:first-child';
function showTip(el, ev) {
  const full = el.dataset.full || el.getAttribute('title') || el.textContent;
  if (!full || el.scrollWidth <= el.clientWidth + 1) { tipEl.hidden = true; return; }   // pas tronqué : rien à ajouter
  tipEl.textContent = full.replace(/ — glisser pour réordonner$/, ''); tipEl.hidden = false;
  const r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  tipEl.style.left = Math.max(6, Math.min(window.innerWidth - tw - 6, ev.clientX + 12)) + 'px';
  tipEl.style.top = (r.bottom + th + 8 > window.innerHeight ? Math.max(6, r.top - th - 6) : r.bottom + 4) + 'px';
}

/* ---------- panneau sources ---------- */
function renderSources() { renderSourcesList(); if ($('#dlgWiz').open) wzRender(); }
function renderSourcesList() {
  const box = $('#sources');
  updateRefreshUi();
  $('#wzSrcInfo').textContent = st.sources.length ? '· ' + st.sources.filter(s => s.use && !s.join).length + ' feuille(s)' : '';
  $('#wzJoinInfo').textContent = st.sources.some(x => x.join) ? '· ' + st.sources.filter(x => x.join).length : '';
  $('#accFldInfo').textContent = st.cat.length ? '· ' + st.cat.filter(c => !c.derived).length : '';
  if (!st.sources.length) { box.innerHTML = '<p class="hint">Aucun fichier. Glissez-déposez des .xlsx / .xls / .csv ici.</p>'; $('#wzMap').disabled = true; $('#btnCube').disabled = true; $('#wzJoin').disabled = true; $('#btnPreview').disabled = true; return; }
  $('#wzMap').disabled = false; $('#btnCube').disabled = !st.rows.length; $('#wzJoin').disabled = st.sources.filter(s => !s.join).length < 2; $('#btnPreview').disabled = !st.rows.length;
  box.innerHTML = st.sources.map(s => `<div class="src ${s.use ? '' : 'off'}" data-id="${s.id}">
      <label class="srcname"><input type="checkbox" data-act="use" ${s.use ? 'checked' : ''}> <span>${esc(s.label)}</span></label>
      <span class="meta">${s.aoa.length - 1 - s.headerRow} lignes${s.handle ? ' · ↻ actualisable' : ''}${s.join ? ' · jointure' : ''}</span>
      ${s.join ? '<button type="button" class="jb" data-act="editjoin" title="Modifier cette jointure">✎ Modifier</button>' : `<label class="meta">en-tête ligne <input type="number" min="1" max="${s.aoa.length}" value="${s.headerRow + 1}" data-act="hdr" class="nbr"></label>`}
      <button class="x" data-act="delsrc" title="Retirer">×</button></div>`).join('')
    + (nbExclues() ? `<p class="hint">${nbExclues()} colonne(s) exclue(s) · <button type="button" data-act="restore">Tout réafficher</button></p>` : '');
}
// Titre d'un tableau (légende) : texte libre, aligné à gauche / au centre / à droite, au-dessus ou en dessous
const capHtml = o => (o.cap ? `<caption class="pv-cap" style="caption-side:${o.capV === 'bottom' ? 'bottom' : 'top'};text-align:${['center', 'right'].includes(o.capH) ? o.capH : 'left'}">${esc(o.cap)}</caption>` : '');

/* ---------- liste des champs ---------- */
const TYPE = { number: '123', date: 'date', text: 'abc' };
function renderFields() {
  const q = E.normName(st.search);
  const list = st.cat.filter(c => !q || E.normName(c.label).includes(q));
  // Dimensions (à ranger en lignes / colonnes / filtres) puis Mesures (à calculer dans « Valeurs ») : un champ numérique qui est un niveau de hiérarchie (ex. Année) reste une dimension
  const inHier = k => st.hier.some(h => h.levels.includes(k)), isMeasure = c => !!(c.valueOnly || c.measure || c.calc) || (c.type === 'number' && !inHier(c.key));
  const fld = c => `<div class="fld ${c.derived ? 'der' : ''}" draggable="true" data-key="${esc(c.key)}">
      <span class="badge ${c.type}">${TYPE[c.type]}</span><span class="fl" data-full="${esc(c.label)}">${esc(c.label)}</span>
      ${c.nsrc && c.nsrc < activeCount() ? `<span class="warn" title="Présent dans ${c.nsrc} source(s) sur ${activeCount()}">${c.nsrc}/${activeCount()}</span>` : ''}
      <span class="btns">${c.calc ? `<button data-act="calcedit" data-name="${esc(c.label)}" title="Modifier la formule : ${esc(c.formula)}">✎</button><button data-act="calcdel" data-name="${esc(c.label)}" title="Supprimer ce champ calculé">×</button>` : ''}${c.valueOnly || c.derived || c.key === '__source' ? '' : '<button data-act="delfield" title="Exclure cette colonne des fichiers sources">⊘</button>'}${c.valueOnly ? '' : '<button data-act="add" data-z="filters" title="Filtre">F</button><button data-act="add" data-z="cols" title="Colonnes">C</button><button data-act="add" data-z="rows" title="Lignes">L</button>'}<button data-act="add" data-z="vals" title="Valeurs">V</button></span></div>`;
  const grp = (t, a) => (a.length ? `<div class="fgrp">${t} <span class="meta">· ${a.length}</span></div>` + a.map(fld).join('') : '');
  $('#fields').innerHTML = grp('Dimensions', list.filter(c => !isMeasure(c))) + grp('Mesures', list.filter(isMeasure)) || '<p class="hint">Aucun champ.</p>';
}
const activeCount = () => st.sources.filter(s => s.use).length;

/* ---------- zones ---------- */
function defAgg(item) { return item.agg0 || (item.type === 'number' ? 'sum' : 'countd'); }
function addTo(zone, key) {
  const item = st.byKey.get(key), L = st.L;
  if (!item || (item.valueOnly && zone !== 'vals')) return;
  if (zone === 'vals') L.vals.push({ key, agg: item.key === '__rows' ? 'sum' : defAgg(item) });
  else {
    if (zone === 'rows' || zone === 'cols') { L.rows = L.rows.filter(k => k !== key); L.cols = L.cols.filter(k => k !== key); }
    if (zone === 'filters') { if (!L.filters[key]) L.filters[key] = new Set(); }
    else L[zone].push(key);
  }
  L.sort = null;
  renderZones(); refresh();
}
// Libellés courts des règles d'un filtre (texte, plage, top) pour la pastille du champ
const OP_LABEL = { contains: 'contient', notcontains: 'ne contient pas', starts: 'commence par', ends: 'finit par', equals: '=' };
function ruleBadges(k) {
  const r = (st.L.rules || {})[k], out = [];
  if (!r) return out;
  if (r.text) out.push(`${OP_LABEL[r.text.op] || ''} « ${r.text.q.length > 18 ? r.text.q.slice(0, 17) + '…' : r.text.q} »`);
  if (r.range) out.push(`${r.range.min !== undefined ? r.range.min : '…'} → ${r.range.max !== undefined ? r.range.max : '…'}`);
  if (r.top) out.push(`${r.top.mode === 'flop' ? 'derniers' : 'top'} ${r.top.n}`);
  return out;
}
// Retire les règles dont le champ (ou le champ de classement) n'existe plus, ou dont le champ n'est plus un filtre
function pruneRules(L) {
  if (!L.rules) { L.rules = {}; return; }
  Object.keys(L.rules).forEach(k => {
    const r = L.rules[k];
    if (!st.byKey.has(k) || !(k in L.filters)) { delete L.rules[k]; return; }
    if (r.top && !st.byKey.has(r.top.by)) delete r.top;
    if (!r.text && !r.range && !r.top) delete L.rules[k];
  });
}
function renderZones() {
  const L = st.L, lab = k => (st.byKey.get(k) || {}).label || k;
  const chip = (z, i, inner) => `<span class="chip" data-z="${z}" data-i="${i}">${inner}<button data-act="rm" title="Retirer">×</button></span>`;
  const mv = '<button data-act="mv" data-d="-1" title="Avancer">‹</button><button data-act="mv" data-d="1" title="Reculer">›</button>';
  const html = {
    filters: Object.keys(L.filters).map((k, i) => {
      const n = L.filters[k].size, info = [n ? `${n} exclu${n > 1 ? 's' : ''}` : ''].concat(ruleBadges(k)).filter(Boolean);
      return `<span class="chip" data-z="filters" data-key="${esc(k)}"><a href="#" data-act="filt">${esc(lab(k))}${info.length ? ` <em>(${esc(info.join(' · '))})</em>` : ''}</a><button data-act="rm" title="Retirer">×</button></span>`;
    }),
    cols: L.cols.map((k, i) => chip('cols', i, esc(lab(k)) + mv)),
    rows: L.rows.map((k, i) => chip('rows', i, esc(lab(k)) + mv)),
    vals: L.vals.map((v, i) => {
      const item = st.byKey.get(v.key) || { label: v.key };
      return chip('vals', i, `<span>${esc(item.label)}</span>${item.calc ? '<span class="calcmark" title="Champ calculé : ' + esc(item.formula) + '">ƒ</span>' : ''}<button type="button" data-act="vname" class="ren${v.name ? ' on' : ''}" title="${v.name ? 'Renommé « ' + esc(v.name) + ' » — cliquer pour modifier' : 'Renommer cette valeur (titre dans le tableau, le graphique et les exports)'}" aria-label="Renommer">✎</button>${item.calc ? '' : `<select data-act="agg">${Object.keys(E.AGG_LABELS).map(a => `<option value="${a}" ${a === v.agg ? 'selected' : ''}>${esc(E.AGG_LABELS[a])}</option>`).join('')}</select>`}<select data-act="vfmt" title="Format du nombre">${Object.keys(PF.FORMATS).map(f => `<option value="${f}" ${f === (v.fmt || 'auto') ? 'selected' : ''}>${esc(PF.FORMATS[f])}</option>`).join('')}</select>`);
    })
  };
  const names = a => a.map(lab).join(' › ') || '—';
  const nf = Object.keys(L.filters).filter(k => L.filters[k].size || ruleBadges(k).length).length;
  $('#summary').innerHTML = `<b>Lignes</b> ${esc(names(L.rows))} · <b>Colonnes</b> ${esc(names(L.cols))} · <b>Valeurs</b> `
    + esc(L.vals.map(v => { const it = st.byKey.get(v.key); return it ? (v.name || (it.calc ? it.label : E.AGG_LABELS[v.agg] + ' ' + it.label)) : v.key; }).join(', ') || '—')
    + (nf ? ` · <b>Filtres</b> ${nf}` : '');
  document.querySelectorAll('.zone').forEach(z => {
    const k = z.dataset.zone;
    z.querySelector('.zc').innerHTML = html[k].join('') || '<span class="hint">Déposez un champ ici</span>';
    $('#accInfo_' + k).textContent = html[k].length ? '· ' + html[k].length : '';   // repéré même quand la zone est repliée
  });
}

/* ---------- grand écran : mode agrandi, en-têtes de tableau collants ---------- */
// Chaque ligne d'en-tête reste visible en haut du cadre de défilement, sous la précédente.
function stickyHeads() {
  let top = 0;
  document.querySelectorAll('#out thead tr').forEach(tr => {
    tr.querySelectorAll('th').forEach(th => { th.style.top = top + 'px'; });
    top += tr.getBoundingClientRect().height;
  });
}
const focusOn = () => document.body.classList.contains('d-focus');
function setFocus(on, save) {
  document.body.classList.toggle('d-focus', !!on); closePops();
  $('#btnFocus').textContent = on ? '⮌ Réduire' : '⛶ Agrandir';
  if (save) { try { localStorage.setItem('statbel_pivot_focus', on ? '1' : '0'); } catch (e) { /* ignoré */ } }
  renderChart(); if (st.dash.on) renderDash(); stickyHeads();
}
let rsT = null, lastW = window.innerWidth;
