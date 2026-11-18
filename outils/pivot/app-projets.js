/* outils/pivot/app-projets.js — Interface du tableau croisé (index.html) : Projets : tableau de bord complet enregistré (IndexedDB), import / export .json.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et outils/pivot/README.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- projets : tableau de bord complet (fichiers, jointures, champs calculés, onglets, tuiles) enregistré sous un nom ----------
   * Chaque projet = deux enregistrements IndexedDB « <id>:data » (lignes des fichiers) et « <id>:state » (sélections), plus un
   * index « projects ». La session automatique est celle du projet ouvert. ---------- */
const pkey = (id, k) => id + ':' + k;
const delProjectKeys = async id => { await SS.del(pkey(id, 'data')); await SS.del(pkey(id, 'state')); };
const saveIndex = async () => { if (st.projIdx) { try { await SS.save('projects', st.projIdx); } catch (e) { /* stockage indisponible : index en mémoire seulement */ } } };
const entryOf = id => (st.projIdx ? st.projIdx.list.find(x => x.id === id) : null);
async function touchEntry(files, rows) { const e = entryOf(st.project.id); if (e) { e.updated = Date.now(); e.files = files; e.rows = rows; await saveIndex(); } }
function snapshot() {   // état complet du projet ouvert, prêt à être stocké ou exporté
  const real = realSources(), sources = {};
  real.forEach(s => { sources[s.id] = { file: s.file, sheet: s.sheet, label: s.label, aoa: s.aoa, mtime: s.mtime }; if (s.handle) sources[s.id].handle = s.handle; });
  captureView();
  const state = {
    v: 1, savedAt: Date.now(), sources: real.map(s => ({ id: s.id, headerRow: s.headerRow, use: s.use })), over: st.over,
    joins: st.joins.map(d => ({ id: d.id, name: d.name, left: d.left, right: d.right, keys: d.keys, type: d.type, dup: d.dup, cols: d.cols, use: d.use !== false })),
    calcs: st.calcs.map(d => ({ name: d.name, formula: d.formula })), groups: st.groups, measures: st.measures, layout: PL.serialize(st.L, st.o),
    views: st.views.map(v => ({ name: v.name, layout: PL.serialize(v.L, v.o), chart: v.ch, sel: selList(v), ng: !!v.ng, tile: v.tile || 'auto', span: v.span || 1, h: v.h || 2 })), cur: st.views.indexOf(curView()), dash: { on: st.dash.on, cols: st.dash.cols, sel: st.dash.sel }, cube: st.cube, hier: st.hier
  };
  return { real, data: { v: 1, sources }, state };
}
async function doPersist() {
  const id = st.project.id, real = realSources();
  if (!real.length) { await delProjectKeys(id); ssSig = ''; ssMsg(''); await touchEntry(0, 0); return; }
  const sig = real.map(s => s.id).join(','), snap = snapshot();
  if (sig !== ssSig) {   // les lignes des fichiers ne sont réécrites que si la liste des fichiers change
    try { await SS.save(pkey(id, 'data'), snap.data); } catch (e) {
      try { Object.values(snap.data.sources).forEach(x => { delete x.handle; }); await SS.save(pkey(id, 'data'), snap.data); }   // repli : sans les liens vers les fichiers
      catch (e2) { await delProjectKeys(id); ssSig = ''; throw new Error('fichiers trop volumineux pour être mémorisés'); }
    }
    ssSig = sig;
  }
  await SS.save(pkey(id, 'state'), snap.state);
  await touchEntry(real.length, st.rows.length);
  ssMsg('Session mémorisée sur cet appareil.');
}
async function persistNow() {
  clearTimeout(ssTimer);
  ssChain = ssChain.then(doPersist).catch(e => { ssMsg('Projet non enregistré : ' + (e && e.message ? e.message : 'stockage indisponible') + '.'); });
  await ssChain;
}
// Applique un projet relu du stockage (ou importé) : renvoie le nombre de feuilles chargées (0 = rien à appliquer)
function applyProject(data, state) {
  const stt = SSM.sanitizeState(state), sources = stt ? SSM.assemble(data, stt) : [];
  if (!sources.length) return 0;
  st.sources = sources; st.over = Object.assign({}, stt.over);
  if (stt.calcs) { st.calcs = PCalc.sanitizeDefs(stt.calcs); storeCalcs(); }
  st.groups = window.PivotGroups.sanitizeDefs(stt.groups); storeGroups(); grpEditing = '';
  st.measures = window.PivotMeasures.sanitizeDefs(stt.measures); storeMeasures(); mesEditing = '';
  st.joins = PJ.sanitizeDefs(stt.joins); st.njid = Math.max(0, ...st.joins.map(d => +d.id.slice(1)));
  st.nid = Math.max(st.nid, ...sources.map(s => +s.id.slice(1)));
  ssSig = sources.map(s => s.id).join(',');
  rebuild();
  const keys = st.cat.map(c => c.key);
  const saved = stt.views.length ? stt.views : (stt.layout ? [{ name: 'Vue 1', layout: stt.layout, chart: null }] : []);
  const built = saved.map(sv => { const lay = PL.sanitize(sv.layout); if (!lay) return null; const r = PL.apply(lay, keys); return { name: PL.cleanName(sv.name) || 'Vue', L: r.L, o: Object.assign({}, st.o, r.o), folded: new Set(), ch: sv.chart, sel: sv.sel || [], ng: sv.ng === true, tile: sv.tile || 'auto', span: sv.span || 1, h: sv.h || 2 }; }).filter(Boolean);
  if (built.length) {
    st.views = built.map((v, i) => Object.assign(v, { id: 'v' + (i + 1) })); st.nvid = st.views.length;
    const cv = st.views[Math.min(Math.max(0, stt.cur || 0), st.views.length - 1)];
    st.curView = cv.id; st.dash.cols = stt.dash.cols; st.dash.sel = stt.dash.sel || []; st.cube = stt.cube || { chart: '', filters: [] }; st.hier = stt.hier || []; st.dash.on = !!stt.dash.on; document.body.classList.toggle('d-dash', st.dash.on);
    loadView(cv); renderViews();
  }
  setMode('table');
  return sources.length;
}
// Espace de travail vierge : aucun fichier, un seul onglet vide, tableau de bord fermé
function resetWorkspace() {
  st.sources = []; st.over = {}; st.joins = []; st.njid = 0; st.nid = 0; st.calcs = []; storeCalcs(); calcEditing = ''; st.groups = []; storeGroups(); grpEditing = ''; st.measures = []; storeMeasures(); mesEditing = '';
  st.L = { rows: [], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null }; st.folded = new Set(); st.search = '';
  st.views = [{ id: 'v1', name: 'Vue 1' }]; st.curView = 'v1'; st.nvid = 1;
  st.cube = { chart: '', filters: [] }; st.hier = []; st.dash = { on: false, cols: 0, sel: [] }; document.body.classList.toggle('d-dash', false);
  applyChart(PC.normChart());
  ssSig = '';
  rebuild(); renderViews(); setMode('cfg');
}
const dateFr = t => new Date(t).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
const pmsg = t => { $('#projMsg').textContent = t; };
function updateProjUi() { $('#projCur').textContent = st.project.name; $('#btnProj').title = 'Projet « ' + st.project.name + ' » — enregistrer, ouvrir, créer, exporter un tableau de bord complet'; }
function renderProjects() {
  const idx = st.projIdx; if (!idx) { $('#projList').innerHTML = '<p class="hint">Stockage du navigateur indisponible : les projets ne peuvent pas être enregistrés (export / import possibles).</p>'; return; }
  $('#projList').innerHTML = idx.list.map(p => {
    const cur = p.id === st.project.id;
    return `<div class="pl${cur ? ' cur' : ''}" data-id="${p.id}"><b>${esc(p.name)}</b>${cur ? '<span class="meta">● ouvert</span>' : ''}<span class="meta">${p.files} feuille(s) · ${p.rows.toLocaleString('fr-BE')} ligne(s)${p.updated ? ' · enregistré le ' + esc(dateFr(p.updated)) : ''}</span>`
      + `<span class="pbtns">${cur ? '' : '<button type="button" data-pact="open">Ouvrir</button>'}<button type="button" data-pact="rename">Renommer</button><button type="button" data-pact="dup">Dupliquer</button><button type="button" data-pact="export">Exporter</button><button type="button" data-pact="del">Supprimer</button></span></div>`;
  }).join('');
}
async function loadProject(e) {   // charge le projet e dans l'espace de travail (ssReady doit être false pendant l'opération)
  st.project = e; st.projIdx.cur = e.id; await saveIndex();
  const [d, s] = await Promise.all([SS.load(pkey(e.id, 'data')), SS.load(pkey(e.id, 'state'))]);
  resetWorkspace();
  try { return applyProject(d, s); } catch (x) { resetWorkspace(); return 0; }
}
// enregistre le projet ouvert avant de le quitter ; false si l'utilisateur renonce
async function leaveCurrent() {
  clearTimeout(ssTimer);
  if (!realSources().length) return true;
  if (remembering()) { await persistNow(); return true; }
  return window.confirm('La mémorisation automatique est désactivée : le projet « ' + st.project.name + ' » n\'a pas été enregistré. Le quitter quand même ? (Annuler, puis « Enregistrer maintenant ».)');
}
async function openProject(id) {
  const e = entryOf(id); if (!e || id === st.project.id || !ssReady) return;
  if (!(await leaveCurrent())) return;
  ssReady = false;
  let n = 0;
  try { n = await loadProject(e); } finally { ssReady = true; }
  updateProjUi(); renderProjects(); pmsg(n ? 'Projet « ' + e.name + ' » ouvert.' : 'Projet « ' + e.name + ' » ouvert (aucune donnée enregistrée).');
}
async function newProject(name) {
  if (!ssReady || !st.projIdx) return;
  const idx = st.projIdx;
  if (idx.list.length >= MAX_PROJECTS) { pmsg('Limite de ' + MAX_PROJECTS + ' projets atteinte : supprimez-en un.'); return; }
  if (!(await leaveCurrent())) return;
  ssReady = false;
  try {
    const id = 'p' + (++idx.n), e = { id, name: PL.cleanName(name) || 'Projet ' + idx.n, created: Date.now(), updated: Date.now(), files: 0, rows: 0 };
    idx.list.push(e); st.project = e; idx.cur = id; await saveIndex();
    resetWorkspace();
  } finally { ssReady = true; }
  updateProjUi(); renderProjects(); $('#projNewName').value = ''; $('#dlgProj').close();
  $('#msg').textContent = 'Nouveau projet « ' + st.project.name + ' » : ajoutez vos sources dans l\'assistant.';
  openWizard(1);
}
async function renameProject(id) {
  const e = entryOf(id); if (!e) return;
  const n = window.prompt('Nom du projet :', e.name); if (n === null) return;
  const c = PL.cleanName(n); if (!c) return;
  e.name = c; await saveIndex(); updateProjUi(); renderProjects();
}
async function dupProject(id) {
  const e = entryOf(id), idx = st.projIdx; if (!e || !idx) return;
  if (!SS.available()) { pmsg('Stockage du navigateur indisponible.'); return; }
  if (idx.list.length >= MAX_PROJECTS) { pmsg('Limite de ' + MAX_PROJECTS + ' projets atteinte.'); return; }
  if (id === st.project.id) await persistNow();
  const nid = 'p' + (++idx.n), [d, s] = await Promise.all([SS.load(pkey(id, 'data')), SS.load(pkey(id, 'state'))]);
  if (d) await SS.save(pkey(nid, 'data'), d);
  if (s) await SS.save(pkey(nid, 'state'), s);
  idx.list.push(Object.assign({}, e, { id: nid, name: PL.cleanName(e.name + ' (copie)'), created: Date.now(), updated: Date.now() }));
  await saveIndex(); renderProjects(); pmsg('Projet dupliqué.');
}
async function deleteProject(id) {
  const e = entryOf(id), idx = st.projIdx; if (!e || !idx) return;
  if (!window.confirm('Supprimer le projet « ' + e.name + ' » et ses données enregistrées ?')) return;
  await delProjectKeys(id);
  idx.list = idx.list.filter(x => x.id !== id);
  if (id !== st.project.id) { await saveIndex(); renderProjects(); pmsg('Projet « ' + e.name + ' » supprimé.'); return; }
  ssReady = false;   // le projet ouvert est supprimé : on passe au premier restant (ou à un projet vide)
  try {
    clearTimeout(ssTimer);
    let next = idx.list[0];
    if (!next) { next = { id: 'p' + (++idx.n), name: 'Projet ' + idx.n, created: Date.now(), updated: Date.now(), files: 0, rows: 0 }; idx.list.push(next); }
    await loadProject(next);
  } finally { ssReady = true; }
  updateProjUi(); renderProjects(); pmsg('Projet « ' + e.name + ' » supprimé.');
}
// Export : fichier .json autonome (les dates sont conservées ; les liens vers les fichiers du disque ne le sont pas)
const dateReplacer = function (k, v) { const o = this[k]; return o instanceof Date ? (isNaN(o) ? null : { $d: o.getTime() }) : v; };
const dateReviver = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$d === 'number' ? new Date(v.$d) : v);
async function exportProject(id) {
  const e = entryOf(id); if (!e) return;
  let data, state;
  if (id === st.project.id) { const snap = snapshot(); data = snap.data; state = snap.state; Object.values(data.sources).forEach(x => { x.handle = undefined; }); }
  else { [data, state] = await Promise.all([SS.load(pkey(id, 'data')), SS.load(pkey(id, 'state'))]); if (data && data.sources) Object.values(data.sources).forEach(x => { x.handle = undefined; }); }
  if (!data || !state) { pmsg('Ce projet est vide : rien à exporter.'); return; }
  const json = JSON.stringify({ kind: 'statbel-pivot-project', v: 1, name: e.name, exported: new Date().toISOString(), state, data }, dateReplacer);
  download(new Blob([json], { type: 'application/json' }), 'projet-' + (e.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pivot') + '.json');
  pmsg('Projet « ' + e.name + ' » exporté (' + Math.round(json.length / 1024).toLocaleString('fr-BE') + ' Ko).');
}
async function importProject(file) {
  if (!ssReady || !st.projIdx) return;
  if (!SS.available()) { pmsg('Stockage du navigateur indisponible : import impossible.'); return; }
  let obj;
  try { obj = JSON.parse(await file.text(), dateReviver); } catch (e) { pmsg('Fichier illisible : ce n\'est pas un projet exporté.'); return; }
  if (!obj || obj.kind !== 'statbel-pivot-project' || obj.v !== 1) { pmsg('Ce fichier n\'est pas un projet exporté par cet outil.'); return; }
  const stt = SSM.sanitizeState(obj.state);
  if (!stt || !SSM.assemble(obj.data, stt).length) { pmsg('Projet vide ou invalide : aucune donnée à importer.'); return; }
  const idx = st.projIdx;
  if (idx.list.length >= MAX_PROJECTS) { pmsg('Limite de ' + MAX_PROJECTS + ' projets atteinte : supprimez-en un.'); return; }
  if (!(await leaveCurrent())) return;
  ssReady = false;
  let n = 0, e;
  try {
    const id = 'p' + (++idx.n);
    e = { id, name: PL.cleanName(typeof obj.name === 'string' ? obj.name : '') || 'Projet importé', created: Date.now(), updated: Date.now(), files: 0, rows: 0 };
    await SS.save(pkey(id, 'data'), obj.data); await SS.save(pkey(id, 'state'), obj.state);
    idx.list.push(e); await saveIndex();
    n = await loadProject(e);
    e.files = n; e.rows = st.rows.length; await saveIndex();
  } finally { ssReady = true; }
  updateProjUi(); renderProjects(); pmsg('Projet « ' + e.name + ' » importé (' + n + ' feuille(s)).');
}
async function restoreSession() {
  try {
    if (SS.available()) {
      let idx = SSM.sanitizeIndex(await SS.load('projects'));
      if (!idx) {   // premier lancement (ou ancienne session unique) : création du projet 1, reprise de la session précédente
        idx = { v: 1, cur: 'p1', n: 1, list: [{ id: 'p1', name: 'Projet 1', created: Date.now(), updated: Date.now(), files: 0, rows: 0 }] };
        const [d0, s0] = await Promise.all([SS.load('data'), SS.load('state')]);
        if (d0 && s0) { await SS.save('p1:data', d0); await SS.save('p1:state', s0); await SS.del('data'); await SS.del('state'); }
        await SS.save('projects', idx);
      }
      st.projIdx = idx; st.project = idx.list.find(x => x.id === idx.cur) || idx.list[0];
      if (remembering()) {
        const [data, state] = await Promise.all([SS.load(pkey(st.project.id, 'data')), SS.load(pkey(st.project.id, 'state'))]);
        const n = applyProject(data, state);
        if (n) { st.project.files = n; ssMsg(`Session précédente restaurée (${n} feuille(s), ${st.rows.length.toLocaleString('fr-BE')} lignes).`); }
      }
    }
  } catch (e) { ssMsg('Session précédente illisible : ignorée.'); }
  if (!st.projIdx) st.projIdx = { v: 1, cur: 'p1', n: 1, list: [{ id: 'p1', name: 'Projet 1', created: Date.now(), updated: Date.now(), files: 0, rows: 0 }] };   // sans stockage : projets en mémoire
  updateProjUi();
  ssReady = true;
}
const filterMatches = () => { const q = E.normName($('#fSearch').value); return filtVals.filter(v => !q || E.normName(v).includes(q)); };
