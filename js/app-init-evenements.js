/* js/app-init-evenements.js — Interface du tableau croisé (index.html) : Démarrage (4/5) : événements, dispositions enregistrées, session.
 * Chargé APRÈS tous les fichiers app*.js (fonctions et constantes existent alors). Les instructions sont dans l'ordre EXACT de l'ancien
 * app.js (IIFE unique découpée), réparties sur les cinq fichiers app-init-* : ne pas les réordonner ni changer l'ordre de chargement. */
'use strict';

/* ---------- événements ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act, L = st.L;
  if (act === 'add') { addTo(t.dataset.z, t.closest('.fld').dataset.key); return; }
  if (act === 'rm') {
    const c = t.closest('.chip'), z = c.dataset.z;
    if (z === 'filters') { delete L.filters[c.dataset.key]; if (L.rules) delete L.rules[c.dataset.key]; } else L[z].splice(+c.dataset.i, 1);
    L.sort = null; renderZones(); refresh(); return;
  }
  if (act === 'mv') {
    const c = t.closest('.chip'), z = c.dataset.z, i = +c.dataset.i, j = i + +t.dataset.d;
    if (j >= 0 && j < L[z].length) { [L[z][i], L[z][j]] = [L[z][j], L[z][i]]; L.sort = null; renderZones(); refresh(); }
    return;
  }
  if (act === 'calcedit') { editCalc(t.dataset.name); return; }
  if (act === 'calcdel') { delCalc(t.dataset.name); return; }
  if (act === 'vname') {   // renommer la valeur : le titre change partout (tableau, graphique, exports) ; vide = nom par défaut
    const i = idxOf(t), v = st.L.vals[i], it = st.byKey.get(v.key);
    const cur = v.name || (it ? E.specLabel(it, v.agg) : '');
    const n = window.prompt('Nom affiché pour cette valeur (laisser vide = nom par défaut) :', cur);
    if (n === null) return;
    const clean = PL.cleanLabel(n);
    if (clean && clean !== (it ? E.specLabel(it, v.agg) : '')) v.name = clean; else delete v.name;
    renderZones(); refresh(); return;
  }
  if (act === 'filt') { ev.preventDefault(); openFilter(t.closest('.chip').dataset.key); return; }
  if (act === 'delfield') { removeField(t.closest('.fld').dataset.key); return; }
  if (act === 'restore') { Object.keys(st.over).forEach(k => { if (st.over[k] === '') delete st.over[k]; }); rebuild(); return; }
  if (act === 'editjoin') { openJoin(st.sources.find(s => s.id === t.closest('.src').dataset.id).join); return; }
  if (act === 'delsrc') {
    const id = t.closest('.src').dataset.id, s0 = st.sources.find(s => s.id === id);
    if (s0 && s0.join) st.joins = st.joins.filter(d => d.id !== id);
    else {
      st.sources = st.sources.filter(s => s.id !== id);
      const n = st.joins.filter(d => d.left === id || d.right === id).length;
      if (n) $('#msg').textContent = n + ' jointure(s) utilisaient ce fichier : elles sont suspendues (rajoutez le fichier ou supprimez-les dans « Jointures… »).';
    }
    rebuild();
  }
});
document.addEventListener('change', ev => {
  const t = ev.target, act = t.dataset && t.dataset.act;
  if (act === 'use') { const s = st.sources.find(x => x.id === t.closest('.src').dataset.id); s.use = t.checked; if (s.join) s.join.use = t.checked; rebuild(); }
  else if (act === 'hdr') {
    const s = st.sources.find(x => x.id === t.closest('.src').dataset.id);
    s.headerRow = Math.max(0, Math.min(s.aoa.length - 1, (+t.value || 1) - 1)); rebuild();
  } else if (act === 'vfmt') { st.L.vals[idxOf(t)].fmt = t.value; refresh(); }
  else if (act === 'agg') { st.L.vals[idxOf(t)].agg = t.value; st.L.sort = null; refresh(); }
  else if (t.id === 'fileIn') { addFiles([...t.files]); t.value = ''; }
  else if (t.id === 'optRowTot') { st.o.rowTot = t.checked; saveOpts(); renderTable(); }
  else if (t.id === 'optColTot') { st.o.colTot = t.checked; saveOpts(); renderTable(); }
  else if (t.id === 'optSub') { st.o.subTot = t.checked; saveOpts(); refresh(); }
  else if (t.id === 'optTopN') { const n = Math.floor(+t.value); st.o.topN = n > 0 ? Math.min(n, 500) : 0; t.value = st.o.topN; saveOpts(); refresh(); }
  else if (t.id === 'optTopMode') { st.o.topMode = t.value; saveOpts(); refresh(); }
  else if (t.id === 'optTopK') { st.o.topK = +t.value || 0; saveOpts(); refresh(); }
  else if (t.id === 'optTopOthers') { st.o.topOthers = t.checked; saveOpts(); refresh(); }
  else if (t.id === 'optSort') {
    const r = st.res;
    if (t.value === 'label' || t.value === 'labelDesc') {
      st.L.sort = null;
      if (st.L.rows[0]) (st.L.rowDir = st.L.rowDir || {})[st.L.rows[0]] = t.value === 'label' ? 1 : -1;
    } else if (!r || r.empty) st.L.sort = null;
    else if (t.value !== 'custom') st.L.sort = { col: r.colDims.length ? '__tot' : r.cols[0].key, k: 0, dir: t.value === 'desc' ? -1 : 1 };
    refresh();
  }
  else if (t.id === 'optDec') { st.o.dec = t.value; saveOpts(); renderTable(); }
  else if (OPT_IDS[t.id]) { const [key, bool] = OPT_IDS[t.id]; st.o[key] = bool ? t.checked : t.value; saveOpts(); syncCf(); renderTable(); }
});
$('#optCfVal').addEventListener('input', e => { st.o.cfVal = e.target.value; saveOpts(); renderTable(); });

/* ---------- dispositions enregistrées (localStorage ; export / import .json) ---------- */
$('#lySel').addEventListener('change', e => { if (e.target.value) $('#lyName').value = e.target.value; });
$('#lySave').addEventListener('click', () => {
  const store = lyStore();
  if (!store) { lyMsg('Stockage local indisponible : utilisez « Exporter (.json) ».'); return; }
  const r = PL.save(store, $('#lyName').value, PL.serialize(st.L, st.o));
  if (!r.ok) { lyMsg(r.error); return; }
  lyRefresh(r.name); $('#lyName').value = r.name;
  lyMsg(`Disposition « ${r.name} » ${r.replaced ? 'mise à jour' : 'enregistrée'}.`);
});
$('#lyApply').addEventListener('click', () => {
  const store = lyStore(), name = $('#lySel').value, all = store ? PL.loadAll(store) : {};
  if (!name || !Object.prototype.hasOwnProperty.call(all, name)) { lyMsg('Choisissez une disposition dans la liste.'); return; }
  if (!st.rows.length) { lyMsg('Ajoutez d’abord un fichier : la disposition s’applique aux champs chargés.'); return; }
  lyApplyLayout(all[name], name);
});
$('#lyDel').addEventListener('click', () => {
  const store = lyStore(), name = $('#lySel').value;
  if (!store || !name) { lyMsg('Choisissez une disposition à supprimer.'); return; }
  if (!window.confirm(`Supprimer la disposition « ${name} » ?`)) return;
  PL.remove(store, name); lyRefresh(); lyMsg(`Disposition « ${name} » supprimée.`);
});
$('#lyExport').addEventListener('click', () => {
  const name = PL.cleanName($('#lyName').value) || 'disposition';
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'disposition';
  download(new Blob([JSON.stringify(Object.assign({ name }, PL.serialize(st.L, st.o)), null, 2)], { type: 'application/json' }), `disposition-${slug}.json`);
  lyMsg('Disposition exportée.');
});
$('#lyImport').addEventListener('click', () => $('#lyFile').click());
$('#lyFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let raw = null;
  try { if (f.size <= 1048576) raw = JSON.parse(await f.text()); } catch (err) { raw = null; }
  const lay = raw && PL.sanitize(raw);
  if (!lay) { lyMsg('Fichier de disposition invalide (ou trop volumineux).'); return; }
  const name = PL.cleanName(raw.name) || PL.cleanName(f.name.replace(/\.json$/i, '')) || 'importée';
  const store = lyStore(), saved = store ? PL.save(store, name, lay) : { ok: false };
  if (saved.ok) { lyRefresh(name); $('#lyName').value = name; }
  if (st.rows.length) lyApplyLayout(lay, name);
  else lyMsg(saved.ok ? `Disposition « ${name} » importée ; ajoutez un fichier puis cliquez sur « Appliquer ».` : 'Importée mais non enregistrée (stockage indisponible).');
});

/* ---------- session mémorisée (IndexedDB) : fichiers + sélections, pour survivre à une actualisation ---------- */
const SS = SSM.create((() => { try { return window.indexedDB || null; } catch (e) { return null; } })());
let ssReady = false, ssTimer = null, ssChain = Promise.resolve(), ssSig = '';
