/* outils/pivot/app-init-donnees.js — Interface du tableau croisé (index.html) : Démarrage (1/5) : état, fichiers, jointures, aperçu, navigation, accordéons, info-bulle.
 * Chargé APRÈS tous les fichiers app*.js (fonctions et constantes existent alors). Les instructions sont dans l'ordre EXACT de l'ancien
 * app.js (IIFE unique découpée), réparties sur les cinq fichiers app-init-* : ne pas les réordonner ni changer l'ordre de chargement. */
'use strict';
{   // badge créé par le script si la page HTML en cache n'en contient pas encore (HTML périmé + JS à jour)
  let pv = document.getElementById('pvVer');
  if (!pv) { pv = document.createElement('small'); pv.id = 'pvVer'; pv.title = "Version de l'outil (voir CHANGELOG.md)"; const h1 = document.querySelector('header h1'); if (h1) h1.insertAdjacentElement('afterend', pv); }
  pv.className = 'ver'; pv.textContent = 'v' + PIVOT_VERSION; window.PIVOT_VERSION = PIVOT_VERSION;
}
const st = {
  sources: [], over: {}, fields: [], rows: [], cat: [], byKey: new Map(), nid: 0, res: null, search: '',
  L: { rows: ['__source'], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null },
  measures: [],   // mesures : [{ id, name, kind, src, agg, conds }]
  groups: [],   // groupes de valeurs : [{ id, name, src, kind, groups | breaks, … }]
  calcs: [],   // champs calculés : [{ name, formula }] (conservés sur l'appareil, indépendants des fichiers)
  calcErrors: [],
  joins: [],   // jointures entre fichiers : [{ id, name, left, right, keys, type, dup, cols, use }] — sources virtuelles recalculées
  njid: 0,
  folded: new Set(),   // groupes repliés : « niveau|libellés » (affichage seulement ; les exports gardent tout)
  o: Object.assign({ rowTot: true, colTot: true, subTot: false, mode: 'pivot', listCols: [], listSort: null, topN: 0, topMode: 'top', topK: 0, topOthers: true, cf: 'none', cfOp: '>', cfVal: '', dec: 'auto', style: 'standard', density: 'normal', colw: 'auto', freeze: true, wrap: true, cap: '', capH: 'left', capV: 'top' }, loadOpts())
};

/* ---------- ajout de fichiers « actualisables » + actualisation (Chrome / Edge : poignées de fichier) ---------- */
$('#wzAdd').addEventListener('click', pickFiles);
$('#btnRefresh').addEventListener('click', () => refreshData(false));
$('#optAuto').addEventListener('change', e => { try { window.localStorage.setItem('statbel_pivot_auto', e.target.checked ? '1' : '0'); } catch (x) { /* ignoré */ } if (e.target.checked) checkAndMaybeRefresh(); });
window.addEventListener('focus', checkAndMaybeRefresh);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAndMaybeRefresh(); });

/* ---------- jointures entre fichiers : sources virtuelles « ⨝ » recalculées à chaque reconstruction ---------- */
$('#wzJoin').addEventListener('click', () => openJoin(null));
$('#jClose').addEventListener('click', () => $('#dlgJoin').close());
$('#jNew').addEventListener('click', () => fillJoinForm(null));
$('#jSave').addEventListener('click', saveJoin);
$('#jList').addEventListener('click', ev => {
  const t = ev.target.closest('[data-jact]'); if (!t) return;
  const d = st.joins.find(x => x.id === t.dataset.id); if (!d) return;
  if (t.dataset.jact === 'edit') fillJoinForm(d);
  else { st.joins = st.joins.filter(x => x.id !== d.id); rebuild(); fillJoinForm(null); $('#jPrev').textContent = 'Jointure « ' + d.name + ' » supprimée.'; }
});
$('#dlgJoin').addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'jLeft' || t.id === 'jRight') { jKeyRows(null); jColsRows(null); }
  else if (t.dataset && t.dataset.jk) { jColsRows(null); }
  previewJoin();
});

/* ---------- aperçu et contrôle qualité des données ---------- */
$('#btnPreview').addEventListener('click', () => { if (!st.rows.length) return; pvProf = null; $('#pvSrc').innerHTML = ''; $('#dlgPreview').showModal(); setPvTab('qual'); });
$('#dlgPreview .pvtabs').addEventListener('click', ev => { const b = ev.target.closest('button[data-pv]'); if (b) setPvTab(b.dataset.pv); });
$('#pvSrc').addEventListener('change', drawPvRaw);
$('#pvCsv').addEventListener('click', exportQuality);
$('#pvClose').addEventListener('click', () => $('#dlgPreview').close());

/* ---------- mobile : écran « Configurer » / écran « Tableau » ---------- */
$('#btnCfg').addEventListener('click', () => setMode(curMode() === 'cfg' ? 'table' : 'cfg'));
$('#btnView').addEventListener('click', () => setMode('table'));

/* ---------- menu « Données » : colonne d'icônes (élargissable sur PC), tiroir sur téléphone ---------- */
{
  const tg = $('#railTg'), ic = tg.querySelector('i'), wide = () => document.body.classList.contains('rail-wide');
  const syncTg = () => { const w = wide(); tg.setAttribute('aria-expanded', String(w)); ic.textContent = w ? '◂' : '▸'; tg.title = w ? 'Replier le menu' : 'Élargir le menu'; tg.querySelector('.lb').textContent = w ? 'Replier le menu' : 'Élargir le menu'; };
  try { if (localStorage.getItem('statbel_pivot_rail') === '1') document.body.classList.add('rail-wide'); } catch (e) { /* ignoré */ }
  syncTg();
  tg.addEventListener('click', () => {
    document.body.classList.toggle('rail-wide'); syncTg();
    try { localStorage.setItem('statbel_pivot_rail', wide() ? '1' : '0'); } catch (e) { /* ignoré */ }
    window.dispatchEvent(new Event('resize'));   // la place disponible change : graphiques et tuiles se recalculent
  });
  const openDrawer = o => { document.body.classList.toggle('rail-open', o); $('#btnRail').setAttribute('aria-expanded', String(o)); $('#railScrim').hidden = !o; };
  $('#btnRail').addEventListener('click', () => openDrawer(!document.body.classList.contains('rail-open')));
  $('#railScrim').addEventListener('click', () => openDrawer(false));
  $('#rail').addEventListener('click', ev => { if (ev.target.closest('.it') && !ev.target.closest('#railTg')) openDrawer(false); });
  $('#btnCfgPc').addEventListener('click', () => { const o = !document.body.classList.contains('cfg-open'); closePops(); document.body.classList.toggle('cfg-open', o); $('#btnCfgPc').setAttribute('aria-expanded', String(o)); });
  document.addEventListener('click', ev => { if (document.body.classList.contains('cfg-open') && !ev.target.closest('aside, #cfgZones, #btnCfgPc, dialog, .menu')) closePops(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) closePops(); });
  // Infobulles riches (nom + description) : survol (même sur un bouton désactivé : on teste la position) et clavier ; pas sur écran tactile
  const tip = $('#railTip'); let tipT = 0;
  const hide = () => { clearTimeout(tipT); tip.classList.remove('on'); };
  const show = b => {
    const wideRail = document.body.classList.contains('rail-wide'), name = b.getAttribute('aria-label') || '';
    tip.innerHTML = (wideRail ? '' : '<b>' + esc(name) + '</b>') + '<span>' + esc(b.dataset.d || '') + '</span>' + (b.disabled ? '<em>Indisponible pour le moment (ajoutez des fichiers, ou au moins deux pour une jointure).</em>' : '');
    tip.classList.add('on');
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight; let x = r.right + 8; if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2)) + 'px';
  };
  const hoverOk = () => window.matchMedia && window.matchMedia('(hover:hover)').matches && window.innerWidth > 900;
  let shownFor = null;
  const under = ev => [...$('#rail').querySelectorAll('.it[data-d]')].find(b => { if (b.hidden) return false; const r = b.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
  $('#rail').addEventListener('mousemove', ev => { if (!hoverOk()) return; const b = under(ev); if (b === shownFor) return; shownFor = b || null; hide(); if (b) tipT = setTimeout(() => show(b), 250); });
  $('#rail').addEventListener('mouseleave', () => { shownFor = null; hide(); });
  $('#rail').addEventListener('focusin', ev => { const b = ev.target.closest('.it[data-d]'); if (b && hoverOk()) show(b); });
  $('#rail').addEventListener('focusout', hide); $('#rail').addEventListener('click', hide);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') hide(); });
}

/* ---------- exclure des colonnes / inverser lignes et colonnes ---------- */
$('#btnSwap').addEventListener('click', swapAxes);

/* ---------- accordéons (Sources / Champs / zones) : état mémorisé sur l'appareil ---------- */
try {
  const sv = JSON.parse(localStorage.getItem('statbel_pivot_acc') || '{}') || {};
  ACC.forEach(id => { if (sv[id] === false) $('#' + id).open = false; });
} catch (e) { /* stockage indisponible : tout ouvert */ }
ACC.forEach(id => $('#' + id).addEventListener('toggle', () => {
  try { const o = {}; ACC.forEach(k => { o[k] = $('#' + k).open; }); localStorage.setItem('statbel_pivot_acc', JSON.stringify(o)); } catch (e) { /* ignoré */ }
}));

/* ---------- info-bulle immédiate : nom complet d'un libellé tronqué (liste des champs, onglets, tuiles) ---------- */
const tipEl = document.createElement('div');
tipEl.id = 'fieldTip';
tipEl.setAttribute('role', 'tooltip');
tipEl.hidden = true;
document.body.appendChild(tipEl);
document.addEventListener('mouseover', ev => { const el = ev.target.closest && ev.target.closest(TIP_SEL); if (el) showTip(el, ev); else if (!tipEl.hidden) tipEl.hidden = true; });
document.addEventListener('mouseleave', () => { tipEl.hidden = true; }, true);
window.addEventListener('scroll', () => { tipEl.hidden = true; }, true);
