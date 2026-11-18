/* outils/pivot/app-graphique.js — Interface du tableau croisé (outils/statbel_pivot.html) : Graphique (SVG généré par PivotChart ; exports PNG / SVG).
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et outils/pivot/README.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- graphique (SVG généré par PivotChart ; PNG/SVG exportables) ---------- */
const PC = window.PivotChart;
// Configuration du graphique d'une vue. La vue ACTIVE vit dans `ch` (v.ch n'est qu'un instantané, rafraîchi par captureView) :
// toute lecture/écriture passe par chartOf / setChartOf pour ne jamais lire un instantané périmé ni se faire écraser.
function chartOf(v) { return v === curView() ? PC.normChart({ type: ch.type, k: ch.k, k2: ch.k2, gmax: ch.gmax, pos: ch.pos, o: ch.o }) : PC.normChart(v.ch); }
function applyChart(n) {   // n : configuration déjà nettoyée (PC.normChart) → singleton `ch` + contrôles
  ch.type = n.type; ch.k = n.k; ch.k2 = n.k2; ch.gmax = n.gmax; ch.pos = n.pos; ch.o = n.o;
  $('#chG').value = ch.gmax || ''; $('#chType').value = ch.type; syncChOpts();
}
function setChartOf(v, patch) {
  const n = PC.normChart(Object.assign(chartOf(v), patch));
  if (v === curView()) { applyChart(n); saveChart(); renderChart(); } else { v.ch = n; persistSession(); }
  if (st.dash.on) renderDash();
}
const saveChart = () => { try { localStorage.setItem('statbel_pivot_chart', JSON.stringify({ type: ch.type, k: ch.k, k2: ch.k2, gmax: ch.gmax, pos: ch.pos, o: ch.o })); } catch (e) { /* ignoré */ } persistSession(); };
// Fonds de carte (≈ 280 Ko) : chargés seulement quand une carte est demandée
const PG = window.PivotGeo;
let geoLoading = false, geoFailed = false;
function ensureGeo(after) {
  if (PG.ready() || geoLoading || geoFailed) return;
  geoLoading = true;
  PG.load(g => { geoLoading = false; if (!g) geoFailed = true; after(); });
}
const geoFor = () => (PG.ready() ? PG : null);
let fieldSig = null;   // liste des champs proposés par le panneau : mise à jour seulement quand le catalogue change (une liste ouverte n'est jamais reconstruite)
function renderChart() {
  renderSelBar();
  { const f = selFields(), sig = f.map(x => x.key + '=' + x.label).join('|') + '#' + cubeDim(); if (sig !== fieldSig) { fieldSig = sig; syncChOpts(); } }
  const res = curChartRes(), box = $('#chartBox'), has = res && !res.empty && res.rows.length;
  if (ch.type === 'map') ensureGeo(() => { renderChart(); if (st.dash.on) renderDash(); });
  $('#chK2').hidden = !(has && res.K > 1 && (ch.type === 'scatter' || ch.type === 'combo' || ch.type === 'pyramid'));
  { const tbOff = st.o.mode === 'list'; $('#btnTbOpts').hidden = tbOff; $('#tbOpts').hidden = tbOff; if (tbOff && tpanelOpen()) setTPanel(false); }
  { const noOpts = !has || ch.type === 'none'; $('#btnChOpts').hidden = noOpts; $('#chOpts').hidden = noOpts; if (noOpts && panelOpen()) setPanel(false); $('#cpType').textContent = PC.TYPES[ch.type] || ''; }
  if (has && res.K > 1) { $('#chK2').innerHTML = res.specs.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join(''); const k2 = ch.k2 >= 0 && ch.k2 < res.K && ch.k2 !== ch.k ? ch.k2 : (ch.k + 1) % res.K; $('#chK2').value = k2; }
  $('#chGL').hidden = !(has && ch.type === 'gauge');
  applyCaps();
  $('#chK').hidden = !has || res.K < 2;
  if (has && res.K > 1) { $('#chK').innerHTML = res.specs.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join(''); ch.k = Math.min(ch.k, res.K - 1); $('#chK').value = ch.k; }
  const body = $('#tvBody'), wide = window.innerWidth >= 1200 && window.innerWidth > 900;
  // Gauche / droite seulement sur écran large ; sinon repli : gauche → dessus, droite → dessous
  const pos = !wide && ch.pos === 'left' ? 'top' : !wide && ch.pos === 'right' ? 'bottom' : ch.pos;
  ['top', 'bottom', 'left', 'right'].forEach(p => body.classList.toggle('p-' + p, window.innerWidth > 900 && ch.type !== 'none' && p === pos));
  $('#chPosL').hidden = !(window.innerWidth > 900 && has && ch.type !== 'none');
  $('#chPos').value = ch.pos;
  [...$('#chPos').options].forEach(o => { o.disabled = !wide && (o.value === 'left' || o.value === 'right'); });
  box.hidden = false;   // visible pour mesurer la largeur disponible
  const bw = Math.round(box.clientWidth - 18), sideMode = pos === 'left' || pos === 'right';
  const plotH = window.innerWidth > 900 ? Math.round(Math.max(240, Math.min(560, window.innerHeight * (sideMode ? 0.6 : 0.38)))) : 300;
  const cs = getComputedStyle(document.documentElement);
  const th = { bg: cs.getPropertyValue('--panel').trim() || '#fff', ink: cs.getPropertyValue('--ink').trim() || '#1b2733', muted: cs.getPropertyValue('--muted').trim() || '#5a6b7b', line: cs.getPropertyValue('--line').trim() || '#d9e1e8' };
  const r = has ? PC.build(res, { type: ch.type, k: ch.k, k2: ch.k2, gmax: ch.gmax, o: ch.o, geo: geoFor(), fmt, theme: th, width: bw > 0 ? bw : 760, plotH }) : { svg: '', note: '' };
  if (r.pending && geoFailed) r.note = 'Fonds de carte indisponibles (fichier vendor/geo/geo-data.js introuvable).';
  ch.last = r.svg ? r : null;
  box.hidden = !r.svg && !(has && ch.type !== 'none' && r.note);
  $('#chart').innerHTML = r.svg;
  $('#chNote').textContent = r.note || '';
  $('#chBtns').hidden = !r.svg;
}
function applyCaps() {
  const hid = PCE.refreshVisibility(coBox, ch.type, ch.o), n = $('#coHidden');
  n.hidden = !hid || ch.type === 'none'; n.textContent = PCE.hiddenNote(hid);
}
function syncChOpts() { PCE.setFields(selFields(), cubeLabel()); PCE.fill(coBox, ch.o); applyCaps(); }
// Panneau « ⚙ Graphique » (tiroir) : fermé par défaut, ouvert par le bouton ; réglages appliqués en direct ; Échap / ✕ le ferment
const panelOpen = () => document.body.classList.contains('cp-open'), tpanelOpen = () => document.body.classList.contains('tp-open');
function setPanel(o) {
  if (o) setTPanel(false);   // un seul tiroir à la fois
  document.body.classList.toggle('cp-open', !!o); $('#btnChOpts').setAttribute('aria-expanded', String(!!o));
  if (o) { const f = $('#chOpts').querySelector('select, input'); if (f) f.focus(); }
}
// Panneau « ⚙ Tableau » (tiroir) : réglages du tableau croisé / de la table de la tuile (totaux, décimales, Top N, mise en forme)
function setTPanel(o) {
  if (o && panelOpen()) setPanel(false);
  document.body.classList.toggle('tp-open', !!o); $('#btnTbOpts').setAttribute('aria-expanded', String(!!o));
  if (o) { const f = $('#tbOpts').querySelector('select, input'); if (f) f.focus(); }
}
