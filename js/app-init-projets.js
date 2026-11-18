/* js/app-init-projets.js — Interface du tableau croisé (index.html) : Démarrage (5/5) : projets.
 * Chargé APRÈS tous les fichiers app*.js (fonctions et constantes existent alors). Les instructions sont dans l'ordre EXACT de l'ancien
 * app.js (IIFE unique découpée), réparties sur les cinq fichiers app-init-* : ne pas les réordonner ni changer l'ordre de chargement. */
'use strict';

/* ---------- projets : tableau de bord complet (fichiers, jointures, champs calculés, onglets, tuiles) enregistré sous un nom ----------
   * Chaque projet = deux enregistrements IndexedDB « <id>:data » (lignes des fichiers) et « <id>:state » (sélections), plus un
   * index « projects ». La session automatique est celle du projet ouvert. ---------- */
const MAX_PROJECTS = SSM.MAX_PROJECTS;
st.project = { id: 'p1', name: 'Projet 1' };
st.projIdx = null;
$('#ssRemember').checked = remembering();
$('#ssRemember').addEventListener('change', e => {
  try { window.localStorage.setItem('statbel_pivot_remember', e.target.checked ? '1' : '0'); } catch (x) { /* stockage indisponible */ }
  if (e.target.checked) { ssMsg(''); persistSession(); return; }
  clearTimeout(ssTimer); ssSig = ''; ssChain = ssChain.then(() => delProjectKeys(st.project.id));
  ssMsg('Mémorisation désactivée : projet ouvert effacé du stockage (les autres projets sont conservés).');
});
$('#ssClear').addEventListener('click', () => {
  clearTimeout(ssTimer); ssSig = ''; ssChain = ssChain.then(() => delProjectKeys(st.project.id));
  ssMsg('Projet ouvert effacé du stockage (les fichiers affichés restent à l\'écran ; décochez la case pour ne plus rien mémoriser).');
});
$('#btnProj').addEventListener('click', () => { renderProjects(); pmsg(''); $('#dlgProj').showModal(); });
$('#projClose').addEventListener('click', () => $('#dlgProj').close());
$('#projNew').addEventListener('click', () => newProject($('#projNewName').value));
$('#projSave').addEventListener('click', async () => { if (!realSources().length) { pmsg('Rien à enregistrer : aucun fichier chargé.'); return; } await persistNow(); renderProjects(); pmsg('Projet enregistré sur cet appareil.'); });
$('#projImport').addEventListener('click', () => $('#projFile').click());
$('#projFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importProject(f); });
$('#projList').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pact]'); if (!b) return;
  const id = b.closest('.pl').dataset.id, a = b.dataset.pact;
  if (a === 'open') openProject(id); else if (a === 'rename') renameProject(id); else if (a === 'dup') dupProject(id); else if (a === 'export') exportProject(id); else if (a === 'del') deleteProject(id);
});
$('#fSearch').addEventListener('input', drawFilter);
$('#fieldSearch').addEventListener('input', e => { st.search = e.target.value; renderFields(); });
$('#fAll').addEventListener('click', () => { filterMatches().forEach(v => st.L.filters[filtKey].delete(v)); drawFilter(); });
$('#fNone').addEventListener('click', () => { filterMatches().forEach(v => st.L.filters[filtKey].add(v)); drawFilter(); });
$('#fList').addEventListener('change', e => {
  const ex = st.L.filters[filtKey];
  if (e.target.checked) ex.delete(e.target.value); else ex.add(e.target.value);
});
$('#fOk').addEventListener('click', () => { saveRuleInputs(); $('#dlgFilter').close(); renderZones(); refresh(); });
$('#fRClear').addEventListener('click', () => { $('#frtQ').value = ''; $('#frrMin').value = ''; $('#frrMax').value = ''; $('#frtN').value = ''; });
$('#wzMap').addEventListener('click', openMap);
$('#mapBody').addEventListener('input', mapSummary);
$('#mapBody').addEventListener('change', ev => {
  if (!ev.target.matches('input[data-inc]')) return;
  const inp = ev.target.closest('tr').querySelector('input[data-v]');
  if (ev.target.checked) { inp.disabled = false; inp.value = inp.dataset.orig; } else { inp.value = ''; inp.disabled = true; }
  mapSummary();
});
$('#mapSuggest').addEventListener('click', suggestMerges);
$('#mapOk').addEventListener('click', () => {
  mapInputs().forEach(i => { if (i.value.trim() !== i.dataset.orig || st.over[i.dataset.v] !== undefined) st.over[i.dataset.v] = i.value.trim(); });
  $('#dlgMap').close(); rebuild();
});
$('#mapCancel').addEventListener('click', () => $('#dlgMap').close());
$('#out').addEventListener('click', ev => {
  const lh = ev.target.closest('th[data-ls]');
  if (lh) { const S = st.o.listSort, key = lh.dataset.ls; st.o.listSort = S && S.key === key ? (S.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }; saveOpts(); renderList(false); persistSession(); return; }
  const fo = ev.target.closest('[data-fold]');
  if (fo) { const k = fo.dataset.fold; if (st.folded.has(k)) st.folded.delete(k); else st.folded.add(k); renderTable(); return; }
  const td = ev.target.closest('td[data-r]');
  if (td) { openDetail(+td.dataset.r, +td.dataset.c); return; }
  const th = ev.target.closest('th.srt'); if (!th) return;
  if (th.dataset.rk) {   // en-tête d'une colonne de libellés (Lignes) : tri A→Z / Z→A de ce niveau
    const L = st.L, k = th.dataset.rk;
    L.rowDir = L.rowDir || {};
    L.rowDir[k] = (L.rowDir[k] || 1) * -1;
    L.sort = null; refresh(); return;
  }
  const col = th.dataset.col, k = +th.dataset.k, S = st.L.sort;
  st.L.sort = S && S.col === col && S.k === k ? (S.dir < 0 ? { col, k, dir: 1 } : null) : { col, k, dir: -1 };
  refresh();
});
$('#btnFoldAll').addEventListener('click', () => {   // replie le niveau le plus externe : il ne reste que les « Total <groupe> »
  if (!st.res || !st.res.subs.length) return;
  st.folded = new Set([...st.res.subs[0].keys()].map(k => '0|' + k)); renderTable();
});
$('#btnUnfoldAll').addEventListener('click', () => { st.folded = new Set(); renderTable(); });
$('#btnCsv').addEventListener('click', exportCSV);
$('#btnXlsx').addEventListener('click', exportXLSX);
$('#btnCopy').addEventListener('click', copyTable);
$('#btnReset').addEventListener('click', () => {
  st.L = { rows: ['__source'], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null };
  renderZones(); refresh();
});
// Glisser-déposer : fichiers sur la page, champs sur les zones.
document.addEventListener('dragstart', ev => {
  const f = ev.target.closest && ev.target.closest('.fld');
  if (f) { ev.dataTransfer.setData('text/x-field', f.dataset.key); ev.dataTransfer.effectAllowed = 'copy'; }
});
document.addEventListener('dragover', ev => { ev.preventDefault(); const z = ev.target.closest && ev.target.closest('.zone'); document.querySelectorAll('.zone.over').forEach(x => x !== z && x.classList.remove('over')); if (z) z.classList.add('over'); });
document.addEventListener('dragleave', ev => { if (!ev.relatedTarget) document.querySelectorAll('.zone.over').forEach(x => x.classList.remove('over')); });
document.addEventListener('drop', ev => {
  ev.preventDefault();
  document.querySelectorAll('.zone.over').forEach(x => x.classList.remove('over'));
  const key = ev.dataTransfer.getData('text/x-field'), z = ev.target.closest && ev.target.closest('.zone');
  if (key && z) addTo(z.dataset.zone, key);
  else if (ev.dataTransfer.files && ev.dataTransfer.files.length) {
    const files = [...ev.dataTransfer.files], items = [...(ev.dataTransfer.items || [])].filter(i => i.kind === 'file');
    // Chrome/Edge : getAsFileSystemHandle donne un lien durable vers le fichier déposé (à demander tout de suite, pendant le dépôt)
    const hp = items.length === files.length && items.every(i => typeof i.getAsFileSystemHandle === 'function')
      ? items.map(i => i.getAsFileSystemHandle().catch(() => null)) : null;
    if (!hp) { addFiles(files); return; }
    Promise.all(hp).then(hs => addFiles(files, hs.map(h => (h && h.kind === 'file' ? h : undefined)))).catch(() => addFiles(files));
  }
});
window.__pivot = { st, addFiles };   // pour les tests headless
applyOptsToControls();
lyRefresh();
renderSources();
renderFields();
renderZones();
renderCalcs();
renderTable();
renderViews();
setMode('cfg');
restoreSession();
