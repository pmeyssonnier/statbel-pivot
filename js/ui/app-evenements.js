/* js/ui/app-evenements.js — Interface du tableau croisé (index.html) : Événements (câblage de l'interface).
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- événements ---------- */
function idxOf(el) { return +el.closest('.chip').dataset.i; }
// Réglages de mise en forme : id du contrôle → [clé de st.o, booléen ?]
const OPT_IDS = { optMode: ['mode'], optStyle: ['style'], optDensity: ['density'], optColW: ['colw'], optFreeze: ['freeze', true], optWrap: ['wrap', true], optCf: ['cf'], optCfOp: ['cfOp'], optCap: ['cap'], optCapH: ['capH'], optCapV: ['capV'] };
// Sélecteur de la valeur de classement du Top N : visible seulement s'il y a plusieurs valeurs
function syncTopK() {
  const sel = $('#optTopK'), vv = st.L.vals.filter(v => st.byKey.get(v.key)), vals = vv.map(v => st.byKey.get(v.key));
  sel.hidden = vals.length < 2;
  if (vals.length > 1) { sel.innerHTML = vals.map((it, i) => `<option value="${i}">${esc(vv[i].name || it.label)}</option>`).join(''); sel.value = Math.min(+st.o.topK || 0, vals.length - 1); }
}
function syncCf() { $('#cfRule').hidden = st.o.cf !== 'rule'; }
function applyOptsToControls() {
  Object.keys(OPT_IDS).forEach(id => { const [key, bool] = OPT_IDS[id], el = $('#' + id); if (bool) el.checked = !!st.o[key]; else el.value = st.o[key]; });
  $('#optTopN').value = st.o.topN || 0; $('#optTopMode').value = st.o.topMode; $('#optTopOthers').checked = st.o.topOthers !== false; syncTopK();
  $('#optCfVal').value = st.o.cfVal; $('#optDec').value = st.o.dec; $('#optRowTot').checked = !!st.o.rowTot; $('#optColTot').checked = !!st.o.colTot; $('#optSub').checked = !!st.o.subTot;
  $('#optCf').innerHTML = Object.keys(PF.CF_MODES).map(m => `<option value="${m}">${esc(PF.CF_MODES[m])}</option>`).join('');
  $('#optCf').value = st.o.cf;
  syncCf();
}
