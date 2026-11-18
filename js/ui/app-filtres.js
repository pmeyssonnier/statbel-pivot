/* js/ui/app-filtres.js — Interface du tableau croisé (index.html) : Barre de filtres en pastilles et dialogue de filtre.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';

/* ---------- barre de filtres en pastilles : filtres TOUT (globaux, toutes les vues) et VUE (cette vue seulement) ----------
   * Une pastille = un champ + sa liste déroulante (« Toutes » ou une valeur) + × ; « + Filtre ▾ » ajoute un champ, avec sa portée (vue / global).
   * Les filtres fixes de la vue (valeurs exclues, texte, plage, top) restent dans la zone « Filtres » de la configuration. ---------- */
let fscope = 'view';   // portée choisie dans « + Filtre ▾ » d'une vue ouverte ; au tableau de bord : toujours global
function fbarHtml(ctx, v) {   // ctx : 'dash' (globaux) | 'view' (globaux + vue ouverte)
  const g = (st.dash.sel || []).filter(s => st.byKey.has(s.key)), vs = ctx === 'view' ? selList(v).filter(s => st.byKey.has(s.key)) : [];
  const chip = (kind, label, sel, rm, off) => `<span class="fchip${off ? ' off' : ''}"${off ? ' title="Cette vue ignore les filtres globaux (bouton 🌐 de sa tuile)"' : ''}><span class="scope${kind === 'v' ? ' v' : ''}">${kind === 'g' ? 'Tout' : 'Vue'}</span><label>${esc(label)} ${sel}</label><button type="button" class="fx" ${rm} aria-label="Retirer le filtre ${esc(label)}" title="${kind === 'g' ? 'Retirer ce filtre pour toutes les vues' : 'Retirer ce filtre'}">×</button></span>`;
  const gh = g.map(s => { const lb = st.byKey.get(s.key).label, eff = allOf(s.key).has(s.val) ? s.val : '';
    return chip('g', lb, `<select data-gsel="${esc(s.key)}" aria-label="Filtrer toutes les vues par ${esc(lb)}"><option value="">Toutes</option>${selOpts(s, new Set(), null, eff, cascadeCtx(ctx === 'view' ? v : null))}</select>`, `data-gx="${esc(s.key)}"`, ctx === 'view' && v.ng); }).join('');
  const vh = vs.map(s => { const lb = st.byKey.get(s.key).label, ex = (v.L && v.L.filters && v.L.filters[s.key]) || new Set();
    const gl = v.ng ? null : (st.dash.sel || []).find(x => x.key === s.key && x.val !== '' && allOf(x.key).has(x.val)), eff = gl ? (s.val === gl.val ? s.val : '') : (allOf(s.key).has(s.val) ? s.val : '');
    return chip('v', lb, `<select data-sel="${esc(s.key)}" data-view="${esc(v.id)}" aria-label="Filtrer cette vue par ${esc(lb)}"><option value="">Toutes</option>${selOpts(s, ex, gl ? gl.val : null, eff, cascadeCtx(v))}</select>`, `data-vx="${esc(s.key)}"`, false); }).join('');
  return `<span class="meta">${ctx === 'dash' ? 'Filtres globaux' : 'Filtres'}</span>${gh}${vh}<button type="button" class="fadd" aria-haspopup="menu" aria-expanded="false" title="Ajouter un filtre : une liste déroulante sur un champ (région, province…)">+ Filtre ▾</button><div class="menu fmenu" role="menu" hidden></div>`;
}
function fillFMenu(bar) {
  const ctx = bar.dataset.ctx, scope = ctx === 'dash' ? 'global' : fscope, list = scope === 'global' ? (st.dash.sel || []) : selList(curView()), used = new Set(list.map(s => s.key));
  const free = selFields().filter(f => !used.has(f.key));
  bar.querySelector('.fmenu').innerHTML = '<b class="mh">Ajouter un filtre sur…</b>'
    + (list.length >= 5 ? '<span class="hint mh">Maximum atteint (5 filtres dans cette portée).</span>' : free.length ? '<div class="fl">' + free.map(f => `<button type="button" role="menuitem" data-fadd="${esc(f.key)}">${esc(f.label)}</button>`).join('') + '</div>' : '<span class="hint mh">Tous les champs sont déjà utilisés.</span>')
    + (ctx === 'view' ? `<hr><b class="mh">Portée</b><button type="button" role="menuitemradio" class="fsc${scope === 'view' ? ' on' : ''}" aria-checked="${scope === 'view'}" data-fscope="view">Cette vue seulement</button><button type="button" role="menuitemradio" class="fsc${scope === 'global' ? ' on' : ''}" aria-checked="${scope === 'global'}" data-fscope="global">Tous les graphiques (global)</button>` : '');
}
function renderSelBar() {   // vue ouverte : barre de pastilles au-dessus du graphique
  const v = curView(), box = $('#selBar');
  box.hidden = !st.rows.length; if (box.hidden) return;
  box.innerHTML = fbarHtml('view', v);
}
// Édition d'un graphique de tuile en fenêtre : aperçu immédiat ; la vue n'est modifiée qu'à « Enregistrer » (setChartOf)
function openTileEditor(v, trigger) {
  let res = null; try { res = viewResult(v); } catch (e) { res = null; }
  if (!res || res.empty || !res.rows.length) return;
  const cs = getComputedStyle(document.documentElement);
  const th = { bg: cs.getPropertyValue('--panel').trim() || '#fff', ink: cs.getPropertyValue('--ink').trim() || '#1b2733', muted: cs.getPropertyValue('--muted').trim() || '#5a6b7b', line: cs.getPropertyValue('--line').trim() || '#d9e1e8' };
  let ctl = null; const pv = new Map();   // pv : calculs d'aperçu par champ de graphique
  const build = c => {
    if (c.type === 'map') ensureGeo(() => { if (ctl) ctl.refresh(); });
    const ck = dimOf(c) + '|' + c.o.cdim2; if (!pv.has(ck)) pv.set(ck, chartRes(v, c, res));
    const cr = pv.get(ck), r = !cr || cr.empty || !cr.rows.length ? { svg: '', note: 'Rien à afficher avec ces réglages.' } : PC.build(cr, { type: c.type, k: c.k, k2: c.k2, gmax: c.gmax, o: c.o, geo: geoFor(), fmt: (x, sp) => PF.formatValue(x, sp, v.o.dec), theme: th, width: 560, plotH: 260 });
    return r.pending ? { svg: '', note: geoFailed ? 'Fonds de carte indisponibles.' : r.note } : r;
  };
  ctl = window.PivotChartEditor.open({ name: v.name, config: chartOf(v), specs: res.specs, build, trigger, fields: selFields(), cubeLabel: cubeLabel(), sel: selList(v), onSave: (cfg, sel) => { setChartOf(v, cfg); if (JSON.stringify(sel) !== JSON.stringify(selList(v))) setSelOf(v, sel); } });
}
const dashMeasured = new Map();   // largeur réelle du contenu des tuiles (mesurée après mise en page)
let measuring = false;
function renderDash() {
  const box = $('#dash');
  captureView();
  const auto = window.innerWidth <= 900 ? 1 : window.innerWidth >= 1500 ? 3 : window.innerWidth >= 1000 ? 2 : 1;
  const cols = window.innerWidth <= 900 ? 1 : (st.dash.cols || auto);
  box.style.setProperty('--dc', cols);
  const hid = st.views.filter(v => v.tile === 'hide');
  let h = `<div class="dash-bar"><label class="meta">Colonnes <select id="dashCols" aria-label="Nombre de colonnes du tableau de bord"><option value="0"${st.dash.cols === 0 ? ' selected' : ''}>Auto</option>${[1, 2, 3].map(n => `<option value="${n}"${st.dash.cols === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
    + `<button type="button" id="dashFocus" class="desk" title="Masquer le panneau de gauche pour agrandir le tableau de bord (touche F)">${focusOn() ? '⮌ Réduire' : '⛶ Agrandir'}</button>`
    + `<button type="button" id="dashPrint" title="Imprimer ou enregistrer en PDF (boîte d'impression du navigateur)">🖨 Imprimer / PDF</button>`
    + (hid.length ? `<span class="meta">Masquées :</span>${hid.map(v => `<button type="button" class="chipbtn" data-tact="show" data-view="${v.id}" title="Réafficher">+ ${esc(v.name)}</button>`).join('')}` : '') + '</div><div class="dash-bar fbar" data-ctx="dash">' + fbarHtml('dash') + '</div>';
  if (!st.rows.length) { box.innerHTML = h + '<p class="hint big" style="grid-column:1/-1">Ajoutez un ou plusieurs fichiers Excel pour commencer.</p>'; return; }
  const cs = getComputedStyle(document.documentElement);
  const dark = { bg: cs.getPropertyValue('--panel').trim() || '#fff', ink: cs.getPropertyValue('--ink').trim() || '#1b2733', muted: cs.getPropertyValue('--muted').trim() || '#5a6b7b', line: cs.getPropertyValue('--line').trim() || '#d9e1e8' };
  const th = printing ? LIGHT : dark;
  const colW = (box.clientWidth - 12 * (cols - 1)) / cols;
  const shown = st.views.filter(v => v.tile !== 'hide');
  shown.forEach(v => {
    const tileW = printing ? 700 : dashMeasured.get(v.id + '|' + cols + '|' + (v.span || 1)) || Math.max(300, Math.round(colW * Math.min(v.span || 1, cols) + 12 * (Math.min(v.span || 1, cols) - 1) - 20));
    let res = null, body = '', kind = 'table';
    try { res = viewResult(v); } catch (e) { res = null; }
    if (v.o && v.o.mode === 'list' && (!res || res.empty || tileKind(v, res) === 'table')) { kind = 'list'; try { body = listHtml(listData(v.o, v.L, v === curView() ? ls.q : ''), v.o, 0, 200, false); } catch (e) { body = '<p class="hint">Liste indisponible.</p>'; } }
    else if (!res || res.empty || !res.rows.length) { const sa = selActive(v), nm = (x, w) => esc(st.byKey.get(x.key).label + ' = ' + x.val) + ' (' + w + ')'; body = sa.all.length ? '<p class="hint">Aucune ligne ne correspond aux sélecteurs actifs — ' + sa.globals.map(x => nm(x, 'tableau de bord')).concat(sa.locals.map(x => nm(x, 'cette tuile'))).join(' ; ') + ' — combinés aux filtres de la vue.</p>' : '<p class="hint">Rien à afficher (aucune valeur dans cette vue).</p>'; }
    else {
      kind = tileKind(v, res);
      if (kind === 'chart') {
        const c = chartOf(v), fh = TILE_H[v.h] || TILE_H[2];
        if (c.type === 'map') ensureGeo(() => { if (st.dash.on) renderDash(); });
        const cres = chartRes(v, c, res), r = !cres || cres.empty || !cres.rows.length ? { svg: '', note: '' } : PC.build(cres, { type: c.type, k: c.k, k2: c.k2, gmax: c.gmax, o: c.o, geo: geoFor(), fmt: (x, sp) => PF.formatValue(x, sp, v.o.dec), theme: th, width: tileW, minW: 300, fitH: printing ? Math.round(fh * 0.8) : Math.round(fh) - 6 });
        if (r.svg) body = r.svg + (r.note ? `<p class="hint">${esc(r.note)}</p>` : ''); else if (r.pending) body = `<p class="hint">${esc(geoFailed ? 'Fonds de carte indisponibles.' : r.note)}</p>`; else kind = 'table';
      }
      if (kind === 'table') body = tableHtml(res, v.o, v.L, new Set(), 200).html;
    }
    const span = Math.min(v.span || 1, cols), hh = TILE_H[v.h] || TILE_H[2];
    h += `<section class="tile${v === curView() ? ' cur' : ''}" data-view="${v.id}" style="grid-column:span ${span}"><div class="th" draggable="true" title="Glisser pour déplacer cette tuile"><span class="grip" aria-hidden="true">⠿</span><b data-tact="edit" title="Ouvrir « ${esc(v.name)} »">${esc(v.name)}</b>`
      + `<span class="tbtns"><button type="button" data-tact="wide" title="Largeur de la tuile : 1, 2 ou 3 colonnes (actuellement ${span})">↔ ${span}</button><button type="button" data-tact="tall" title="Hauteur de la tuile : petite, moyenne ou grande">↕ ${v.h || 2}</button>${(st.dash.sel || []).some(s => st.byKey.has(s.key)) ? `<button type="button" data-tact="glob" aria-pressed="${v.ng ? 'true' : 'false'}" title="${v.ng ? 'Cette tuile IGNORE les filtres globaux (cliquer pour les appliquer)' : 'Cette tuile suit les filtres globaux (cliquer pour les ignorer)'}">${v.ng ? '⊘' : '🌐'}</button>` : ''}<button type="button" data-tact="mode" title="${kind === 'chart' ? 'Transformer cette tuile en tableau (mêmes lignes, colonnes et valeurs)' : 'Transformer cette tuile en graphique (mêmes lignes, colonnes et valeurs)'}">${kind === 'chart' ? '⇄ ▦' : '⇄ ◔'}</button>${kind === 'chart' ? '<button type="button" data-tact="chart" title="Modifier le graphique de cette tuile (aperçu, enregistrer / annuler) sans quitter le tableau de bord">⚙ Graphique</button>' : kind === 'table' ? '<button type="button" data-tact="tbl" title="Options du tableau de cette tuile : totaux, décimales, Top N, mise en forme (ouvre la tuile avec son panneau ⚙ Tableau)">⚙ Tableau</button>' : ''}<button type="button" data-tact="edit" title="Ouvrir cette vue (champs, filtres, graphique) ; ← Tableau de bord pour revenir">✎ Ouvrir</button>`
      + (shown.length > 1 ? '<button type="button" data-tact="hide" title="Masquer cette tuile">×</button>' : '') + `</span></div>${selHtml(v)}<div class="tbody" style="max-height:${hh}px">${body}</div></section>`;
  });
  if (st.views.length < MAX_VIEWS) h += '<button type="button" class="newtile" data-tact="newview" title="Nouvelle tuile vide (mêmes données du projet)">＋ Nouvelle tuile</button>';
  box.innerHTML = h;
  { let redo = false;   // largeur réelle ≠ largeur utilisée : un seul rendu de plus, avec la largeur mesurée
    box.querySelectorAll('.tile').forEach(t => { const v = st.views.find(x => x.id === t.dataset.view), bd = t.querySelector('.tbody'); if (!v || !bd) return; const k = v.id + '|' + cols + '|' + (v.span || 1), real = Math.floor(bd.clientWidth); if (!printing && real > 100 && Math.abs(real - (dashMeasured.get(k) || 0)) > 3 && !measuring) { dashMeasured.set(k, real); redo = true; } });
    if (redo) { measuring = true; try { renderDash(); } finally { measuring = false; } return; } }
}
// Panneau flottant « Configurer » (panneau de gauche masqué en tableau de bord / mode agrandi) : fermé en changeant de mode
function closePops() { document.body.classList.remove('cfg-open'); const b = document.getElementById('btnCfgPc'); if (b) b.setAttribute('aria-expanded', 'false'); }
function setDash(on) {
  st.dash.on = !!on; closePops();
  document.body.classList.toggle('d-dash', st.dash.on);
  if (st.dash.on && window.innerWidth <= 900) setMode('table');
  if (st.dash.on) { if (panelOpen()) setPanel(false); if (tpanelOpen()) setTPanel(false); }
  renderViews();
  if (st.dash.on) renderDash(); else renderTable();
  persistSession();
}
// Déplacer les tuiles par glisser-déposer : l'ordre des tuiles est l'ordre des vues (onglets)
let dragTile = null;
const cols_ = () => (window.innerWidth <= 900 ? 1 : (st.dash.cols || (window.innerWidth >= 1500 ? 3 : window.innerWidth >= 1000 ? 2 : 1)));

/* ---------- dialogue de filtre ---------- */
let filtKey = null, filtVals = [];
function openFilter(key) {
  const item = st.byKey.get(key); if (!item) return;
  filtKey = key;
  const set = new Set();
  for (const r of st.rows) set.add(item.dim(r));
  filtVals = [...set].sort((a, b) => (a === E.EMPTY ? 1 : b === E.EMPTY ? -1 : a.localeCompare(b, 'fr', { numeric: true })));
  $('#fTitle').textContent = 'Filtre : ' + item.label + ' (' + filtVals.length + ' valeurs)';
  $('#fSearch').value = '';
  drawFilter();
  loadRuleInputs(item);
  $('#dlgFilter').showModal();
}
// Règles (texte, plage, top / flop) du filtre ouvert : remplissage des champs puis lecture à la validation
function loadRuleInputs(item) {
  const r = (st.L.rules || {})[filtKey] || {};
  $('#frtOp').value = r.text ? r.text.op : 'contains'; $('#frtQ').value = r.text ? r.text.q : '';
  const isNum = item.type === 'number', isDate = item.type === 'date';
  $('#frRange').hidden = !(isNum || isDate);
  $('#frrMin').type = $('#frrMax').type = isDate ? 'date' : 'number';
  $('#frrMin').step = $('#frrMax').step = 'any';
  $('#frrMin').value = r.range && r.range.min !== undefined ? r.range.min : ''; $('#frrMax').value = r.range && r.range.max !== undefined ? r.range.max : '';
  const nums = window.PivotCalc.baseNumeric(st.cat);
  $('#frtBy').innerHTML = nums.map(c => { const k = c.key, l = k === '__rows' ? 'Nombre de lignes' : c.label; return `<option value="${esc(k)}">${esc(l)}</option>`; }).join('');
  const t = r.top || {};
  $('#frtMode').value = t.mode || 'top'; $('#frtN').value = t.n || ''; $('#frtAgg').value = t.agg || 'sum';
  $('#frtBy').value = t.by && st.byKey.has(t.by) ? t.by : (st.L.vals[0] && nums.some(c => c.key === st.L.vals[0].key) ? st.L.vals[0].key : '__rows');
  $('#fRules').open = !!(r.text || r.range || r.top);
}
function saveRuleInputs() {
  const item = st.byKey.get(filtKey); if (!item) return;
  const r = {}, q = $('#frtQ').value.trim();
  if (q) r.text = { op: $('#frtOp').value, q };
  if (!$('#frRange').hidden) {
    const num = v => { const x = parseFloat(String(v).replace(',', '.')); return String(v).trim() !== '' && isFinite(x) ? x : undefined; };
    const a = item.type === 'date' ? ($('#frrMin').value || undefined) : num($('#frrMin').value), b = item.type === 'date' ? ($('#frrMax').value || undefined) : num($('#frrMax').value);
    if (a !== undefined || b !== undefined) r.range = { min: a, max: b };
  }
  const n = parseInt($('#frtN').value, 10);
  if (n >= 1) r.top = { n, mode: $('#frtMode').value, by: $('#frtBy').value, agg: $('#frtAgg').value };
  const c = window.PivotLayouts.cleanRules({ [filtKey]: r })[filtKey];
  st.L.rules = st.L.rules || {};
  if (c) st.L.rules[filtKey] = c; else delete st.L.rules[filtKey];
}
function drawFilter() {
  const q = E.normName($('#fSearch').value), ex = st.L.filters[filtKey];
  const matches = filtVals.filter(v => !q || E.normName(v).includes(q));
  const list = matches.slice(0, 1000);
  $('#fList').innerHTML = list.map(v => `<label><input type="checkbox" value="${esc(v)}" ${ex.has(v) ? '' : 'checked'}> ${esc(v)}</label>`).join('')
    + (matches.length > 1000 ? `<p class="hint">${matches.length} résultats, 1000 affichés. Les boutons Tout cocher / Tout décocher agissent sur tous les résultats de la recherche.</p>` : '');
}
