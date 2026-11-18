/* pivot/app-dialogues.js — Interface du tableau croisé (index.html) : Exports, dialogue colonnes / fusion et dispositions enregistrées.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et pivot/README.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- exports ---------- */
function matrix() {
  if (st.o.mode === 'list') { const d = ls.data || listData(st.o, st.L, ls.q); return [d.cols.map(c => c.label)].concat(d.rows.map(r => d.cols.map(c => cellRaw(c, r)))); }
  return st.res && !st.res.empty ? E.flatMatrix(st.res, st.o) : null;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const m = matrix(); if (!m) return;
  download(new Blob([window.PivotExport.toCSV(m)], { type: 'text/csv;charset=utf-8' }), st.o.mode === 'list' ? 'liste-donnees.csv' : 'tableau-croise.csv');
}
function exportXLSX() {
  const m = matrix(); if (!m) return;
  if (st.o.mode === 'list') { window.PivotExport.writeXLSX(m, 'liste-donnees.xlsx', 'Données', XL); return; }
  try {   // classeur mis en forme (styles, formats, mise en forme conditionnelle, volets figés) ; repli : export brut
    download(new Blob([window.PivotXlsx.build(st.res, st.o)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'tableau-croise.xlsx');
  } catch (e) {
    window.PivotExport.writeXLSX(m, 'tableau-croise.xlsx', 'Tableau croisé', XL);
    $('#msg').textContent = 'Export mis en forme impossible (' + e.message + ') : export brut effectué.';
  }
}
async function copyTable() {
  const m = matrix(); if (!m) return;
  try { await navigator.clipboard.writeText(window.PivotExport.toTSV(m)); $('#msg').textContent = 'Tableau copié (collez-le dans Excel).'; }
  catch (e) { $('#msg').textContent = 'Copie impossible : utilisez l’export CSV/XLSX.'; }
}

/* ---------- dialogue colonnes / fusion ---------- */
function openMap() {
  const act = st.sources.filter(s => s.use);
  const names = st.fields.slice(1).map(f => f.label);
  $('#mapBody').innerHTML = `<datalist id="dl">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`
    + act.map(s => `<h4>${esc(s.label)}</h4><table class="map"><thead><tr><th>Inclure</th><th>Colonne d'origine</th><th>Champ unifié (vide = ignorer)</th><th>Exemple</th></tr></thead><tbody>`
      + E.columnsOf(s).map(c => {
        const v = s.id + '|' + c.col, o = st.over[v];
        return `<tr><td><input type="checkbox" data-inc ${o === '' ? '' : 'checked'} aria-label="Inclure ${esc(c.name)}"></td><td>${esc(c.name)}</td><td><input list="dl" data-v="${esc(v)}" data-orig="${esc(c.name)}" value="${esc(o === undefined ? c.name : o)}" ${o === '' ? 'disabled' : ''}></td><td class="meta">${esc(c.sample == null ? '' : String(c.sample).slice(0, 40))}</td></tr>`;
      }).join('') + '</tbody></table>').join('');
  mapSummary();
  $('#dlgMap').showModal();
}
function mapInputs() { return [...document.querySelectorAll('#mapBody input[data-v]')]; }
function mapSummary() {
  const total = activeCount(), by = new Map();
  mapInputs().forEach(i => {
    const t = i.value.trim(); if (!t) return;
    const k = E.normName(t) || t, e = by.get(k) || { label: t, src: new Set() };
    e.src.add(i.dataset.v.split('|')[0]); by.set(k, e);
  });
  $('#mapSum').innerHTML = [...by.values()].map(e => `<span class="chip ${e.src.size < total ? 'warnchip' : ''}">${esc(e.label)} <em>${e.src.size}/${total}</em></span>`).join('');
}
function suggestMerges() {
  const inputs = mapInputs(), total = activeCount();
  const usage = () => {
    const m = new Map();
    inputs.forEach(i => { const t = i.value.trim(); if (!t) return; const k = E.normName(t); const e = m.get(k) || { label: t, src: new Set() }; e.src.add(i.dataset.v.split('|')[0]); m.set(k, e); });
    return m;
  };
  let n = 0;
  inputs.forEach(i => {
    const t = i.value.trim(); if (!t) return;
    const sid = i.dataset.v.split('|')[0], u = usage(), me = u.get(E.normName(t));
    if (!me || me.src.size >= total) return;
    let best = null, score = 0;
    u.forEach(e => {
      if (e === me || e.src.has(sid)) return;
      const sc = E.similarity(t, e.label);
      if (sc > score) { score = sc; best = e; }
    });
    if (best && score >= 0.5) {
      // on garde le libellé le plus long (le plus explicite) pour tout le groupe
      const canon = best.label.length >= t.length ? best.label : t, bk = E.normName(best.label);
      inputs.forEach(j => { if (j === i || E.normName(j.value) === bk) j.value = canon; });
      n++;
    }
  });
  mapSummary();
  $('#msg').textContent = n ? n + ' fusion(s) suggérée(s) — vérifiez puis « Appliquer ».' : 'Aucune fusion évidente trouvée.';
}

/* ---------- dispositions enregistrées (localStorage ; export / import .json) ---------- */
const PL = window.PivotLayouts;
const lyStore = () => { try { return window.localStorage; } catch (e) { return null; } };
const lyMsg = t => { $('#lyMsg').textContent = t; };
function lyRefresh(select) {
  const st0 = lyStore(), names = st0 ? Object.keys(PL.loadAll(st0)).sort((a, b) => a.localeCompare(b, 'fr')) : [];
  $('#lySel').innerHTML = '<option value="">' + (names.length ? '— choisir —' : '— aucune disposition —') + '</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (select && names.includes(select)) $('#lySel').value = select;
}
function lyApplyLayout(lay, label) {
  const r = PL.apply(lay, st.cat.map(c => c.key));
  st.L = r.L; Object.assign(st.o, r.o);
  saveOpts(); applyOptsToControls(); renderZones(); refresh();
  lyMsg(`Disposition « ${label} » appliquée` + (r.missing.length ? ` — ${r.missing.length} champ(s) absent(s) des données actuelles ignoré(s) : ${r.missing.slice(0, 5).map(k => k.replace(/^f:/, '')).join(', ')}.` : '.'));
}
