/* js/app-assistant.js — Interface du tableau croisé (index.html) : Assistant « Projet » et session mémorisée.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- assistant « Projet » (3.3.0) : 1 Sources → 2 Jointures → 3 Champs dérivés et hiérarchies ----------
   * Création ET modification d'un projet. Il héberge la liste des sources (#sources) et lance les éditeurs existants (fusion de colonnes, jointures,
   * champs calculés / groupes / mesures) ; il ajoute la définition des hiérarchies (st.hier, hier.js). ---------- */
const wiz = { step: 1 };
function wzShow(step) {
  wiz.step = step;
  document.querySelectorAll('#wzSteps [data-wz]').forEach(b => { const on = +b.dataset.wz === step; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'step' : 'false'); });
  document.querySelectorAll('#dlgWiz [data-wzp]').forEach(p => { p.hidden = +p.dataset.wzp !== step; });
  $('#wzPrev').hidden = step === 1; $('#wzNext').hidden = step === 3;
  wzRender();
}
function openWizard(step) {
  $('#wzProj').textContent = st.project.name; renderSourcesList();
  if (!$('#dlgWiz').open) $('#dlgWiz').showModal();
  wzShow(step || 1);
}
function wzHierHtml() {
  const lbl = k => (st.byKey.has(k) ? st.byKey.get(k).label : k + ' (absent)'), fl = selFields();
  return st.hier.map((h, i) => `<div class="wz-hc" data-hi="${i}"><input type="text" value="${esc(h.name)}" maxlength="40" data-hname aria-label="Nom de la hiérarchie"> <button type="button" data-hdel title="Supprimer cette hiérarchie">🗑 Supprimer</button>
      <ol>${h.levels.map((k, j) => `<li><span>${j + 1}. ${esc(lbl(k))}</span><button type="button" data-hup${j === 0 ? ' disabled' : ''} aria-label="Monter">↑</button><button type="button" data-hdn${j === h.levels.length - 1 ? ' disabled' : ''} aria-label="Descendre">↓</button><button type="button" data-hrm${h.levels.length <= 2 ? ' disabled title="Une hiérarchie garde au moins 2 niveaux"' : ''} aria-label="Retirer ce niveau">×</button></li>`).join('')}</ol>
      <select data-hadd aria-label="Ajouter un niveau"><option value="">＋ Ajouter un niveau (le plus fin)…</option>${fl.filter(f => !h.levels.includes(f.key)).map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</select></div>`).join('')
    || '<p class="hint">Aucune hiérarchie. « Détecter » reconnaît les niveaux courants (région, province, commune ; année, trimestre, mois…).</p>';
}
function wzRender() {
  if (!$('#dlgWiz').open) return;
  const js = st.sources.filter(s => s.join);
  $('#wzJoins').innerHTML = js.length ? js.map(s => `<div class="src" data-id="${s.id}"><span class="srcname">⨝ ${esc(s.label)}</span><span class="meta">${s.aoa.length - 1 - s.headerRow} lignes</span><button type="button" class="jb" data-act="editjoin" title="Modifier cette jointure">✎ Modifier</button><button class="x" data-act="delsrc" title="Retirer">×</button></div>`).join('')
    : `<p class="hint">${realSources().length < 2 ? 'Ajoutez au moins deux sources (étape 1) pour créer une jointure.' : 'Aucune jointure pour l\'instant.'}</p>`;
  $('#wzCalcN').textContent = st.calcs.length ? '· ' + st.calcs.length : ''; $('#wzGrpN').textContent = st.groups.length ? '· ' + st.groups.length : ''; $('#wzMesN').textContent = st.measures.length ? '· ' + st.measures.length : '';
  $('#wzHier').innerHTML = wzHierHtml();
}
function setHier(list, msg) {   // enregistre les hiérarchies (nettoyées), corrige les filtres devenus incohérents, rafraîchit
  if (wiz.busy) return;   // retirer le champ en cours de saisie déclenche un « change » imbriqué : ignoré
  wiz.busy = true;
  try { st.hier = window.PivotHier.sanitize(list); cascadeAll(); renderFields(); refresh(); wzRender(); $('#wzHierMsg').textContent = msg || ''; } finally { wiz.busy = false; }
}
function onGlobalSel(el) { const s = (st.dash.sel || []).find(x => x.key === el.dataset.gsel); if (!s) return; s.val = el.value; cascadeAll(); refresh(); }
function setGlobalSel(list) { st.dash.sel = window.PivotSession.sanitizeSel(list); cascadeAll(); refresh(); }
function selHtml(v) {
  const l = selList(v).filter(s => st.byKey.has(s.key)); if (!l.length) return '';
  return '<div class="tsel">' + l.map(s => {
    const it = st.byKey.get(s.key), ex = (v.L && v.L.filters && v.L.filters[s.key]) || new Set();
    const g = v.ng ? null : (st.dash.sel || []).find(x => x.key === s.key && x.val !== '' && allOf(x.key).has(x.val)), eff = g ? (s.val === g.val ? s.val : '') : (allOf(s.key).has(s.val) ? s.val : '');
    const opts = selOpts(s, ex, g ? g.val : null, eff, cascadeCtx(v));
    return `<label class="meta">${esc(it.label)} <select data-sel="${esc(s.key)}" data-view="${esc(v.id)}" aria-label="Filtrer par ${esc(it.label)}"><option value="">Toutes</option>${opts}</select></label>`;
  }).join('') + '</div>';
}
function onSelChange(el) {
  const v = st.views.find(x => x.id === el.dataset.view), s = v && selList(v).find(x => x.key === el.dataset.sel); if (!s) return;
  s.val = el.value; cascadeAll();
  if (v === curView()) { refresh(); const again = document.querySelector('#selBar [data-sel="' + el.dataset.sel + '"]'); if (again && el.closest('#selBar')) again.focus(); } else { renderDash(); persistSession(); }
}
function setSelOf(v, list) {
  v.sel = window.PivotSession.sanitizeSel(list); cascadeAll();
  if (v === curView()) refresh(); else { if (st.dash.on) renderDash(); persistSession(); }
}

/* ---------- session mémorisée (IndexedDB) : fichiers + sélections, pour survivre à une actualisation ---------- */
const SSM = window.PivotSession;
const ssMsg = t => { $('#ssMsg').textContent = t; };
const remembering = () => { try { return window.localStorage.getItem('statbel_pivot_remember') !== '0'; } catch (e) { return true; } };
function persistSession() {
  clearTimeout(ssTimer);
  if (!ssReady || !remembering() || !SS.available()) return;
  ssTimer = setTimeout(() => { ssChain = ssChain.then(doPersist).catch(e => ssMsg('Session non mémorisée : ' + (e && e.message ? e.message : 'stockage indisponible') + '.')); }, 700);
}
