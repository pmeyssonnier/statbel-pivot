/* js/ui/app-vues.js — Interface du tableau croisé (index.html) : Vues (onglets), tableau de bord (tuiles, impression) et sélecteurs d'une vue.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- vues : plusieurs tableaux / graphiques différents sur les mêmes données (onglets) ---------- */
// Une vue = disposition (lignes, colonnes, valeurs, filtres, tris), réglages d'affichage et réglage du graphique.
// Les sources, fusions de colonnes et champs calculés sont communs à toutes les vues.
const MAX_VIEWS = 12;
const curView = () => st.views.find(v => v.id === st.curView) || st.views[0];
function captureView() {   // range l'état courant dans la vue active
  const v = curView();
  v.L = st.L; v.o = st.o; v.folded = st.folded; v.ch = { type: ch.type, k: ch.k, k2: ch.k2, gmax: ch.gmax, pos: ch.pos, o: Object.assign({}, ch.o) };
}
function loadView(v) {
  const L = v.L || { rows: [], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null };
  const ok = k => st.byKey.has(k);   // champs disparus depuis (colonne exclue, fichier retiré) : écartés
  L.rows = L.rows.filter(ok); L.cols = L.cols.filter(ok); L.vals = L.vals.filter(x => ok(x.key));
  Object.keys(L.filters || {}).forEach(k => { if (!ok(k)) delete L.filters[k]; });
  L.filters = L.filters || {}; pruneRules(L);
  st.L = L; st.o = v.o || st.o; st.folded = v.folded || new Set();
  if (v.ch) applyChart(PC.normChart(v.ch));
  $('#chType').value = ch.type;
  applyOptsToControls(); renderZones(); refresh();
}
// Champ supprimé (groupe, mesure) : retiré de TOUTES les vues (zones, filtres, règles, sélecteurs). Son identifiant peut être réattribué : aucune trace ne doit rester.
function dropFieldEverywhere(key) {
  st.views.forEach(v => { const L = v === curView() ? st.L : v.L; if (L) window.PivotLayouts.dropKey(L, key); if (Array.isArray(v.sel)) v.sel = v.sel.filter(s => s.key !== key); });
  st.dash.sel = (st.dash.sel || []).filter(s => s.key !== key);
  if (st.cube.chart === key) st.cube.chart = '';
  st.cube.filters = st.cube.filters.filter(k => k !== key);
  st.hier = window.PivotHier.sanitize(st.hier.map(h => ({ name: h.name, levels: h.levels.filter(k => k !== key) })));
  st.views.forEach(v => { const c = v === curView() ? ch : v.ch; if (c && c.o) { if (c.o.cdim === key) c.o.cdim = ''; if (c.o.cdim2 === key) c.o.cdim2 = ''; } });
}
// Navigation à deux niveaux : 1 = tableau de bord (tuiles), 2 = une vue ouverte. Fil d'Ariane « ← Tableau de bord › Vue ▾ ⋯ » ; le menu ▾ liste les vues,
// le menu ⋯ regroupe renommer / dupliquer / déplacer / supprimer. Tous les boutons gardent leurs data-view / data-vact (une seule source pour les gestes).
function renderViews() {
  const cur = curView(), n = st.views.length, idx = st.views.indexOf(cur), lvl1 = st.dash.on;
  const items = st.views.map(v => `<button type="button" role="menuitemradio" class="vt${v === cur ? ' on' : ''}" aria-checked="${v === cur}" data-view="${v.id}" title="${esc(v.name)}">${esc(v.name)}</button>`).join('');
  const b = (a, label, title, dis, cls) => `<button type="button" role="menuitem" class="vi${cls ? ' ' + cls : ''}" data-vact="${a}" title="${title}"${dis ? ' disabled' : ''}>${label}</button>`;
  $('#viewTabs').innerHTML = (lvl1
    ? '<span class="crumb-cur">Tableau de bord</span>'
    : `<button type="button" class="crumb-back" data-vact="dash" title="Revenir au tableau de bord (toutes les vues en tuiles)"${n > 1 ? '' : ' hidden'}>← Tableau de bord</button><span class="meta crumb-sep"${n > 1 ? '' : ' hidden'}>›</span>`
      + (n > 1 ? '<button type="button" class="vi" data-vact="prev" aria-label="Tuile précédente" title="Tuile précédente">‹</button>' : '')
      + `<button type="button" class="vcur" id="vsel" aria-haspopup="menu" aria-expanded="false" title="Changer de vue ou en créer une">${esc(cur.name)} ▾</button><button type="button" class="vi" id="vact" aria-haspopup="menu" aria-expanded="false" title="Actions sur cette vue (renommer, dupliquer, déplacer, supprimer)" aria-label="Actions sur cette vue">⋯</button>`)
    + (n > 1 && !lvl1 ? '<button type="button" class="vi" data-vact="next" aria-label="Tuile suivante" title="Tuile suivante">›</button>' : '')
    + (lvl1 ? '<button type="button" data-vact="dash" hidden aria-hidden="true"></button>' : '')
    + `<div class="menu" id="vmenu" role="menu" hidden>${items}${n < MAX_VIEWS ? '<hr>' + b('add', '＋ Nouvelle tuile', 'Nouvelle tuile vide (mêmes données)') : ''}</div>`
    + `<div class="menu" id="amenu" role="menu" hidden>${b('rename', '✎ Renommer', 'Renommer cette vue')}${b('dup', '⧉ Dupliquer', 'Dupliquer cette vue (copie complète : champs, filtres, graphique)')}`
    + (n > 1 ? b('left', '◂ Déplacer à gauche', 'Déplacer cette vue vers la gauche (ordre des tuiles)', idx === 0) + b('right', '▸ Déplacer à droite', 'Déplacer cette vue vers la droite (ordre des tuiles)', idx === n - 1) + '<hr>' + b('del', '× Supprimer cette vue', 'Supprimer cette vue', false, 'danger') : '') + '</div>';
}
// Menus (▾ vues, ⋯ actions, Exporter) : un seul ouvert à la fois ; fermés par un clic ailleurs, Échap ou le choix d'une entrée
function closeMenus(except) {
  document.querySelectorAll('.menu').forEach(m => { if (m !== except && !m.hidden) { m.hidden = true; const t = m._tr || ({ vmenu: $('#vsel'), amenu: $('#vact'), xmenu: $('#btnExp') })[m.id]; if (t) t.setAttribute('aria-expanded', 'false'); } });
}
function toggleMenu(menu, trigger) {
  menu._tr = trigger; const open = menu.hidden; closeMenus(open ? menu : null); menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
  if (open) {
    menu.style.transform = '';
    if (menu.id !== 'xmenu') menu.style.left = trigger.offsetLeft + 'px';   // sous son bouton ; l'export reste calé à droite
    const r = menu.getBoundingClientRect(), vw = document.documentElement.clientWidth;   // jamais coupé par le bord de l'écran (téléphone)
    if (r.right > vw - 8) menu.style.transform = 'translateX(' + Math.round(vw - 8 - r.right) + 'px)';
    else if (r.left < 8) menu.style.transform = 'translateX(' + Math.round(8 - r.left) + 'px)';
    const f = menu.querySelector('button:not(:disabled)'); if (f && menu.id !== 'xmenu') f.focus();
  }
}
// Réordonne les vues : place la vue `id` à l'index `to` (0 = tout à gauche) ; l'ordre est mémorisé et suit dans le tableau de bord
function moveView(id, to) {
  const from = st.views.findIndex(v => v.id === id);
  if (from < 0) return;
  to = Math.max(0, Math.min(st.views.length - 1, to));
  if (to === from) return;
  const [v] = st.views.splice(from, 1);
  st.views.splice(to, 0, v);
  renderViews(); if (st.dash.on) renderDash(); persistSession();
}
function nextViewName() { let n = st.views.length + 1; while (st.views.some(v => v.name === 'Vue ' + n)) n++; return 'Vue ' + n; }
function addView(copy) {
  if (st.views.length >= MAX_VIEWS) { $('#msg').textContent = 'Limite de ' + MAX_VIEWS + ' tuiles atteinte : supprimez-en une avant d\'en ajouter ou d\'en dupliquer.'; return; }
  captureView();
  const src = curView(), id = 'v' + (++st.nvid);
  const clone = x => (x ? JSON.parse(JSON.stringify(x, (k, val) => (val instanceof Set ? { __set: [...val] } : val)), (k, val) => (val && val.__set ? new Set(val.__set) : val)) : x);
  const nv = copy
    ? { id, name: PL.cleanName(src.name + ' (copie)') || nextViewName(), L: clone(src.L), o: Object.assign({}, src.o), folded: new Set(), ch: Object.assign({}, src.ch), sel: selList(src).map(s => ({ key: s.key, val: s.val })), ng: !!src.ng }
    : { id, name: nextViewName(), L: { rows: [], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null }, o: Object.assign({}, src.o), folded: new Set(), ch: { type: 'none', k: 0, pos: src.ch.pos } };
  st.views.push(nv); st.curView = id;
  loadView(nv); renderViews(); persistSession();
}
function switchView(id) {
  if (id === st.curView) return;
  const v = st.views.find(x => x.id === id); if (!v) return;
  captureView(); st.curView = id; loadView(v); renderViews(); persistSession();
}
function renameView() {
  const v = curView(), n = window.prompt('Nom de cette vue :', v.name);
  if (n === null) return;
  const c = PL.cleanName(n); if (!c) return;
  v.name = c; renderViews(); if (st.dash.on) renderDash(); persistSession();
}
function deleteView() {
  if (st.views.length < 2) return;
  const i = st.views.indexOf(curView());
  st.views.splice(i, 1); const v = st.views[Math.max(0, i - 1)];
  st.curView = v.id; loadView(v); renderViews(); persistSession();
}

/* ---------- tableau de bord : toutes les vues côte à côte (tuiles), impression / PDF ---------- */
const cubeDim = () => (st.cube.chart && st.byKey.has(st.cube.chart) ? st.cube.chart : '');
const cubeLabel = () => (cubeDim() ? st.byKey.get(cubeDim()).label : '');
// champ effectif du graphique : réglé sur la vue (o.cdim ; '-' = « comme le tableau »), sinon défaut du cube, sinon aucun
const dimOf = c => (c.o.cdim === '-' ? '' : c.o.cdim || cubeDim());
const LIGHT = { bg: '#ffffff', ink: '#1b2733', muted: '#5a6b7b', line: '#d9e1e8' };
let printing = false;
function viewResult(v) {   // résultat d'une vue ; la vue active réutilise le calcul courant
  if (v === curView() && st.res) return st.res;
  if (!v.L || !st.rows.length) return null;
  v.L.subtotals = !!v.o.subTot; v.L.top = topOf(v.o);
  return E.compute(st.rows, st.cat, effLayout(v, v.L));
}
// Résultat servant au GRAPHIQUE. Par défaut : celui du tableau. Avec « Champ du graphique » (o.cdim, + o.cdim2 en séries) : calcul dédié qui ne garde que ce champ et les
// valeurs de la vue ; les autres champs (région, province…) ne servent plus qu'aux filtres et sélecteurs (effLayout). `base` : résultat du tableau déjà calculé.
function chartRes(v, c, base) {
  c = c || chartOf(v); const d = dimOf(c);
  if (base === undefined) { try { base = viewResult(v); } catch (e) { base = null; } }
  if (!d || !st.byKey.has(d) || !base || !st.rows.length) return base;
  const d2 = c.o.cdim2 && c.o.cdim2 !== d && st.byKey.has(c.o.cdim2) ? c.o.cdim2 : null, L0 = v === curView() ? st.L : v.L;
  try { return E.compute(st.rows, st.cat, effLayout(v, Object.assign({}, L0, { rows: [d], cols: d2 ? [d2] : [], sort: null, subtotals: false, rowDir: {} }))); } catch (e) { return base; }
}
let crMemo = { res: null, key: '', out: null };   // vue active : un seul calcul dédié tant que le tableau ne change pas (changer palette / titre ne recalcule rien)
function curChartRes() {
  const v = curView(), c = chartOf(v), d = dimOf(c); if (!d) return st.res;
  const key = d + '|' + c.o.cdim2; if (crMemo.res === st.res && crMemo.key === key) return crMemo.out;
  const out = chartRes(v, c, st.res); crMemo = { res: st.res, key, out }; return out;
}
const tileKind = (v, res) => {   // contenu d'une tuile : UN seul des deux — graphique si la tuile en a un (ou si demandé), sinon tableau
  const t = chartOf(v).type, hasChart = !!res && t !== 'none';
  return v.tile === 'table' || !hasChart ? 'table' : 'chart';
};
const TILE_H = { 1: 260, 2: 440, 3: 720 };   // hauteur du contenu d'une tuile : petite / moyenne / grande

/* ---------- sélecteurs d'une vue : liste déroulante sur un champ (région, province…) qui filtre le graphique de la vue ----------
   * v.sel = [{ key, val }] ; val vide = « Toutes ». La valeur choisie s'ajoute aux filtres de la vue (L.filters, exclusions) sans les modifier. ---------- */
const selList = v => (Array.isArray(v.sel) ? v.sel : []);
const distCache = { rows: null, n: -1, map: new Map(), all: new Map() };
function distinctOf(key) {
  if (distCache.rows !== st.rows || distCache.n !== st.rows.length) { distCache.rows = st.rows; distCache.n = st.rows.length; distCache.map = new Map(); distCache.all = new Map(); }
  let d = distCache.map.get(key);
  if (!d) { const it = st.byKey.get(key); d = it ? window.PivotGroups.distinctValues(st.rows, it) : { list: [], capped: false }; distCache.map.set(key, d); }
  return d;
}
// Toutes les valeurs d'un champ (SANS plafond) : les exclusions d'un sélecteur doivent couvrir chaque valeur, sinon des lignes passeraient à travers
// (distinctOf est plafonné à 2000 valeurs et ne sert qu'à l'affichage de la liste).
function allOf(key) {
  if (distCache.rows !== st.rows || distCache.n !== st.rows.length) { distCache.rows = st.rows; distCache.n = st.rows.length; distCache.map = new Map(); distCache.all = new Map(); }
  if (!distCache.all) distCache.all = new Map();
  let a = distCache.all.get(key);
  if (!a) { a = new Set(); const it = st.byKey.get(key); if (it) for (const r of st.rows) a.add(it.dim(r)); distCache.all.set(key, a); }
  return a;
}
// Sélecteurs ACTIFS d'une vue : une valeur absente des données est ignorée (= « Toutes ») ; si un sélecteur global et celui de la tuile portent sur le même champ,
// le global l'emporte (la tuile ne peut que « Toutes » ou la même valeur) : jamais d'état caché qui vide le graphique alors que la liste affiche « Toutes ».
function selActive(v) {
  const valid = s => s.val !== '' && st.byKey.has(s.key) && allOf(s.key).has(s.val);
  const globals = v.ng ? [] : (st.dash.sel || []).filter(valid), locals = selList(v).filter(s => valid(s) && !globals.some(g => g.key === s.key && g.val !== s.val));
  return { globals, locals, all: globals.concat(locals) };
}
function effLayout(v, L) {   // disposition de la vue + choix des sélecteurs (exclusions supplémentaires ; les filtres de l'utilisateur restent intacts)
  const act = selActive(v).all;
  if (!act.length) return L;
  const out = Object.assign({}, L); out.filters = Object.assign({}, L.filters);
  act.forEach(s => { const ex = new Set(out.filters[s.key] || []); allOf(s.key).forEach(x => { if (x !== s.val) ex.add(x); }); out.filters[s.key] = ex; });
  return out;
}
const selFields = () => st.cat.filter(c => !c.valueOnly && !c.measure && !c.calc).map(c => ({ key: c.key, label: c.label }));
// Hiérarchies (hier.js) : une liste ne propose que les valeurs compatibles avec les niveaux supérieurs déjà choisis ; un niveau devenu incohérent revient à « Toutes »
const dimFn = k => { const it = st.byKey.get(k); return it ? (r => it.dim(r)) : (() => ''); };
const cascadeCtx = v => (v && v.ng ? [] : (st.dash.sel || [])).concat(v ? selList(v) : []);   // sélecteurs qui restreignent les listes : globaux (sauf vue ⊘) + ceux de la vue
function cascadeAll() {
  if (!st.hier.length) return;
  const PH = window.PivotHier, G = st.dash.sel || [];
  if (G.length) st.dash.sel = PH.fix(st.hier, G, G, st.rows, dimFn);
  st.views.forEach(v => { if (Array.isArray(v.sel) && v.sel.length) v.sel = PH.fix(st.hier, v.sel, cascadeCtx(v), st.rows, dimFn); });
}
const selOpts = (s, ex, only, eff, ctx) => {   // only : valeur imposée par un sélecteur global du même champ ; eff : valeur réellement appliquée ('' = Toutes) ; ctx : sélecteurs de la cascade
  const al = ctx && st.hier.length ? window.PivotHier.allowed(st.hier, s.key, ctx, st.rows, dimFn) : null;
  const list = distinctOf(s.key).list.filter(x => !ex.has(x.v) && (only == null || x.v === only) && (!al || al.has(x.v))).slice(0, 500).map(x => x.v);
  if (eff && !list.includes(eff)) list.unshift(eff);   // liste plafonnée : la valeur choisie reste visible
  return list.map(x => `<option value="${esc(x)}"${x === eff ? ' selected' : ''}>${esc(x)}</option>`).join('');
};
// Cube : applique le champ du graphique par défaut et fait des champs de filtrage les sélecteurs globaux (les valeurs déjà choisies sont conservées ;
// les sélecteurs globaux posés à la main restent, seuls ceux que l'ancien cube avait ajoutés et que le nouveau n'a plus sont retirés)
function setCube(c) {
  const prev = st.cube.filters, keep = (st.dash.sel || []).filter(s => !prev.includes(s.key) || c.filters.includes(s.key));
  c.filters.forEach(k => { if (st.byKey.has(k) && !keep.some(s => s.key === k)) keep.push({ key: k, val: '' }); });
  st.cube = { chart: c.chart, filters: c.filters.slice() };
  st.dash.sel = window.PivotSession.sanitizeSel(keep);
  refresh();
}
