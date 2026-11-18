/* js/app.js — Interface du tableau croisé (index.html) : Cœur : version, état `st`, utilitaires, lecture et actualisation des fichiers.
 * Script CLASSIQUE (file://) : les déclarations sont GLOBALES et partagées avec les autres fichiers app*.js (ordre de chargement :
 * voir le chargeur de la page et docs/ARCHITECTURE.md). Ce fichier ne contient que des fonctions et des déclarations sans effet au
 * chargement ; tout ce qui s'exécute au démarrage est dans les fichiers app-init-*.js (chargés en dernier, dans l'ordre). */
'use strict';
const PIVOT_VERSION = '3.8.0';   // à incrémenter à chaque évolution de l'outil (+ entrée « Pivot x.y.z » du CHANGELOG)
const E = window.PivotEngine, XL = window.XLSX;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIMIT = 5000;
const PF = window.PivotFormat;
// Préférences d'affichage (aucune donnée) mémorisées sur cet appareil ; sans stockage, valeurs par défaut.
function loadOpts() { try { return JSON.parse(localStorage.getItem('statbel_pivot_opts') || '{}') || {}; } catch (e) { return {}; } }
function saveOpts() { try { localStorage.setItem('statbel_pivot_opts', JSON.stringify(st.o)); } catch (e) { /* stockage indisponible */ } }

/* ---------- lecture des fichiers ---------- */
// handles (facultatif) : poignées de fichier du navigateur (Chrome/Edge) qui permettent de relire le fichier plus tard
async function addFiles(files, handles) {
  const msgs = [];
  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    try {
      const sheets = (await window.PivotImport.readFile(f, E, XL)).filter(s => s.aoa.length > 1);
      if (!sheets.length) { msgs.push(f.name + ' : aucune feuille avec des données'); continue; }
      const big = sheets.reduce((a, b) => (b.aoa.length > a.aoa.length ? b : a));
      sheets.forEach(s => st.sources.push({
        id: 's' + (++st.nid), file: f.name, sheet: s.name, aoa: s.aoa, headerRow: E.detectHeaderRow(s.aoa), use: s === big,
        handle: (handles && handles[fi]) || undefined, mtime: f.lastModified,
        label: sheets.length > 1 ? f.name + ' › ' + s.name : f.name
      }));
    } catch (e) { msgs.push(f.name + ' : lecture impossible (' + e.message + ')'); }
  }
  $('#msg').textContent = msgs.join(' · ');
  const first = !st.rows.length;
  rebuild();
  if (first && st.rows.length) setMode('table');
}

/* ---------- ajout de fichiers « actualisables » + actualisation (Chrome / Edge : poignées de fichier) ---------- */
const hasPicker = () => typeof window.showOpenFilePicker === 'function';
const FILE_TYPES = [
  { description: 'Classeurs Excel / OpenDocument', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'], 'application/vnd.oasis.opendocument.spreadsheet': ['.ods'] } },
  { description: 'CSV / texte', accept: { 'text/csv': ['.csv'], 'text/tab-separated-values': ['.tsv'], 'text/plain': ['.txt'] } }
];
// Le sélecteur natif garde un lien vers le fichier : on pourra le relire après modification sans le rajouter.
async function pickFiles() {
  if (!hasPicker()) { $('#fileIn').click(); return; }
  try {
    const hs = await window.showOpenFilePicker({ multiple: true, types: FILE_TYPES });
    addFiles(await Promise.all(hs.map(h => h.getFile())), hs);
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // annulé
    $('#msg').textContent = 'Sélecteur de fichiers indisponible (' + (e && e.message ? e.message : e) + ') : utilisez le glisser-déposer.';
  }
}
const linked = () => st.sources.filter(s => s.handle);
let staleCount = 0;
const autoOn = () => { try { return window.localStorage.getItem('statbel_pivot_auto') === '1'; } catch (e) { return false; } };
function updateRefreshUi() {
  const n = linked().length, b = $('#btnRefresh');
  b.hidden = !n; $('#autoRow').hidden = !n;
  $('#optAuto').checked = autoOn();
  b.classList.toggle('stale', staleCount > 0);
  const rl = staleCount > 0 ? 'Actualiser (' + staleCount + ' fichier' + (staleCount > 1 ? 's' : '') + ' modifié' + (staleCount > 1 ? 's' : '') + ')' : 'Actualiser';
  b.querySelector('.lb').textContent = rl; b.setAttribute('aria-label', rl); if (staleCount > 0) b.title = rl;
}
// Fichiers dont la date de modification a changé depuis la dernière lecture (sans toucher aux données).
async function checkChanged() {
  let n = 0;
  const seen = new Set();
  for (const s of linked()) {
    if (seen.has(s.handle)) continue;
    seen.add(s.handle);
    try {
      if ((await s.handle.queryPermission({ mode: 'read' })) !== 'granted') continue;
      const f = await s.handle.getFile();
      if (linked().some(x => x.handle === s.handle && x.mtime !== f.lastModified)) n++;
    } catch (e) { /* fichier déplacé ou supprimé : ignoré ici, signalé à l'actualisation */ }
  }
  staleCount = n; updateRefreshUi();
  return n;
}
let refreshing = false;
// auto = déclenché au retour sur la page (aucune demande de permission possible : seuls les fichiers déjà autorisés sont relus)
async function refreshData(auto) {
  if (refreshing) return;
  const src = linked();
  if (!src.length) { $('#msg').textContent = 'Aucun fichier actualisable : ajoutez-les avec « Modifier le projet » › Sources (Chrome ou Edge).'; return; }
  refreshing = true;
  const msgs = [], before = st.rows.length;
  let changed = 0, same = 0;
  try {
    const groups = new Map();
    src.forEach(s => { (groups.get(s.handle) || groups.set(s.handle, []).get(s.handle)).push(s); });
    for (const [h, list] of groups) {
      const name = list[0].file;
      try {
        let perm = await h.queryPermission({ mode: 'read' });
        if (perm !== 'granted' && !auto) perm = await h.requestPermission({ mode: 'read' });
        if (perm !== 'granted') { if (!auto) msgs.push(name + ' : accès au fichier refusé'); continue; }
        const f = await h.getFile();
        if (list.every(s => s.mtime === f.lastModified)) { same++; continue; }
        const sheets = await window.PivotImport.readFile(f, E, XL);
        list.forEach(s => {
          const ns = sheets.find(x => x.name === s.sheet);
          if (!ns || ns.aoa.length < 2) { msgs.push(name + ' › ' + s.sheet + ' : feuille introuvable ou vide, anciennes données conservées'); return; }
          s.aoa = ns.aoa; s.mtime = f.lastModified;
          s.headerRow = Math.min(s.headerRow, Math.max(0, ns.aoa.length - 1));
        });
        changed++;
      } catch (e) { msgs.push(name + ' : lecture impossible (' + (e && e.message ? e.message : e) + ')'); }
    }
    if (changed) { ssSig = ''; rebuild(true); }   // les tris et sélections sont conservés
    staleCount = 0; updateRefreshUi();
    if (changed || msgs.length || !auto) {
      $('#msg').textContent = (changed ? `Données actualisées (${changed} fichier(s)) : ${before.toLocaleString('fr-BE')} → ${st.rows.length.toLocaleString('fr-BE')} lignes` : same ? 'Aucune modification : les fichiers sont à jour' : '') + (msgs.length ? ' · ' + msgs.join(' · ') : '');
    }
  } finally { refreshing = false; }
}
async function checkAndMaybeRefresh() { if (!linked().length) return; const n = await checkChanged(); if (n && autoOn()) refreshData(true); }
