/* js/app-donnees.js — Interface du tableau croisé (index.html) : Données : jointures entre fichiers, aperçu et contrôle qualité, reconstruction des données unifiées.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- jointures entre fichiers : sources virtuelles « ⨝ » recalculées à chaque reconstruction ---------- */
const PJ = window.PivotJoin;
const realSources = () => st.sources.filter(s => !s.join);
function materializeJoins() {
  const real = realSources(), byId = new Map(real.map(s => [s.id, s])), out = [];
  st.joins.forEach(d => {
    d.error = ''; d.stats = null;
    const L = byId.get(d.left), R = byId.get(d.right);
    if (!L || !R) { d.error = 'Un des deux fichiers d\'origine n\'est plus chargé.'; return; }
    let r;
    try { r = PJ.build(d, L, R); } catch (e) { r = { error: 'Calcul impossible (' + (e && e.message ? e.message : e) + ')' }; }
    if (r.error) { d.error = r.error; return; }
    d.stats = r.stats;
    out.push({ id: d.id, file: '⨝ ' + d.name, sheet: '', label: '⨝ ' + d.name, aoa: r.aoa, headerRow: 0, use: d.use !== false, join: d });
  });
  st.sources = real.concat(out);
}
const jf = { editing: null };
const PQ = window.PivotQuality;
const srcById = id => realSources().find(s => s.id === id);
function jKeyRows(def) {
  const L = srcById($('#jLeft').value), R = srcById($('#jRight').value);
  const ln = L ? PJ.columnNames(L.aoa, L.headerRow) : [], rn = R ? PJ.columnNames(R.aoa, R.headerRow) : [];
  const opt = (names, sel) => '<option value="">—</option>' + names.map(n => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const cur = def ? def.keys : [];
  $('#jKeys').innerHTML = [0, 1, 2].map(i => `<div class="frow"><select data-jk="l${i}" aria-label="Clé ${i + 1} à gauche">${opt(ln, cur[i] && cur[i][0])}</select> = <select data-jk="r${i}" aria-label="Clé ${i + 1} à droite">${opt(rn, cur[i] && cur[i][1])}</select></div>`).join('');
}
function jColsRows(def) {
  const R = srcById($('#jRight').value);
  const rn = R ? PJ.columnNames(R.aoa, R.headerRow) : [];
  const keysR = [0, 1, 2].map(i => ($('#jKeys [data-jk="r' + i + '"]') || {}).value).filter(Boolean);
  const chosen = def && def.cols ? new Set(def.cols) : null;
  $('#jCols').innerHTML = rn.filter(n => !keysR.includes(n)).map(n => `<label><input type="checkbox" value="${esc(n)}"${!chosen || chosen.has(n) ? ' checked' : ''}> ${esc(n)}</label>`).join('') || '<span class="hint">Choisissez d\'abord la clé de droite.</span>';
}
function readJoinForm() {
  const keys = [0, 1, 2].map(i => [$('#jKeys [data-jk="l' + i + '"]').value, $('#jKeys [data-jk="r' + i + '"]').value]).filter(k => k[0] && k[1]);
  const all = [...document.querySelectorAll('#jCols input')], on = all.filter(x => x.checked).map(x => x.value);
  return { name: $('#jName').value.trim(), left: $('#jLeft').value, right: $('#jRight').value, keys, type: $('#jType').value, dup: $('#jDup').value, cols: on.length === all.length ? null : on };
}
function previewJoin() {
  const f = readJoinForm(), L = srcById(f.left), R = srcById(f.right);
  if (!L || !R) { $('#jPrev').textContent = ''; return null; }
  if (L === R) { $('#jPrev').textContent = 'Choisissez deux sources différentes.'; return { error: 'same' }; }
  const r = PJ.build(f, L, R);
  if (r.error) { $('#jPrev').textContent = r.error; return r; }
  const s = r.stats;
  $('#jPrev').textContent = `Aperçu : ${s.left.toLocaleString('fr-BE')} ligne(s) à gauche → ${s.matched.toLocaleString('fr-BE')} avec correspondance, ${s.unmatched.toLocaleString('fr-BE')} sans${f.type === 'inner' ? ' (écartées)' : ' (colonnes de droite vides)'} · ${s.out.toLocaleString('fr-BE')} ligne(s) résultat`
    + (s.dupKeys ? ` · ⚠ ${s.dupKeys.toLocaleString('fr-BE')} clé(s) en double à droite (${f.dup === 'all' ? 'les lignes sont multipliées' : 'première ligne retenue'})` : '');
  return r;
}
function renderJoinList() {
  const name = id => { const s = srcById(id); return s ? s.label : '(retiré)'; };
  $('#jList').innerHTML = st.joins.length ? st.joins.map(d => `<div class="jl"><b>⨝ ${esc(d.name)}</b><span class="meta">${esc(name(d.left))} ⨝ ${esc(name(d.right))} sur ${esc(d.keys.map(k => k[0] + ' = ' + k[1]).join(' ; '))}${d.stats ? ' · ' + d.stats.out.toLocaleString('fr-BE') + ' lignes' : ''}</span>${d.error ? `<span class="bad">⚠ ${esc(d.error)}</span>` : ''}<button type="button" data-jact="edit" data-id="${d.id}">Modifier</button><button type="button" data-jact="del" data-id="${d.id}">Supprimer</button></div>`).join('') : '<p class="hint">Aucune jointure.</p>';
}
function fillJoinForm(def) {
  jf.editing = def ? def.id : null;
  $('#jLegend').textContent = def ? 'Modifier la jointure' : 'Nouvelle jointure';
  const rs = realSources();
  const opts = rs.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  $('#jLeft').innerHTML = opts; $('#jRight').innerHTML = opts;
  $('#jLeft').value = def ? def.left : (rs[0] ? rs[0].id : ''); $('#jRight').value = def ? def.right : (rs[1] ? rs[1].id : '');
  $('#jName').value = def ? def.name : '';
  $('#jType').value = def ? def.type : 'left'; $('#jDup').value = def ? def.dup : 'first';
  $('#jOff').checked = !def; $('#jOff').parentElement.hidden = !!def;
  jKeyRows(def); jColsRows(def); previewJoin(); renderJoinList();
}
function openJoin(def) {
  if (realSources().length < 2) { $('#msg').textContent = 'Il faut au moins deux sources pour une jointure.'; return; }
  fillJoinForm(def || null);
  if (!$('#dlgJoin').open) $('#dlgJoin').showModal();
}
function saveJoin() {
  const f = readJoinForm(), L = srcById(f.left), R = srcById(f.right);
  const fail = t => { $('#jPrev').textContent = t; };
  if (!f.name) return fail('Donnez un nom à la jointure.');
  if (!L || !R || L === R) return fail('Choisissez deux sources différentes.');
  if (st.joins.some(d => d.name.toLowerCase() === f.name.toLowerCase() && d.id !== jf.editing)) return fail('Une jointure porte déjà ce nom.');
  if (st.joins.length >= PJ.MAX_JOINS && !jf.editing) return fail('Limite de ' + PJ.MAX_JOINS + ' jointures atteinte.');
  const r = PJ.build(f, L, R); if (r.error) return fail(r.error);
  const cur = jf.editing && st.joins.find(d => d.id === jf.editing);
  if (cur) Object.assign(cur, f);
  else { const d = Object.assign({ id: 'j' + (++st.njid), use: true }, f); st.joins.push(d); if ($('#jOff').checked) { L.use = false; R.use = false; } }
  rebuild();
  fillJoinForm(null);
  $('#jPrev').textContent = 'Jointure « ' + f.name + ' » enregistrée : ' + r.stats.out.toLocaleString('fr-BE') + ' ligne(s). Ses colonnes sont dans la liste des champs.';
}

/* ---------- aperçu et contrôle qualité des données ---------- */
let pvProf = null;
const nfmt = x => (typeof x === 'number' && isFinite(x) ? (Math.round(x * 100) / 100).toLocaleString('fr-BE') : '');
const cellTxt = v => (v === null || v === undefined ? '' : v instanceof Date ? E.dateLabel(v) : typeof v === 'number' ? nfmt(v) : String(v));
function setPvTab(t) {
  document.querySelectorAll('#dlgPreview .pvtabs button').forEach(b => { b.classList.toggle('on', b.dataset.pv === t); b.setAttribute('aria-selected', b.dataset.pv === t); });
  $('#pvQual').hidden = t !== 'qual'; $('#pvRows').hidden = t !== 'rows'; $('#pvRaw').hidden = t !== 'raw';
  if (t === 'qual') drawQuality(); else if (t === 'rows') drawPvRows(); else drawPvRaw();
}
function computeProfile() {
  if (!pvProf) pvProf = PQ.profile(st.rows, st.fields, { activeSources: st.sources.filter(s => s.use).length });
  return pvProf;
}
function drawQuality() {
  if (!pvProf) {   // le calcul peut durer sur un gros fichier : message d'abord
    $('#pvSum').textContent = 'Calcul en cours…'; $('#pvIssues').innerHTML = ''; $('#pvProf').innerHTML = '';
    setTimeout(() => { computeProfile(); drawQuality(); }, 20);
    return;
  }
  const p = pvProf, warns = p.issues.filter(i => i.sev === 'warn').length;
  $('#pvSum').textContent = `${p.n.toLocaleString('fr-BE')} ligne(s) · ${p.fields.length} champ(s) · ${warns ? warns + ' point(s) à vérifier' : 'aucun point bloquant'}${p.issues.length - warns ? ' · ' + (p.issues.length - warns) + ' remarque(s)' : ''}`;
  $('#pvIssues').innerHTML = p.issues.length ? p.issues.map(i => `<li class="${i.sev === 'warn' ? 'w' : ''}">${i.sev === 'warn' ? '⚠' : 'ℹ'} ${esc(i.text)}</li>`).join('') : '<li>✔ Aucune anomalie détectée.</li>';
  const rows = p.fields.map(f => {
    const detail = f.type === 'number' ? `somme ${nfmt(f.sum)}${f.neg ? ' · ' + f.neg + ' négatif(s)' : ''}${f.zero ? ' · ' + f.zero + ' zéro(s)' : ''}` : f.top.slice(0, 3).map(t => esc(t[0]) + ' (' + t[1] + ')').join(' · ');
    const mm = f.type === 'date' ? [cellTxt(f.min), cellTxt(f.max)] : [nfmt(f.min), nfmt(f.max)];
    return `<tr><td>${esc(f.label)}</td><td>${TYPE[f.type] || ''}</td><td class="num" title="${f.filled.toLocaleString('fr-BE')} remplies, ${f.empty.toLocaleString('fr-BE')} vides">${Math.round(f.pctFilled * 100)} %</td><td class="num">${f.capped ? '> ' : ''}${f.distinct.toLocaleString('fr-BE')}</td>`
      + `<td class="num">${f.type === 'text' ? '' : esc(mm[0])}</td><td class="num">${f.type === 'text' ? '' : esc(mm[1])}</td><td class="num">${f.type === 'number' ? nfmt(f.mean) : ''}</td><td class="num">${f.type === 'number' ? nfmt(f.median) : ''}</td><td>${detail}</td></tr>`;
  }).join('');
  $('#pvProf').innerHTML = '<thead><tr><th>Champ</th><th>Type</th><th>Remplis</th><th>Distincts</th><th>Min</th><th>Max</th><th>Moyenne</th><th>Médiane</th><th>Détail</th></tr></thead><tbody>' + rows + '</tbody>';
}
function drawPvRows() {
  const N = 100, fields = st.fields, shown = st.rows.slice(0, N);
  $('#pvRowsInfo').textContent = `${shown.length.toLocaleString('fr-BE')} première(s) ligne(s) sur ${st.rows.length.toLocaleString('fr-BE')} (données unifiées, telles que l'outil les analyse).`;
  $('#pvRowsBox').innerHTML = '<table class="map pvt"><thead><tr>' + fields.map(f => `<th>${esc(f.label)}<span class="tp">${TYPE[f.type] || ''}</span></th>`).join('') + '</tr></thead><tbody>'
    + shown.map(r => '<tr>' + fields.map((f, i) => `<td${f.type === 'number' ? ' class="num"' : ''}>${esc(cellTxt(r[i]))}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
}
function drawPvRaw() {
  const sel = $('#pvSrc');
  if (!sel.options.length || sel.dataset.n !== String(st.sources.length)) {
    sel.innerHTML = st.sources.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join(''); sel.dataset.n = String(st.sources.length);
  }
  const s = st.sources.find(x => x.id === sel.value) || st.sources[0];
  if (!s) { $('#pvRawBox').innerHTML = ''; return; }
  const N = 40, cols = Math.min(40, Math.max(...s.aoa.slice(0, N + s.headerRow + 1).map(r => (r ? r.length : 0)), 1));
  const from = Math.max(0, s.headerRow - 3), part = s.aoa.slice(from, s.headerRow + N);
  $('#pvRawInfo').textContent = `Ligne d'en-tête retenue : ${s.headerRow + 1} (surlignée ; modifiable dans la liste des sources) · ${(s.aoa.length - 1 - s.headerRow).toLocaleString('fr-BE')} ligne(s) de données${s.join ? ' · résultat de jointure' : ''}${s.aoa.length > s.headerRow + N ? ' · ' + N + ' premières affichées' : ''}.`;
  $('#pvRawBox').innerHTML = '<table class="map pvt"><tbody>' + part.map((r, k) => {
    const ri = from + k, cls = ri === s.headerRow ? 'hdrrow' : ri < s.headerRow ? 'dim' : '';
    return `<tr class="${cls}"><td class="num"><b>${ri + 1}</b></td>` + Array.from({ length: cols }, (_, c) => `<td>${esc(cellTxt(r ? r[c] : null))}</td>`).join('') + '</tr>';
  }).join('') + '</tbody></table>';
}
function exportQuality() {
  const p = computeProfile();
  const head = ['Champ', 'Type', 'Remplis', 'Vides', '% remplis', 'Distincts', 'Min', 'Max', 'Moyenne', 'Médiane', 'Somme', 'Non conformes', 'Aberrantes', 'Variantes d\'écriture', 'Principales valeurs'];
  const body = p.fields.map(f => [f.label, f.type, f.filled, f.empty, Math.round(f.pctFilled * 1000) / 10, f.distinct, f.type === 'text' ? '' : (f.type === 'date' ? cellTxt(f.min) : f.min), f.type === 'text' ? '' : (f.type === 'date' ? cellTxt(f.max) : f.max), f.mean, f.median, f.sum, f.bad, f.outliers || 0, f.variants.length, f.top.map(t => t[0] + ' (' + t[1] + ')').join(' ; ')].map(v => (v === undefined ? '' : v)));
  const issues = [[''], ['Anomalies'], ...p.issues.map(i => [(i.sev === 'warn' ? 'À vérifier' : 'Remarque') + ' : ' + i.text])];
  download(new Blob([window.PivotExport.toCSV([head, ...body, ...issues])], { type: 'text/csv;charset=utf-8' }), 'rapport-qualite.csv');
}

/* ---------- reconstruction des données unifiées ---------- */
function rebuild(keepSort) {
  materializeJoins();
  const u = E.unify(st.sources.filter(s => s.use), st.over);
  st.fields = u.fields; st.rows = u.rows; st.conflicts = u.conflicts; st.conflictCount = u.conflictCount;
  $('#pivotAmbiguities').hidden = !u.ambiguities.length;
  $('#pivotAmbiguities').textContent = u.ambiguities.length ? 'Attention : format numérique ambigu — ' + u.ambiguities.slice(0, 4).map(a => `${a.field} (ex. ${a.value}, ${a.count} valeur${a.count > 1 ? 's' : ''})`).join(' ; ') + (u.ambiguities.length > 4 ? ` ; … +${u.ambiguities.length - 4} champ(s)` : '') + '. « 1.234 » est lu comme 1234 : vérifiez les séparateurs.' : '';
  $('#pivotConflicts').hidden = !u.conflictCount;
  $('#pivotConflicts').textContent = u.conflictCount ? `⚠ ${u.conflictCount.toLocaleString('fr-BE')} conflit(s) de fusion : première valeur conservée. Vérifiez vos colonnes avant toute analyse. Exemple : ${u.conflicts[0].source}, ligne ${u.conflicts[0].row}, ${u.conflicts[0].field} (${u.conflicts[0].first} ≠ ${u.conflicts[0].other}).` : '';
  st.cat = E.buildCatalog(u.fields);
  { const gb = window.PivotGroups.buildItems(st.groups, st.cat); st.cat = st.cat.concat(gb.items); st.groupErrors = gb.errors; }
  { const mb = window.PivotMeasures.buildItems(st.measures, st.cat); st.cat = st.cat.concat(mb.items); st.measureErrors = mb.errors; }
  { const cb = window.PivotCalc.buildItems(st.calcs, st.cat); st.cat = st.cat.concat(cb.items); st.calcErrors = cb.errors; }
  st.byKey = new Map(st.cat.map(c => [c.key, c]));
  const ok = k => st.byKey.has(k);
  const L = st.L;
  L.rows = L.rows.filter(ok); L.cols = L.cols.filter(ok); L.vals = L.vals.filter(v => ok(v.key));
  Object.keys(L.filters).forEach(k => { if (!ok(k)) delete L.filters[k]; });
  pruneRules(L);
  if (!keepSort) L.sort = null;
  renderSources(); renderFields(); renderZones(); renderCalcs(); renderGrp(); renderMes(); refresh();
}
function topOf(o) {   // réglage « Top N » d'une vue, d'après ses options
  const tn = Math.floor(+o.topN);
  return tn > 0 && tn <= 500 ? { n: tn, k: Math.max(0, Math.floor(+o.topK) || 0), mode: o.topMode === 'flop' ? 'flop' : 'top', others: o.topOthers !== false } : null;
}
function refresh() {
  st.L.subtotals = !!st.o.subTot;
  st.L.top = topOf(st.o);
  st.res = st.rows.length ? E.compute(st.rows, st.cat, effLayout(curView(), st.L)) : null;
  renderTable();
  syncTopK();
  if (st.dash.on) renderDash();
  persistSession();
  const S = st.L.sort, r = st.res, sel = $('#optSort'), rk0 = st.L.rows[0];
  const main = r && !r.empty && r.cols.length ? (r.colDims.length ? '__tot' : r.cols[0].key) : null;
  sel.value = !S ? (rk0 && (st.L.rowDir || {})[rk0] < 0 ? 'labelDesc' : 'label') : (S.k === 0 && S.col === main ? (S.dir < 0 ? 'desc' : 'asc') : 'custom');
}
