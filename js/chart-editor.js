/* Éditeur de graphique : UNE définition des contrôles d'options (DEFS, clés de PivotChart.normOpts) servant à deux endroits :
 *  - le panneau « Options du graphique » du Pivot (html / fill / read / refreshVisibility) ;
 *  - la fenêtre d'édition d'une tuile du tableau de bord (open : aperçu immédiat, Enregistrer / Annuler).
 * L'affichage suit le registre des capacités (PivotChartCaps) ; rien n'est appliqué à la vue avant « Enregistrer » dans la fenêtre.
 * Navigateur uniquement (<dialog> natif : focus et Échap gérés). */
(function (root) {
  'use strict';
  const PC = root.PivotChart, CP = PC.caps;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = (key, label, opts, title) => ({ key, label, kind: 'sel', opts, title });
  const F = (key, label, empty, title) => ({ key, label, kind: 'field', empty, title });   // choix d'un champ du catalogue (liste fournie par setFields)
  let FIELDS = [], CUBE = '';   // CUBE : libellé du champ du graphique par défaut du cube (vide = pas de cube)
  const N = (key, label, o) => Object.assign({ key, label, kind: 'num' }, o);
  // Définition des contrôles d'options ; l'ordre est l'ordre d'affichage
  const DEFS = [
    F('cdim', 'Champ du graphique', 'Comme le tableau', 'Catégories du graphique : un seul champ (ex. Commune) — les autres champs ne servent plus qu\'à filtrer. « Comme le tableau » = lignes du tableau croisé'),
    F('cdim2', 'Séries (facultatif)', 'Aucune', 'Second champ : une série par valeur (ex. Année)'),
    S('lab', 'Étiquettes', [['none', 'Aucune'], ['value', 'Valeur'], ['pct', 'Pourcentage'], ['both', 'Valeur + %']], 'Afficher la valeur, le pourcentage ou les deux derrière chaque libellé / sur chaque élément'),
    S('lpos', 'Position des étiquettes', [['auto', 'Auto'], ['in', 'Dans la barre'], ['out', 'À côté (au bout)'], ['top', 'Au-dessus']], 'Position des étiquettes : au bout de la barre (auto), dans la barre, à côté ou au-dessus'),
    S('leg', 'Légende', [['auto', 'Auto'], ['bottom', 'En bas'], ['top', 'En haut'], ['right', 'À droite'], ['none', 'Masquée']]),
    S('pal', 'Palette', Object.keys(PC.PALETTES).map(k => [k, PC.PALETTES[k]])),
    S('ord', 'Ordre', [['none', 'Du tableau'], ['desc', 'Décroissant'], ['asc', 'Croissant']], 'Trier les catégories par valeur'),
    { key: 'title', label: 'Titre', kind: 'text' },
    S('talign', 'Titre : alignement', [['left', 'À gauche'], ['center', 'Au centre'], ['right', 'À droite']], 'Alignement horizontal du titre'),
    S('tvert', 'Titre : place', [['top', 'En haut'], ['bottom', 'En bas'], ['hidden', 'Masqué']], 'Place du titre'),
    N('bar', 'Épaisseur des barres (%)', { min: 10, max: 100, step: 5, ph: 'auto', title: 'Épaisseur des barres en % de la place disponible (10 à 100 ; vide = automatique)' }),
    N('zoom', 'Zoom secteurs / anneau (%)', { min: 50, max: 200, step: 10, ph: '100', title: 'Taille du disque en % (50 à 200)' }),
    N('hole', 'Trou de l\'anneau (%)', { min: 30, max: 85, step: 5, ph: '58', title: 'Diamètre du trou en % du disque (30 à 85)' }),
    N('ymin', 'Axe min', { ph: 'auto', any: true }), N('ymax', 'Axe max', { ph: 'auto', any: true }), N('step', 'Graduation', { ph: 'auto', any: true }),
    S('scale', 'Échelle', [['linear', 'Linéaire'], ['log', 'Logarithmique (courbe / axe droit combiné)']]),
    N('y2min', 'Axe droit min', { ph: 'auto', any: true }), N('y2max', 'Axe droit max', { ph: 'auto', any: true }), N('y2step', 'Graduation droite', { ph: 'auto', any: true }),
    N('ref', 'Repère', { ph: 'aucun', any: true, title: 'Ligne de référence (objectif, moyenne…)' }),
    { key: 'grid', label: 'Quadrillage', kind: 'chk' },
    S('trend', 'Tendance', [['auto', 'Auto'], ['linear', 'Linéaire'], ['none', 'Aucune'], ['poly2', 'Polynôme degré 2'], ['poly3', 'Polynôme degré 3'], ['ma', 'Moyenne mobile']]),
    N('trendWindow', 'Fenêtre moyenne mobile', { min: 2, max: 100, ph: '3' }),
    { key: 'trendEquation', label: 'Afficher l\'équation', kind: 'chk' },
    { key: 'smooth', label: 'Courbes lissées', kind: 'chk' },
    S('kpi', 'Indicateurs', [['val', 'Une carte par valeur'], ['col', 'Une carte par colonne']], 'Cartes KPI : une par valeur, ou une par colonne du tableau')
  ];
  // Identifiants historiques du panneau du Pivot (conservés : tests, habitudes) ; la fenêtre utilise « ce_<clé> »
  const PANEL_ID = { cdim: 'coCdim', cdim2: 'coCdim2', lab: 'coLab', lpos: 'coPos', leg: 'coLeg', pal: 'coPal', ord: 'coOrd', title: 'coTitle', talign: 'coTAl', tvert: 'coTVe', bar: 'coBar', zoom: 'coZoom', hole: 'coHole', ymin: 'coMin', ymax: 'coMax', step: 'coStep', scale: 'coScale', y2min: 'coMin2', y2max: 'coMax2', y2step: 'coStep2', ref: 'coRef', grid: 'coGrid', trend: 'coTrend', trendWindow: 'coTrendWindow', trendEquation: 'coTrendEq', smooth: 'coSmooth', kpi: 'coKpi' };
  const CHART_TYPES = Object.keys(PC.TYPES).filter(t => t !== 'none');
  const TWO_VALUES = ['scatter', 'combo', 'pyramid'];
  const STRING_NUMS = ['bar', 'zoom', 'hole', 'trendWindow'];   // champs numériques relus tels quels (normOpts les borne, vide = défaut)
  const numOf = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
  const byKey = {}; DEFS.forEach(d => { byKey[d.key] = d; });

  // Valeur affichée dans un champ numérique pour une valeur d'option (défauts affichés vides : « auto », « 100 », « 58 »)
  const shown = (key, v) => (key === 'zoom' ? (v === 100 ? '' : v) : key === 'hole' ? (v === 58 ? '' : v) : key === 'bar' ? (v || '') : (v == null ? '' : v));
  // Liste d'un contrôle « champ » : choix vide + champs du catalogue ; une valeur absente du catalogue reste visible (jamais écrasée en silence)
  const fieldOpts = (d, v) => { const l = (d.key === 'cdim' && CUBE ? [['', 'Défaut du cube : ' + CUBE], ['-', 'Comme le tableau']] : [['', d.empty]]).concat(FIELDS.map(f => [f.key, f.label])); if (v && !l.some(p => p[0] === v)) l.push([v, v]); return l.map(p => `<option value="${esc(p[0])}"${p[0] === (v || '') ? ' selected' : ''}>${esc(p[1])}</option>`).join(''); };
  function ctl(d, o, idOf) {
    const id = idOf(d.key), v = o[d.key], tt = d.title ? ` title="${esc(d.title)}"` : '';
    if (d.kind === 'field') return `<label class="meta" data-opt="${d.key}"${tt}>${esc(d.label)} <select id="${id}" data-opt="${d.key}">${fieldOpts(d, v)}</select></label>`;
    if (d.kind === 'sel') return `<label class="meta" data-opt="${d.key}"${tt}>${esc(d.label)} <select id="${id}" data-opt="${d.key}">${d.opts.map(p => `<option value="${esc(p[0])}"${p[0] === v ? ' selected' : ''}>${esc(p[1])}</option>`).join('')}</select></label>`;
    if (d.kind === 'text') return `<label class="meta" data-opt="${d.key}"${tt}>${esc(d.label)} <input type="text" id="${id}" data-opt="${d.key}" maxlength="120" placeholder="automatique" value="${esc(v || '')}" style="width:12em"></label>`;
    if (d.kind === 'chk') return `<label class="meta chk" data-opt="${d.key}"${tt}><input type="checkbox" id="${id}" data-opt="${d.key}"${v ? ' checked' : ''}> ${esc(d.label)}</label>`;
    return `<label class="meta" data-opt="${d.key}"${tt}>${esc(d.label)} <input type="number" id="${id}" data-opt="${d.key}"${d.any ? ' step="any"' : ` step="${d.step || 1}"`}${d.min != null ? ` min="${d.min}"` : ''}${d.max != null ? ` max="${d.max}"` : ''} placeholder="${esc(d.ph || '')}" value="${esc(shown(d.key, v))}" style="width:6em"></label>`;
  }
  // Sections repliables (l'ordre des DEFS fixe l'ordre dans chaque section) ; une section sans réglage utile au type n'est pas affichée
  const SEC_OF = { cdim: 'Données', cdim2: 'Données', ord: 'Données', kpi: 'Données', lab: 'Affichage', lpos: 'Affichage', leg: 'Affichage', pal: 'Affichage', title: 'Affichage', talign: 'Affichage', tvert: 'Affichage', bar: 'Affichage', zoom: 'Affichage', hole: 'Affichage',
    ymin: 'Axes', ymax: 'Axes', step: 'Axes', scale: 'Axes', y2min: 'Axes', y2max: 'Axes', y2step: 'Axes', ref: 'Axes', grid: 'Axes', trend: 'Tendance', trendWindow: 'Tendance', trendEquation: 'Tendance', smooth: 'Tendance' };
  const SECS = ['Données', 'Affichage', 'Axes', 'Tendance'];
  const OPEN = { Données: true, Affichage: root.innerWidth > 900, Axes: false, Tendance: false };   // état partagé (panneau du Pivot et fenêtre de tuile)
  const html = (o, idOf) => SECS.map(sec => `<details class="sec" data-sec="${sec}"${OPEN[sec] ? ' open' : ''}><summary>${sec}<span class="tag n"></span></summary>${DEFS.filter(d => (SEC_OF[d.key] || 'Affichage') === sec).map(d => ctl(d, o, idOf || (k => PANEL_ID[k]))).join('')}</details>`).join('');
  // Remplit des contrôles déjà générés depuis des options (normalisées)
  function fill(box, o) {
    DEFS.forEach(d => { const el = box.querySelector('[data-opt="' + d.key + '"]:not(label)'); if (!el) return; if (d.kind === 'field') el.innerHTML = fieldOpts(d, o[d.key]); else if (d.kind === 'chk') el.checked = !!o[d.key]; else el.value = d.kind === 'num' ? shown(d.key, o[d.key]) : (o[d.key] == null ? '' : o[d.key]); });
  }
  // Valeur d'option saisie dans un contrôle
  const valueOf = (d, el) => (d.kind === 'chk' ? el.checked : d.kind === 'num' ? (STRING_NUMS.indexOf(d.key) >= 0 ? el.value : numOf(el.value)) : el.value);
  // Relit toutes les options des contrôles (y compris masqués : leurs réglages sont conservés) ; à normaliser avec PC.normOpts
  function read(box) {
    const o = {}; DEFS.forEach(d => { const el = box.querySelector('[data-opt="' + d.key + '"]:not(label)'); if (el) o[d.key] = valueOf(d, el); }); return o;
  }
  // Affiche seulement les options utiles à ce type et à ces réglages ; renvoie le nombre d'options non applicables au type
  function refreshVisibility(box, type, o) {
    let hid = 0;
    if (!box._tg) { box._tg = true; box.addEventListener('toggle', ev => { const d = ev.target; if (d && d.classList && d.classList.contains('sec')) OPEN[d.dataset.sec] = d.open; }, true); }
    box.querySelectorAll('label[data-opt]').forEach(l => { const k = l.dataset.opt, vis = k === 'cdim2' ? CP.visible(type, 'cdim', o) && (o.cdim ? o.cdim !== '-' : !!CUBE) : CP.visible(type, k, o); l.style.display = vis ? '' : 'none'; if (!CP.supports(type, k) && !CP.isData(k)) hid++; });
    box.querySelectorAll('details.sec').forEach(d => { const n = [...d.querySelectorAll('label[data-opt]')].filter(l => l.style.display !== 'none').length; d.hidden = n === 0; const t = d.querySelector('.tag.n'); if (t) t.textContent = n + ' réglage' + (n > 1 ? 's' : ''); });
    return hid;
  }
  const hiddenNote = hid => (hid ? hid + ' réglage(s) non applicable(s) à ce type de graphique sont masqués (ils sont conservés si vous changez de type).' : '');

  // Boîte de configuration des sélecteurs : o = { fields:[{key,label}], sel:[{key,val}], max, onChange(liste) } ; se redessine à chaque appel
  function selectorsBox(box, o) {
    const sel = o.sel || [], used = new Set(sel.map(s => s.key)), free = (o.fields || []).filter(f => !used.has(f.key)), nameOf = k => { const f = (o.fields || []).find(x => x.key === k); return f ? f.label : k; };
    box.innerHTML = `<span class="meta" title="${esc(o.hint || 'Liste déroulante au-dessus du graphique pour le filtrer sur un champ (région, province…)')}">${esc(o.label || 'Sélecteurs')}</span> `
      + sel.map((s, i) => `<span class="chipbtn" data-i="${i}">${esc(nameOf(s.key))} <button type="button" data-rm="${i}" aria-label="Retirer le sélecteur ${esc(nameOf(s.key))}">×</button></span>`).join(' ')
      + (sel.length < (o.max || 5) && free.length ? ` <select data-add aria-label="Ajouter un sélecteur"><option value="">+ Ajouter…</option>${free.map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</select>` : '');
    box.onchange = ev => { const k = ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-add') ? ev.target.value : ''; if (k) o.onChange(sel.concat([{ key: k, val: '' }])); };
    box.onclick = ev => { const b = ev.target.closest && ev.target.closest('[data-rm]'); if (b) o.onChange(sel.filter((_, i) => i !== +b.dataset.rm)); };
  }

  // opts : { name, config (PC.normChart), specs, build(cfg) → { svg, note, pending? }, onSave(cfg, sel), trigger, fields?, sel? }
  // Renvoie { refresh, close, dialog } ; le <dialog> est retiré du DOM à la fermeture.
  function open(opts) {
    if (opts.fields) { FIELDS = opts.fields; CUBE = opts.cubeLabel || ''; }
    const dlg = document.createElement('dialog');
    dlg.className = 'ce'; dlg.setAttribute('aria-label', 'Modifier le graphique : ' + opts.name);
    const initial = PC.normChart(opts.config), K = (opts.specs || []).length;
    let cur = PC.normChart(initial);
    dlg.innerHTML = `<h3 style="margin-top:0">Modifier le graphique — ${esc(opts.name)}</h3>
      <div class="ce-grid"><div class="ce-form">
        <label class="meta">Type <select id="ce_type" data-f="type">${CHART_TYPES.map(t => `<option value="${t}"${t === cur.type ? ' selected' : ''}>${esc(PC.TYPES[t])}</option>`).join('')}</select></label>
        <label class="meta" id="ce_kL">Valeur <select id="ce_k" data-f="k">${(opts.specs || []).map((s, i) => `<option value="${i}"${i === cur.k ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        <label class="meta" id="ce_k2L">2e valeur <select id="ce_k2" data-f="k2">${(opts.specs || []).map((s, i) => `<option value="${i}"${i === (cur.k2 >= 0 ? cur.k2 : (cur.k + 1) % Math.max(K, 1)) ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        <label class="meta" id="ce_gL">Max des jauges <input type="number" id="ce_g" data-f="gmax" step="any" min="0" placeholder="auto" value="${cur.gmax || ''}" style="width:7em"></label>
        <div id="ce_opts" class="ce-opts">${html(cur.o, k => 'ce_' + k)}</div>
        <p class="hint" id="ce_hid" hidden></p>
        <div id="ce_sel" class="ce-sel"${opts.fields ? '' : ' hidden'}></div>
      </div><div class="ce-prev"><div id="ce_svg" aria-live="polite"></div><p class="hint" id="ce_note"></p></div></div>
      <div class="row"><button type="button" id="ce_cancel">Annuler</button><button type="button" class="pri" id="ce_save">Enregistrer</button></div>`;
    document.body.appendChild(dlg);
    const $ = s => dlg.querySelector(s), box = $('#ce_opts');
    let selDraft = (opts.sel || []).map(s => ({ key: s.key, val: s.val })); const selInit = JSON.stringify(selDraft);
    const drawSel = () => { if (opts.fields) selectorsBox($('#ce_sel'), { fields: opts.fields, sel: selDraft, onChange: l => { selDraft = l; drawSel(); } }); };
    const dirty = () => JSON.stringify(cur) !== JSON.stringify(initial) || JSON.stringify(selDraft) !== selInit;
    function refresh() {
      cur = PC.normChart(Object.assign({}, cur, { o: read(box) }));
      const hid = refreshVisibility(box, cur.type, cur.o);
      $('#ce_kL').style.display = K > 1 ? '' : 'none';
      $('#ce_k2L').style.display = K > 1 && TWO_VALUES.indexOf(cur.type) >= 0 ? '' : 'none';
      $('#ce_gL').style.display = cur.type === 'gauge' ? '' : 'none';
      const h = $('#ce_hid'); h.hidden = !hid; h.textContent = hiddenNote(hid);
      let r; try { r = opts.build(cur) || { svg: '', note: '' }; } catch (e) { r = { svg: '', note: 'Aperçu indisponible.' }; }
      $('#ce_svg').innerHTML = r.svg || ''; $('#ce_note').textContent = r.note || (r.svg ? '' : 'Rien à afficher avec ces réglages.');
    }
    function onInput(ev) {
      const f = ev.target.dataset && ev.target.dataset.f, v = ev.target.value;
      if (f === 'type') cur = Object.assign({}, cur, { type: v });
      else if (f === 'k') cur = Object.assign({}, cur, { k: +v });
      else if (f === 'k2') cur = Object.assign({}, cur, { k2: +v });
      else if (f === 'gmax') { const x = numOf(v); cur = Object.assign({}, cur, { gmax: x > 0 ? x : 0 }); }
      else if (!(ev.target.dataset && ev.target.dataset.opt)) return;
      refresh();
    }
    dlg.addEventListener('input', onInput); dlg.addEventListener('change', onInput);
    let closed = false;
    function close() { if (closed) return; closed = true; try { dlg.close(); } catch (e) { /* ignoré */ } dlg.remove(); if (opts.trigger && opts.trigger.focus && document.contains(opts.trigger)) opts.trigger.focus(); }
    function cancel() { if (dirty() && !root.confirm('Abandonner les modifications non enregistrées de ce graphique ?')) return false; close(); return true; }
    $('#ce_cancel').addEventListener('click', cancel);
    $('#ce_save').addEventListener('click', () => { const n = PC.normChart(cur); close(); opts.onSave(n, selDraft); });
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); cancel(); });   // Échap : même garde que « Annuler »
    drawSel(); refresh();
    dlg.showModal();
    $('#ce_type').focus();
    return { refresh, close, dialog: dlg };
  }
  const api = { open, selectorsBox, setFields: (l, cube) => { FIELDS = Array.isArray(l) ? l : []; CUBE = cube || ''; }, DEFS, PANEL_ID, html, fill, read, refreshVisibility, hiddenNote };
  root.PivotChartEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
