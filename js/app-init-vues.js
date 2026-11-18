/* js/app-init-vues.js — Interface du tableau croisé (index.html) : Démarrage (2/5) : vues, tableau de bord, assistant « Projet », barre de filtres.
 * Chargé APRÈS tous les fichiers app*.js (fonctions et constantes existent alors). Les instructions sont dans l'ordre EXACT de l'ancien
 * app.js (IIFE unique découpée), réparties sur les cinq fichiers app-init-* : ne pas les réordonner ni changer l'ordre de chargement. */
'use strict';

/* ---------- vues : plusieurs tableaux / graphiques différents sur les mêmes données (onglets) ---------- */
st.views = [{ id: 'v1', name: 'Vue 1' }];
st.curView = 'v1';
st.nvid = 1;
document.addEventListener('click', ev => { if (!ev.target.closest || !ev.target.closest('.menu, #vsel, #vact, #btnExp, .fadd')) closeMenus(null); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { const open = [...document.querySelectorAll('.menu')].find(m => !m.hidden); if (open) { closeMenus(null); const t = open._tr || ({ vmenu: $('#vsel'), amenu: $('#vact'), xmenu: $('#btnExp') })[open.id]; if (t && t.focus) t.focus(); } } });
$('#btnExp').addEventListener('click', () => toggleMenu($('#xmenu'), $('#btnExp')));
$('#xmenu').addEventListener('click', ev => { if (ev.target.closest('button')) closeMenus(null); });
$('#viewTabs').addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.id === 'vsel') { toggleMenu($('#vmenu'), t); return; }
  if (t.id === 'vact') { toggleMenu($('#amenu'), t); return; }
  closeMenus(null);
  if (t.dataset.view) { switchView(t.dataset.view); return; }
  const a = t.dataset.vact;
  if (a === 'add') addView(false); else if (a === 'dup') addView(true); else if (a === 'rename') renameView(); else if (a === 'del') deleteView(); else if (a === 'dash') setDash(!st.dash.on);
  else if (a === 'prev' || a === 'next') { const n = st.views.length, i = st.views.indexOf(curView()); switchView(st.views[(i + (a === 'next' ? 1 : n - 1)) % n].id); }   // circulaire
  else if (a === 'left' || a === 'right') { const i = st.views.indexOf(curView()); moveView(st.curView, i + (a === 'left' ? -1 : 1)); }
});
$('#viewTabs').addEventListener('dblclick', ev => { if (ev.target.closest('#vsel')) { closeMenus(null); renameView(); } });

/* ---------- tableau de bord : toutes les vues côte à côte (tuiles), impression / PDF ---------- */
st.hier = [];   // hiérarchies du projet [{ name, levels:[clé…] }] : filtres en cascade (hier.js)
st.cube = { chart: '', filters: [] };   // cube de données (projet) : champ du graphique par défaut + champs de filtrage (→ sélecteurs globaux)
st.dash = { on: false, cols: 0, sel: [] };   // cols : 0 = automatique selon la largeur ; sel : sélecteurs GLOBAUX (filtrent toutes les tuiles)

/* ---------- assistant « Projet » (3.3.0) : 1 Sources → 2 Jointures → 3 Champs dérivés et hiérarchies ----------
   * Création ET modification d'un projet. Il héberge la liste des sources (#sources) et lance les éditeurs existants (fusion de colonnes, jointures,
   * champs calculés / groupes / mesures) ; il ajoute la définition des hiérarchies (st.hier, hier.js). ---------- */
$('#wzSteps').addEventListener('click', ev => { const b = ev.target.closest('[data-wz]'); if (b) wzShow(+b.dataset.wz); });
$('#wzPrev').addEventListener('click', () => wzShow(Math.max(1, wiz.step - 1)));
$('#wzNext').addEventListener('click', () => wzShow(Math.min(3, wiz.step + 1)));
$('#wzDone').addEventListener('click', () => $('#dlgWiz').close());
$('#wzRename').addEventListener('click', async () => { await renameProject(st.project.id); $('#wzProj').textContent = st.project.name; });
$('#btnWiz').addEventListener('click', () => openWizard(1));
$('#btnWizTop').addEventListener('click', () => openWizard(1));
$('#wzHierDetect').addEventListener('click', () => {
  const found = window.PivotHier.detect(selFields());
  if (!found.length) { $('#wzHierMsg').textContent = 'Aucune hiérarchie reconnue parmi les champs.'; return; }
  const have = new Set(st.hier.map(h => h.name.toLowerCase())), add = found.filter(h => !have.has(h.name.toLowerCase()));
  setHier(st.hier.concat(add), add.length ? add.length + ' hiérarchie(s) ajoutée(s) : ' + add.map(h => h.name).join(', ') + '.' : 'Déjà définies.');
});
$('#wzHierAdd').addEventListener('click', () => {
  const fl = selFields(); if (fl.length < 2) { $('#wzHierMsg').textContent = 'Il faut au moins deux champs.'; return; }
  let n = st.hier.length + 1; while (st.hier.some(h => h.name.toLowerCase() === 'hiérarchie ' + n)) n++;
  setHier(st.hier.concat([{ name: 'Hiérarchie ' + n, levels: [fl[0].key, fl[1].key] }]), 'Hiérarchie ajoutée : choisissez et ordonnez ses niveaux.');
});
$('#wzHier').addEventListener('click', ev => {
  const row = ev.target.closest('[data-hi]'); if (!row) return; const i = +row.dataset.hi, b = ev.target.closest('button'); if (!b) return;
  const list = st.hier.map(h => ({ name: h.name, levels: h.levels.slice() })), h = list[i], li = b.closest('li'), j = li ? [...row.querySelectorAll('li')].indexOf(li) : -1;
  if (b.hasAttribute('data-hdel')) list.splice(i, 1);
  else if (b.hasAttribute('data-hup') && j > 0) [h.levels[j - 1], h.levels[j]] = [h.levels[j], h.levels[j - 1]];
  else if (b.hasAttribute('data-hdn') && j >= 0 && j < h.levels.length - 1) [h.levels[j + 1], h.levels[j]] = [h.levels[j], h.levels[j + 1]];
  else if (b.hasAttribute('data-hrm') && h.levels.length > 2) h.levels.splice(j, 1);
  else return;
  setHier(list);
});
$('#wzHier').addEventListener('change', ev => {
  const row = ev.target.closest('[data-hi]'); if (!row) return; const i = +row.dataset.hi, list = st.hier.map(h => ({ name: h.name, levels: h.levels.slice() }));
  if (ev.target.hasAttribute('data-hname')) { const n = ev.target.value.trim(); if (!n || list.some((h, k) => k !== i && h.name.toLowerCase() === n.toLowerCase())) { $('#wzHierMsg').textContent = 'Nom vide ou déjà utilisé.'; wzRender(); return; } list[i].name = n; setHier(list); return; }
  if (ev.target.hasAttribute('data-hadd') && ev.target.value) { list[i].levels.push(ev.target.value); setHier(list); }
});
$('#dlgWiz').addEventListener('close', () => { updateProjUi(); });
$('#btnCube').addEventListener('click', ev => window.PivotCube.open({ fields: selFields(), cube: st.cube, max: 5, trigger: ev.currentTarget, onSave: setCube }));

/* ---------- barre de filtres en pastilles : filtres TOUT (globaux, toutes les vues) et VUE (cette vue seulement) ----------
   * Une pastille = un champ + sa liste déroulante (« Toutes » ou une valeur) + × ; « + Filtre ▾ » ajoute un champ, avec sa portée (vue / global).
   * Les filtres fixes de la vue (valeurs exclues, texte, plage, top) restent dans la zone « Filtres » de la configuration. ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest && ev.target.closest('.fadd, [data-fadd], [data-fscope], .fx'); if (!t) return;
  const bar = t.closest('.fbar'); if (!bar) return;
  const ctx = bar.dataset.ctx, v = curView();
  if (t.classList.contains('fadd')) { fillFMenu(bar); toggleMenu(bar.querySelector('.fmenu'), t); return; }
  if (t.dataset.fscope) { fscope = t.dataset.fscope; fillFMenu(bar); return; }
  if (t.dataset.fadd) { closeMenus(null); const e = { key: t.dataset.fadd, val: '' }; if (ctx === 'dash' || fscope === 'global') setGlobalSel((st.dash.sel || []).concat([e])); else setSelOf(v, selList(v).concat([e])); return; }
  if (t.dataset.gx !== undefined) { setGlobalSel((st.dash.sel || []).filter(x => x.key !== t.dataset.gx)); return; }
  if (t.dataset.vx !== undefined) setSelOf(v, selList(v).filter(x => x.key !== t.dataset.vx));
});
$('#selBar').addEventListener('change', ev => { const d = ev.target.dataset; if (!d) return; if (d.sel) onSelChange(ev.target); else if (d.gsel) { onGlobalSel(ev.target); const again = document.querySelector('#selBar [data-gsel="' + d.gsel + '"]'); if (again) again.focus(); } });
window.addEventListener('resize', () => dashMeasured.clear());
$('#dash').addEventListener('click', ev => {
  if (ev.target.id === 'dashPrint') { window.print(); return; }
  if (ev.target.id === 'dashFocus') { setFocus(!focusOn(), true); return; }
  const t = ev.target.closest('[data-tact]');
  if (!t) {   // clic sur le corps d'une tuile (hors boutons, listes, champs, liens, barre de glissement) : ouvre cette tuile
    const tile = ev.target.closest('.tile'); if (!tile || ev.target.closest('button, select, input, textarea, label, a, .th, .tsel')) return;
    if (window.getSelection && String(window.getSelection())) return;   // sélection de texte en cours
    switchView(tile.dataset.view); setDash(false); return;
  }
  if (t.dataset.tact === 'newview') { addView(false); setDash(false); return; }
  const id = (t.closest('[data-view]') || t).dataset.view, v = st.views.find(x => x.id === id); if (!v) return;
  const a = t.dataset.tact;
  if (a === 'edit') { switchView(id); setDash(false); return; }
  if (a === 'tbl') { switchView(id); setDash(false); setTPanel(true); return; }
  if (a === 'chart') { openTileEditor(v, t); return; }
  if (a === 'wide') { v.span = (v.span || 1) % 3 + 1; renderDash(); persistSession(); return; }
  if (a === 'glob') { v.ng = !v.ng; renderDash(); persistSession(); return; }
  if (a === 'tall') { v.h = (v.h || 2) % 3 + 1; renderDash(); persistSession(); return; }
  if (a === 'hide') v.tile = 'hide';
  else if (a === 'show') v.tile = 'auto';
  else if (a === 'mode') {
    const res = viewResult(v);
    const k = tileKind(v, res);   // bascule graphique ⇄ tableau : la tuile contient l'un OU l'autre, avec les mêmes lignes, colonnes et valeurs
    if (k === 'chart') v.tile = 'table';
    else { v.tile = 'chart'; if (chartOf(v).type === 'none') setChartOf(v, { type: 'bar' }); }
  }
  renderDash(); persistSession();
});
$('#dash').addEventListener('dragstart', ev => {
  const t = ev.target.closest && ev.target.closest('.tile .th'); if (!t) return;
  dragTile = t.closest('.tile').dataset.view;
  ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/x-tile', dragTile);
  t.closest('.tile').classList.add('dragging');
});
$('#dash').addEventListener('dragover', ev => {
  if (!dragTile) return;
  const t = ev.target.closest('.tile'); if (!t) return;
  ev.preventDefault(); ev.dataTransfer.dropEffect = 'move';
  const r = t.getBoundingClientRect(), after = ev.clientX > r.left + r.width / 2 && cols_() > 1 || (cols_() === 1 && ev.clientY > r.top + r.height / 2);
  document.querySelectorAll('#dash .tile').forEach(x => x.classList.remove('dropL', 'dropR'));
  if (t.dataset.view !== dragTile) t.classList.add(after ? 'dropR' : 'dropL');
});
$('#dash').addEventListener('drop', ev => {
  if (!dragTile) return;
  const t = ev.target.closest('.tile'); if (!t) return;
  ev.preventDefault(); ev.stopPropagation();
  const r = t.getBoundingClientRect(), after = cols_() > 1 ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
  const id = dragTile; dragTile = null;
  // l'index est celui parmi les vues (les tuiles masquées gardent leur place)
  let to = st.views.findIndex(v => v.id === t.dataset.view) + (after ? 1 : 0);
  if (st.views.findIndex(v => v.id === id) < to) to--;
  moveView(id, to);
});
$('#dash').addEventListener('dragend', () => { dragTile = null; document.querySelectorAll('#dash .tile').forEach(x => x.classList.remove('dropL', 'dropR', 'dragging')); });
$('#dash').addEventListener('change', ev => { if (ev.target.dataset && ev.target.dataset.gsel) { onGlobalSel(ev.target); return; } if (ev.target.dataset && ev.target.dataset.sel) { onSelChange(ev.target); return; } if (ev.target.id === 'dashCols') { st.dash.cols = +ev.target.value || 0; renderDash(); persistSession(); } });
window.addEventListener('beforeprint', () => { if (st.dash.on) { printing = true; renderDash(); } });
window.addEventListener('afterprint', () => { if (printing) { printing = false; if (st.dash.on) renderDash(); } });
