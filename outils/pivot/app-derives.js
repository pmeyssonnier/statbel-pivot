/* outils/pivot/app-derives.js — Interface du tableau croisé (outils/statbel_pivot.html) : Champs dérivés : champs calculés, groupes de valeurs et mesures.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et outils/pivot/README.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- champs calculés (formule sur les sommes ; définitions conservées dans localStorage) ---------- */
const PCalc = window.PivotCalc;
const cMsg = t => { $('#cMsg').textContent = t; };
function storeCalcs() { let ok = false; try { ok = PCalc.save(window.localStorage, st.calcs); } catch (e) { /* ignoré */ } return ok; }
function renderCalcs() {
  const nums = PCalc.baseNumeric(st.cat);
  $('#cIns').innerHTML = '<option value="">Insérer un champ…</option>' + nums.map(c => `<option value="${esc(c.key === '__rows' ? 'Nombre de lignes' : c.label)}">${esc(c.key === '__rows' ? 'Nombre de lignes' : c.label)}</option>`).join('');
  const err = new Map(st.calcErrors.map(e => [e.name, e.error]));
  $('#cList').innerHTML = st.calcs.map(d => `<div class="cl"><b>ƒ ${esc(d.name)}</b><code>${esc(d.formula)}</code>${err.has(d.name) ? `<span class="bad">⚠ ${esc(err.get(d.name))}</span>` : ''}
      <button type="button" data-act="calcedit" data-name="${esc(d.name)}">Modifier</button><button type="button" data-act="calcdel" data-name="${esc(d.name)}">Supprimer</button></div>`).join('');
}
let calcEditing = '';
function editCalc(name) {
  const d = st.calcs.find(x => x.name === name); if (!d) return;
  calcEditing = d.name; $('#cName').value = d.name; $('#cFormula').value = d.formula;
  $('#detCalc').open = true; $('#cFormula').focus(); cMsg('Modification de « ' + d.name + ' » : modifiez puis Enregistrer.');
}
function delCalc(name) {
  st.calcs = st.calcs.filter(x => x.name !== name); storeCalcs();
  if (calcEditing === name) { calcEditing = ''; $('#cName').value = ''; $('#cFormula').value = ''; }
  rebuild(); cMsg('Champ calculé « ' + name + ' » supprimé.');
}

/* ---------- groupes de valeurs : regrouper des valeurs d'un champ ou découper un nombre en tranches ---------- */
const PGr = window.PivotGroups;
const gMsg = t => { $('#gMsg').textContent = t; };
function storeGroups() { try { return PGr.save(window.localStorage, st.groups); } catch (e) { return false; } }
let grpEditing = '', gDraft = [], gDistinct = { list: [], capped: false };
const gSrcItem = () => st.byKey.get($('#gSrc').value);
function renderGrpSources() {
  const kind = $('#gKind').value, cur = $('#gSrc').value, srcs = PGr.baseSources(st.cat, kind);
  $('#gSrc').innerHTML = srcs.length ? srcs.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('') : '<option value="">(aucun champ)</option>';
  if (srcs.some(c => c.key === cur)) $('#gSrc').value = cur;
  $('#gValues').hidden = kind !== 'values'; $('#gRanges').hidden = kind !== 'ranges';
  renderGrpValues();
}
function renderGrpValues() {
  const it = gSrcItem();
  if ($('#gKind').value !== 'values' || !it || !$('#detGrp').open) { $('#gList').innerHTML = ''; return; }
  gDistinct = PGr.distinctValues(st.rows, it);
  const taken = new Map(); gDraft.forEach(g => g.values.forEach(v => taken.set(v, g.label)));
  const q = E.normName($('#gSearch').value);
  $('#gList').innerHTML = gDistinct.list.filter(x => !q || E.normName(x.v).includes(q)).map(x => `<label class="${taken.has(x.v) ? 'used' : ''}" title="${taken.has(x.v) ? 'Déjà dans le groupe « ' + esc(taken.get(x.v)) + ' »' : ''}"><input type="checkbox" value="${esc(x.v)}"${taken.has(x.v) ? ' disabled' : ''}> ${esc(x.v)} <span class="meta">(${x.n.toLocaleString('fr-BE')})</span></label>`).join('')
    + (gDistinct.capped ? `<p class="hint">Seules les ${PGr.MAX_DISTINCT} premières valeurs distinctes sont proposées.</p>` : '');
}
function renderGrpDraft() {
  $('#gDraft').innerHTML = gDraft.map((g, i) => `<div class="cl"><b>${esc(g.label)}</b><span class="meta">← ${esc(g.values.slice(0, 6).join(' ; '))}${g.values.length > 6 ? ' … (+' + (g.values.length - 6) + ')' : ''}</span><button type="button" data-gdel="${i}" title="Retirer ce groupe">×</button></div>`).join('');
  renderGrpValues();
}
function renderGrpPrev() {
  const br = PGr.parseBreaks($('#gBreaks').value), cu = $('#gLabels').value.split(';').map(x => x.trim());
  if (!br.length) { $('#gPrev').textContent = 'Saisissez au moins un seuil, séparés par des virgules (ex. 17, 24, 34). Choisissez ci-dessous si un seuil est le début ou la fin d\'une tranche.'; return; }
  const lab = PGr.rangeLabels(br, cu.length === br.length + 1 ? cu : null, $('#gEdge').value);
  $('#gPrev').textContent = 'Tranches : ' + lab.join(' | ') + (cu.length > 1 && cu.length !== br.length + 1 ? ' — attention : ' + (br.length + 1) + ' libellés attendus, libellés par défaut utilisés.' : '');
}
function renderGrpDefs() {
  const err = new Map((st.groupErrors || []).map(e => [e.name, e.error]));
  $('#gDefs').innerHTML = st.groups.map(d => `<div class="cl"><b>▦ ${esc(d.name)}</b><span class="meta">${d.kind === 'ranges' ? d.breaks.length + 1 + ' tranches' : d.groups.length + ' groupe(s)'} · ${esc((st.byKey.get(d.src) || { label: d.src }).label)}</span>${err.has(d.name) ? `<span class="bad">⚠ ${esc(err.get(d.name))}</span>` : ''}<button type="button" data-gact="edit" data-gid="${esc(d.id)}">Modifier</button><button type="button" data-gact="del" data-gid="${esc(d.id)}">Supprimer</button></div>`).join('');
}
function renderGrp() { renderGrpSources(); renderGrpDraft(); renderGrpPrev(); renderGrpDefs(); }
function grpReset() {
  grpEditing = ''; gDraft = []; $('#gName').value = ''; $('#gLabel').value = ''; $('#gBreaks').value = ''; $('#gEdge').value = 'start'; $('#gLabels').value = ''; $('#gStep').value = ''; $('#gRest').value = ''; $('#gSearch').value = ''; $('#gCancel').hidden = true;
  renderGrpDraft(); renderGrpPrev();
}

/* ---------- mesures : indicateurs nommés avec condition (nombre, %, valeur), à poser dans « Valeurs » ---------- */
const PMe = window.PivotMeasures;
const mMsg = t => { $('#mMsg').textContent = t; };
function storeMeasures() { try { return PMe.save(window.localStorage, st.measures); } catch (e) { return false; } }
let mesEditing = '', mCond = [];
function renderMesConds() {
  const fields = PMe.condFields(st.cat);
  $('#mConds').innerHTML = mCond.map((c, i) => `<div class="cl" data-i="${i}"><select data-f="key" aria-label="Champ du critère">${fields.map(f => `<option value="${esc(f.key)}"${f.key === c.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select><select data-f="op" aria-label="Opérateur">${Object.keys(PMe.OPS).map(o => `<option value="${o}"${o === c.op ? ' selected' : ''}>${esc(PMe.OPS[o])}</option>`).join('')}</select><input type="text" data-f="v" list="mVals" value="${esc(c.v)}" placeholder="valeur(s), séparées par ;" maxlength="500" aria-label="Valeur du critère"><button type="button" data-mdel="${i}" title="Retirer ce critère">×</button></div>`).join('') || '<p class="hint">Aucun critère : toutes les lignes comptent.</p>';
}
function renderMes() {
  $('#mValueRow').hidden = $('#mKind').value !== 'value';
  const vf = PMe.valueFields(st.cat), cur = $('#mSrc').value;
  $('#mSrc').innerHTML = vf.length ? vf.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('') : '<option value="">(aucun champ numérique)</option>';
  if (vf.some(c => c.key === cur)) $('#mSrc').value = cur;
  renderMesConds();
  const err = new Map((st.measureErrors || []).map(e => [e.name, e.error]));
  $('#mDefs').innerHTML = st.measures.map(d => `<div class="cl"><b>Σ ${esc(d.name)}</b><span class="meta">${esc(PMe.KINDS[d.kind])}${d.conds.length ? ' · ' + d.conds.length + ' critère(s)' : ''}</span>${err.has(d.name) ? `<span class="bad">⚠ ${esc(err.get(d.name))}</span>` : ''}<button type="button" data-mact="edit" data-mid="${esc(d.id)}">Modifier</button><button type="button" data-mact="del" data-mid="${esc(d.id)}">Supprimer</button></div>`).join('');
}
function mesReset() { mesEditing = ''; mCond = []; $('#mName').value = ''; $('#mKind').value = 'count'; $('#mAgg').value = 'sum'; $('#mCancel').hidden = true; renderMes(); }
