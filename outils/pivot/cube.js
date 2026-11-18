/* Cube de données : configuration unique, au niveau du projet, qui dit quels champs servent au GRAPHIQUE et lesquels servent au FILTRAGE.
 *  - « Champ du graphique par défaut » (ex. Commune) : tout graphique dont le champ n'est pas réglé lui-même ne garde que ce champ + les valeurs de la vue ;
 *  - « Champs de filtrage » (ex. Région, Province) : proposés comme filtres globaux (listes déroulantes du tableau de bord).
 * Ce module ne contient que la fenêtre de réglage (navigateur uniquement, <dialog> natif) ; l'application applique le résultat (app.js : setCube, chartRes). */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // opts : { fields:[{key,label}], cube:{chart, filters}, max, onSave(cube), trigger }
  function open(opts) {
    const dlg = document.createElement('dialog'), max = opts.max || 5, fields = opts.fields || [], cube = opts.cube || { chart: '', filters: [] };
    dlg.className = 'ce'; dlg.setAttribute('aria-label', 'Cube de données');
    dlg.innerHTML = `<h3 style="margin-top:0">Cube de données</h3>
      <p class="hint">Dites une fois pour toutes quel champ porte les <b>graphiques</b> (ex. Commune) et quels champs servent au <b>filtrage</b> (ex. Région, Province). Les graphiques ne gardent alors que le champ choisi et la valeur ; les tableaux croisés ne changent pas.</p>
      <div class="ce-form" style="max-height:60vh">
        <label class="meta">Champ du graphique (par défaut) <select id="cu_chart"><option value="">Aucun : comme le tableau</option>${fields.map(f => `<option value="${esc(f.key)}"${f.key === cube.chart ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>
        <span class="meta" title="Chaque champ coché devient une liste déroulante globale dans le tableau de bord (jusqu'à ${max})">Champs de filtrage</span>
        <div id="cu_filters" class="ce-sel">${fields.map(f => `<label class="meta chk"><input type="checkbox" data-k="${esc(f.key)}"${cube.filters.includes(f.key) ? ' checked' : ''}> ${esc(f.label)}</label>`).join('') || '<span class="hint">Aucun champ disponible.</span>'}</div>
        <p class="hint" id="cu_note"></p>
      </div>
      <div class="row"><button type="button" id="cu_cancel">Annuler</button><button type="button" class="pri" id="cu_save">Enregistrer</button></div>`;
    document.body.appendChild(dlg);
    const $ = s => dlg.querySelector(s), boxes = [...dlg.querySelectorAll('#cu_filters input')];
    function sync() {   // le champ du graphique n'est pas aussi un filtre ; au plus `max` filtres
      const chart = $('#cu_chart').value, n = boxes.filter(b => b.checked && b.dataset.k !== chart).length;
      boxes.forEach(b => { if (b.dataset.k === chart) b.checked = false; b.disabled = b.dataset.k === chart || (!b.checked && n >= max); });
      $('#cu_note').textContent = n >= max ? 'Maximum atteint (' + max + ' filtres).' : '';
    }
    dlg.addEventListener('change', sync); sync();
    let closed = false;
    const close = () => { if (closed) return; closed = true; try { dlg.close(); } catch (e) { /* ignoré */ } dlg.remove(); if (opts.trigger && opts.trigger.focus && document.contains(opts.trigger)) opts.trigger.focus(); };
    $('#cu_cancel').addEventListener('click', close);
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    $('#cu_save').addEventListener('click', () => { const out = { chart: $('#cu_chart').value, filters: boxes.filter(b => b.checked).map(b => b.dataset.k).slice(0, max) }; close(); opts.onSave(out); });
    dlg.showModal(); $('#cu_chart').focus();
    return { close, dialog: dlg };
  }
  root.PivotCube = { open };
})(typeof globalThis !== 'undefined' ? globalThis : window);
