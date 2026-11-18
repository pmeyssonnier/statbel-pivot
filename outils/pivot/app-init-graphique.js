/* outils/pivot/app-init-graphique.js — Interface du tableau croisé (outils/statbel_pivot.html) : Démarrage (3/5) : graphique, champs calculés, grand écran, liste des données, groupes, mesures, détail.
 * Chargé APRÈS tous les fichiers app*.js (fonctions et constantes existent alors). Les instructions sont dans l'ordre EXACT de l'ancien
 * app.js (IIFE unique découpée), réparties sur les cinq fichiers app-init-* : ne pas les réordonner ni changer l'ordre de chargement. */
'use strict';

/* ---------- graphique (SVG généré par PivotChart ; PNG/SVG exportables) ---------- */
const ch = { type: 'none', k: 0, k2: -1, gmax: 0, last: null, pos: 'top', o: PC.normOpts() };   // pos : top | bottom | left | right (par rapport au tableau)
try { const c = JSON.parse(localStorage.getItem('statbel_pivot_chart') || '{}'); if (c && PC.TYPES[c.type]) ch.type = c.type; if (c && Number.isInteger(c.k) && c.k >= 0 && c.k < 20) ch.k = c.k; if (c && Number.isInteger(c.k2) && c.k2 >= -1 && c.k2 < 20) ch.k2 = c.k2; if (c && Number.isFinite(c.gmax) && c.gmax > 0) ch.gmax = c.gmax; } catch (e) { /* stockage indisponible */ }
try { const c = JSON.parse(localStorage.getItem('statbel_pivot_chart') || '{}'); ch.pos = ['top', 'bottom', 'left', 'right'].includes(c.pos) ? c.pos : (c.side === true ? 'right' : 'top'); } catch (e) { /* ignoré */ }
try { ch.o = PC.normOpts((JSON.parse(localStorage.getItem('statbel_pivot_chart') || '{}') || {}).o); } catch (e) { /* ignoré */ }
$('#chType').innerHTML = Object.keys(PC.TYPES).map(t => `<option value="${t}">${esc(PC.TYPES[t])}</option>`).join('');
$('#chType').value = ch.type;
// Options du graphique (étiquettes, légende, palette, ordre, titre, axe, repère, quadrillage, lissage, cartes KPI)
// Panneau généré par PivotChartEditor (mêmes définitions que la fenêtre d'édition d'une tuile) ; affichage selon le registre des capacités
const PCE = window.PivotChartEditor, coBox = $('#coBox');
coBox.innerHTML = PCE.html(ch.o);
syncChOpts();
$('#btnChOpts').addEventListener('click', () => setPanel(!panelOpen()));
$('#btnTbOpts').addEventListener('click', () => setTPanel(!tpanelOpen()));
$('#cpClose').addEventListener('click', () => { setPanel(false); $('#btnChOpts').focus(); });
$('#tpClose').addEventListener('click', () => { setTPanel(false); $('#btnTbOpts').focus(); });
$('#cpReset').addEventListener('click', () => { ch.o = PC.normOpts({}); syncChOpts(); saveChart(); renderChart(); if (st.dash.on) renderDash(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && (panelOpen() || tpanelOpen()) && ![...document.querySelectorAll('.menu')].some(m => !m.hidden) && !document.querySelector('dialog[open]')) { if (tpanelOpen()) { setTPanel(false); $('#btnTbOpts').focus(); } else { setPanel(false); $('#btnChOpts').focus(); } } });
$('#chOpts').addEventListener('change', () => {
  ch.o = PC.normOpts(PCE.read(coBox));
  syncChOpts(); saveChart(); renderChart(); if (st.dash.on) renderDash();
});
$('#chType').addEventListener('change', e => { ch.type = e.target.value; saveChart(); renderChart(); });
$('#chPos').addEventListener('change', e => { ch.pos = e.target.value; saveChart(); renderChart(); stickyHeads(); });
$('#chK').addEventListener('change', e => { ch.k = +e.target.value; saveChart(); renderChart(); });
$('#chK2').addEventListener('change', e => { ch.k2 = +e.target.value; saveChart(); renderChart(); });
$('#chG').addEventListener('change', e => { const x = parseFloat(String(e.target.value).replace(',', '.')); ch.gmax = Number.isFinite(x) && x > 0 ? x : 0; e.target.value = ch.gmax || ''; saveChart(); renderChart(); });
$('#chSvg').addEventListener('click', () => { if (ch.last) download(new Blob([ch.last.svg], { type: 'image/svg+xml;charset=utf-8' }), 'graphique.svg'); });
$('#chPng').addEventListener('click', () => {
  if (!ch.last) return;
  const { svg, w, h } = ch.last, img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2;
    const g = cv.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0, w, h);
    cv.toBlob(b => { if (b) download(b, 'graphique.png'); else $('#msg').textContent = 'Export PNG impossible : utilisez SVG.'; }, 'image/png');
  };
  img.onerror = () => { $('#msg').textContent = 'Export PNG impossible : utilisez SVG.'; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
});

/* ---------- champs calculés (formule sur les sommes ; définitions conservées dans localStorage) ---------- */
try { st.calcs = PCalc.load(window.localStorage); } catch (e) { st.calcs = []; }
$('#cIns').addEventListener('change', e => {
  const v = e.target.value; if (!v) return;
  const f = $('#cFormula'), a = f.selectionStart == null ? f.value.length : f.selectionStart, b = f.selectionEnd == null ? a : f.selectionEnd;
  f.value = f.value.slice(0, a) + '[' + v + ']' + f.value.slice(b); const p = a + v.length + 2; f.focus(); f.setSelectionRange(p, p);
  e.target.value = '';
});
$('#cSave').addEventListener('click', () => {
  const def = PCalc.sanitizeDefs([{ name: $('#cName').value, formula: $('#cFormula').value }])[0];
  if (!def) { cMsg('Renseignez un nom et une formule.'); return; }
  const bad = PCalc.checkName(def.name, st.calcs, st.cat, calcEditing);
  if (bad) { cMsg(bad); return; }
  const test = PCalc.buildItems([def], st.cat.filter(c => !c.calc));
  if (test.errors.length) { cMsg('Formule invalide : ' + test.errors[0].error); return; }
  const i = calcEditing ? st.calcs.findIndex(x => x.name === calcEditing) : -1;
  if (i < 0 && st.calcs.length >= PCalc.MAX_CALCS) { cMsg('Limite de ' + PCalc.MAX_CALCS + ' champs calculés atteinte.'); return; }
  if (i >= 0) {
    st.L.vals.forEach(v => { if (v.key === 'calc|' + st.calcs[i].name) v.key = 'calc|' + def.name; });   // renommage : les valeurs déjà posées suivent
    st.calcs[i] = def;
  } else st.calcs.push(def);
  calcEditing = '';
  const kept = storeCalcs();
  $('#cName').value = ''; $('#cFormula').value = '';
  rebuild();
  cMsg('Champ « ' + def.name + ' » enregistré : ajoutez-le dans Valeurs (bouton V de la liste).' + (kept ? '' : ' Stockage indisponible : il ne sera pas conservé après rechargement.'));
});

/* ---------- grand écran : mode agrandi, en-têtes de tableau collants ---------- */
$('#btnFocus').addEventListener('click', () => setFocus(!focusOn(), true));
document.addEventListener('keydown', ev => {
  if (ev.key !== 'f' && ev.key !== 'F') return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target.tagName || '')) || document.querySelector('dialog[open]') || window.innerWidth <= 900) return;
  setFocus(!focusOn(), true);
});
window.addEventListener('resize', () => {
  clearTimeout(rsT);
  rsT = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; renderChart(); if (st.dash.on) renderDash(); } stickyHeads(); }, 150);
});
try { if (localStorage.getItem('statbel_pivot_focus') === '1') setFocus(true, false); } catch (e) { /* ignoré */ }

/* ---------- liste des données : composant « table » (lignes filtrées, colonnes au choix, recherche, tri, pages) ---------- */
$('#lsQ').addEventListener('input', e => { clearTimeout(lsT); lsT = setTimeout(() => { ls.q = e.target.value; ls.page = 0; renderList(false); }, 250); });
$('#lsPrev').addEventListener('click', () => { ls.page = Math.max(0, ls.page - 1); renderList(true); $('#out').scrollTop = 0; });
$('#lsNext').addEventListener('click', () => { ls.page++; renderList(true); $('#out').scrollTop = 0; });
$('#lsCols').addEventListener('click', () => {
  const on = new Set(listCols(st.o).map(c => c.key));
  $('#lcSearch').value = '';
  $('#lcList').innerHTML = listFields().map(c => `<label data-t="${esc(E.normName(c.label))}"><input type="checkbox" value="${esc(c.key)}"${on.has(c.key) ? ' checked' : ''}> ${esc(c.label)}</label>`).join('');
  $('#dlgListCols').showModal();
});
$('#lcSearch').addEventListener('input', e => { const q = E.normName(e.target.value); document.querySelectorAll('#lcList label').forEach(l => { l.hidden = !!q && !l.dataset.t.includes(q); }); });
$('#lcAll').addEventListener('click', () => document.querySelectorAll('#lcList label:not([hidden]) input').forEach(i => { i.checked = true; }));
$('#lcNone').addEventListener('click', () => document.querySelectorAll('#lcList label:not([hidden]) input').forEach(i => { i.checked = false; }));
$('#lcOk').addEventListener('click', () => {
  const all = [...document.querySelectorAll('#lcList input')], on = all.filter(i => i.checked).map(i => i.value);
  st.o.listCols = on.length === all.length || !on.length ? [] : on;   // tout ou rien = toutes les colonnes
  saveOpts(); $('#dlgListCols').close(); renderList(false); persistSession();
});

/* ---------- groupes de valeurs : regrouper des valeurs d'un champ ou découper un nombre en tranches ---------- */
try { st.groups = PGr.load(window.localStorage); } catch (e) { st.groups = []; }
st.groupErrors = [];
$('#gKind').addEventListener('change', () => { gDraft = []; renderGrpSources(); renderGrpDraft(); renderGrpPrev(); });
$('#gSrc').addEventListener('change', () => { gDraft = []; renderGrpDraft(); });
$('#gSearch').addEventListener('input', renderGrpValues);
$('#gEdge').addEventListener('change', renderGrpPrev);
$('#gBreaks').addEventListener('input', renderGrpPrev);
$('#gLabels').addEventListener('input', renderGrpPrev);
$('#gAuto').addEventListener('click', () => {
  const it = gSrcItem(), br = it && PGr.autoBreaks(st.rows, it, parseFloat(String($('#gStep').value).replace(',', '.')));
  if (!br) { gMsg('Pas régulier impossible : indiquez un pas > 0 (60 tranches au maximum) pour un champ numérique rempli.'); return; }
  $('#gBreaks').value = br.join(', '); renderGrpPrev(); gMsg(br.length + 1 + ' tranches générées : modifiez les seuils à la main si besoin.');
});
$('#gAdd').addEventListener('click', () => {
  const label = $('#gLabel').value.trim(), vals = [...document.querySelectorAll('#gList input:checked')].map(i => i.value);
  if (!label) { gMsg('Donnez un nom au groupe.'); return; }
  if (!vals.length) { gMsg('Cochez au moins une valeur à regrouper.'); return; }
  const ex = gDraft.find(g => g.label.toLowerCase() === label.toLowerCase());
  if (ex) ex.values = [...new Set(ex.values.concat(vals))]; else gDraft.push({ label, values: vals });
  $('#gLabel').value = ''; renderGrpDraft(); gMsg('Groupe « ' + label + ' » : ' + vals.length + ' valeur(s). Créez d\'autres groupes ou enregistrez.');
});
$('#gDraft').addEventListener('click', ev => { const b = ev.target.closest('[data-gdel]'); if (b) { gDraft.splice(+b.dataset.gdel, 1); renderGrpDraft(); } });
$('#gSave').addEventListener('click', () => {
  const kind = $('#gKind').value, src = $('#gSrc').value;
  if (!src) { gMsg('Aucun champ à regrouper : ajoutez un fichier.'); return; }
  const raw = { id: grpEditing || '', name: $('#gName').value, src, kind };
  if (kind === 'values') {
    if (!gDraft.length) { gMsg('Créez au moins un groupe (cochez des valeurs, nommez-le, « Créer le groupe »).'); return; }
    raw.groups = gDraft; raw.rest = $('#gRest').value === 'other' ? 'Autres' : '';
  } else {
    raw.breaks = PGr.parseBreaks($('#gBreaks').value);
    if (!raw.breaks.length) { gMsg('Saisissez au moins un seuil (ex. 18, 25, 35).'); return; }
    const cu = $('#gLabels').value.split(';').map(x => x.trim()).filter((x, i, a) => a.length > 1 || x);
    if (cu.length && cu.length !== raw.breaks.length + 1) { gMsg('Libellés : ' + (raw.breaks.length + 1) + ' attendus (un de plus que de seuils), ' + cu.length + ' saisis.'); return; }
    raw.labels = cu; raw.edge = $('#gEdge').value;
  }
  const bad = PGr.checkName(raw.name, st.groups, st.cat, grpEditing);
  if (bad) { gMsg(bad); return; }
  const def = PGr.sanitizeDefs([raw])[0];
  if (!def) { gMsg('Définition invalide.'); return; }
  const i = grpEditing ? st.groups.findIndex(x => x.id === grpEditing) : -1;
  if (i < 0 && st.groups.length >= PGr.MAX_DEFS) { gMsg('Limite de ' + PGr.MAX_DEFS + ' groupes de valeurs atteinte.'); return; }
  if (i >= 0) { def.id = st.groups[i].id; st.groups[i] = def; } else { let k = 1; while (st.groups.some(x => x.id === 'g' + k)) k++; def.id = 'g' + k; st.groups.push(def); }
  const kept = storeGroups(); grpReset(); rebuild(); renderGrp();
  gMsg('Champ « ' + def.name + ' » enregistré : il est dans la liste des champs (glissez-le en Lignes ou Colonnes).' + (kept ? '' : ' Stockage indisponible : il ne sera pas conservé après rechargement.'));
});
$('#gCancel').addEventListener('click', () => { grpReset(); gMsg('Modification annulée.'); });
$('#gDefs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-gact]'); if (!b) return;
  const d = st.groups.find(x => x.id === b.dataset.gid); if (!d) return;
  if (b.dataset.gact === 'del') {
    st.groups = st.groups.filter(x => x.id !== d.id); storeGroups(); if (grpEditing === d.id) grpReset(); dropFieldEverywhere('grp|' + d.id);
    rebuild(); renderGrp(); gMsg('Groupe de valeurs « ' + d.name + ' » supprimé.'); return;
  }
  grpEditing = d.id; $('#gKind').value = d.kind; renderGrpSources(); $('#gSrc').value = d.src; $('#gName').value = d.name; $('#gCancel').hidden = false;
  if (d.kind === 'values') { gDraft = d.groups.map(g => ({ label: g.label, values: g.values.slice() })); $('#gRest').value = d.rest ? 'other' : ''; renderGrpDraft(); }
  else { $('#gBreaks').value = d.breaks.join(', '); $('#gEdge').value = d.edge || 'start'; $('#gLabels').value = (d.labels || []).join('; '); renderGrpPrev(); }
  $('#detGrp').open = true; gMsg('Modification de « ' + d.name + ' » : modifiez puis Enregistrer.');
});
$('#detGrp').addEventListener('toggle', renderGrp);
renderGrp();

/* ---------- mesures : indicateurs nommés avec condition (nombre, %, valeur), à poser dans « Valeurs » ---------- */
try { st.measures = PMe.load(window.localStorage); } catch (e) { st.measures = []; }
st.measureErrors = [];
$('#mKind').addEventListener('change', renderMes);
$('#mAddCond').addEventListener('click', () => {
  if (mCond.length >= PMe.MAX_CONDS) { mMsg('Six critères au maximum.'); return; }
  const f = PMe.condFields(st.cat)[0];
  if (!f) { mMsg('Ajoutez d\'abord un fichier.'); return; }
  mCond.push({ key: f.key, op: 'in', v: '' }); renderMesConds();
});
$('#mConds').addEventListener('change', ev => {
  const row = ev.target.closest('[data-i]'), f = ev.target.dataset.f; if (!row || !f) return;
  mCond[+row.dataset.i][f] = ev.target.value;
});
$('#mConds').addEventListener('input', ev => { const row = ev.target.closest('[data-i]'); if (row && ev.target.dataset.f === 'v') mCond[+row.dataset.i].v = ev.target.value; });
$('#mConds').addEventListener('focusin', ev => {   // propositions : valeurs les plus fréquentes du champ choisi
  const row = ev.target.closest('[data-i]'); if (!row || ev.target.dataset.f !== 'v') return;
  const it = st.byKey.get(mCond[+row.dataset.i].key);
  $('#mVals').innerHTML = it ? PMe.suggestions(st.rows, it, 100).map(v => `<option value="${esc(v)}">`).join('') : '';
});
$('#mConds').addEventListener('click', ev => { const b = ev.target.closest('[data-mdel]'); if (b) { mCond.splice(+b.dataset.mdel, 1); renderMesConds(); } });
$('#mSave').addEventListener('click', () => {
  const raw = { id: mesEditing, name: $('#mName').value, kind: $('#mKind').value, src: $('#mSrc').value, agg: $('#mAgg').value, conds: mCond };
  const bad = PMe.checkName(raw.name, st.measures, st.cat, mesEditing);
  if (bad) { mMsg(bad); return; }
  if (mCond.some(c => !String(c.v).trim())) { mMsg('Complétez la valeur de chaque critère, ou retirez-le.'); return; }
  if (raw.kind === 'value' && !raw.src) { mMsg('Choisissez le champ numérique.'); return; }
  const def = PMe.sanitizeDefs([raw])[0];
  if (!def) { mMsg('Définition invalide.'); return; }
  const test = PMe.buildItems([def], st.cat);
  if (test.errors.length) { mMsg(test.errors[0].error); return; }
  const i = mesEditing ? st.measures.findIndex(x => x.id === mesEditing) : -1;
  if (i < 0 && st.measures.length >= PMe.MAX_DEFS) { mMsg('Limite de ' + PMe.MAX_DEFS + ' mesures atteinte.'); return; }
  if (i >= 0) { def.id = st.measures[i].id; st.measures[i] = def; } else { let k = 1; while (st.measures.some(x => x.id === 'm' + k)) k++; def.id = 'm' + k; st.measures.push(def); }
  const kept = storeMeasures(); mesReset(); rebuild();
  mMsg('Mesure « ' + def.name + ' » enregistrée : ajoutez-la dans Valeurs (bouton V de la liste des champs).' + (kept ? '' : ' Stockage indisponible : elle ne sera pas conservée après rechargement.'));
});
$('#mCancel').addEventListener('click', () => { mesReset(); mMsg('Modification annulée.'); });
$('#mDefs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-mact]'); if (!b) return;
  const d = st.measures.find(x => x.id === b.dataset.mid); if (!d) return;
  if (b.dataset.mact === 'del') { st.measures = st.measures.filter(x => x.id !== d.id); storeMeasures(); if (mesEditing === d.id) mesReset(); dropFieldEverywhere('mes|' + d.id); rebuild(); mMsg('Mesure « ' + d.name + ' » supprimée.'); return; }
  mesEditing = d.id; $('#mName').value = d.name; $('#mKind').value = d.kind; renderMes(); if (d.kind === 'value') $('#mSrc').value = d.src; $('#mAgg').value = d.agg;
  mCond = d.conds.map(c => Object.assign({}, c)); renderMesConds(); $('#mCancel').hidden = false; $('#detMes').open = true; mMsg('Modification de « ' + d.name + ' » : modifiez puis Enregistrer.');
});
renderMes();

/* ---------- détail des lignes d'une cellule ---------- */
$('#dXlsx').addEventListener('click', () => {
  if (!detail) return;
  window.PivotExport.writeXLSX(detail, 'detail-lignes.xlsx', 'Détail', XL);
});
$('#dClose').addEventListener('click', () => $('#dlgDetail').close());
