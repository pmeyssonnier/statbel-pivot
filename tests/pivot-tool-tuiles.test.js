/*
 * Test de l'outil Tableaux croisés — index.html — Vues, tableau de bord et tuiles (graphiques de tuile, sélecteurs), filtres riches, nouveaux graphiques et options, tuile = un contenu, panneaux ⚙, navigation entre tuiles
 * (Découpé de l'ancien tests/pivot-tool.test.js en suites indépendantes, exécutées en parallèle : seule la
 *  couverture de la page par scénarios change, pas son contenu.)
 *
 * Lancer :  CHROMIUM_PATH=… node tests/pivot-tool-tuiles.test.js
 */
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = (()=>{try{return require('playwright-core')}catch(e){return require('playwright')}})();
const { serve } = require('./_serve');
const XLSX = require('../vendor/xlsx/xlsx.full.min.js');
const EXEC = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';
let fails = 0;
const A = (cond, msg) => { if (!cond) { fails++; console.log('✗ FAIL ' + msg); } else console.log('✓ ' + msg); };
// Navigation à menus (fil d'Ariane, menu Exporter) : les entrées sont dans des menus fermés ; ces gestes déclenchent le bouton lui-même (les vrais menus ont leurs propres tests : « navigation : … »)
// Pastilles de filtres : « + Filtre ▾ » (barre du tableau de bord ou de la vue ouverte), portée « view » | « global » (vue ouverte seulement)
const addFilter = (p, label, scope, ctx) => p.evaluate(({ label, scope, ctx }) => {
  const bar = ctx === 'dash' ? document.querySelector('#dash .fbar') : document.querySelector('#selBar');
  bar.querySelector('.fadd').click();
  if (ctx !== 'dash') bar.querySelector('[data-fscope="' + (scope || 'view') + '"]').click();
  const b = [...bar.querySelectorAll('.fmenu [data-fadd]')].find(x => x.textContent.trim() === label);
  if (!b) throw new Error('filtre introuvable : ' + label);
  b.click();
}, { label, scope, ctx }).then(() => p.waitForTimeout(250));
const vact = (p, act) => p.evaluate(x => document.querySelector('#viewTabs [data-vact="' + x + '"]').click(), act);
const vview = (p, id) => p.evaluate(x => document.querySelector('#viewTabs [data-view="' + x + '"]').click(), id);
const vhas = async (p, act) => (await p.$('#viewTabs [data-vact="' + act + '"]')) !== null;
const xclick = (p, sel) => p.evaluate(x => document.querySelector(x).click(), sel);
// ouvre le panneau « ⚙ Tableau » (tiroir : totaux, décimales, Top N, mise en forme)
const tpo = p => p.evaluate(() => { if (!document.body.classList.contains('tp-open')) document.getElementById('btnTbOpts').click(); });
const tpc = p => p.evaluate(() => { if (document.body.classList.contains('tp-open')) document.getElementById('btnTbOpts').click(); });
const cpo = p => p.evaluate(() => { if (!document.body.classList.contains('cp-open')) document.getElementById('btnChOpts').click(); });   // ouvre le panneau « ⚙ Graphique » (tiroir)
// Session mémorisée : validation de ce qui est relu d'IndexedDB (parties pures)
const SSM = require('../js/session.js');

// ---------- UI ----------
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-'));
  const mk = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Feuil1'); const f = path.join(dir, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; };
  const f1 = mk('a.xlsx', [['Commune', 'Trimestre', 'Nombre d\'établissements'], ['Anvers', '2024-T4', 100], ['Boom', '2024-T4', 10], ['Anvers', '2024-T3', 90]]);
  const f2 = mk('b.xlsx', [['commune', 'Trim.', 'Nb établissements'], ['Anvers', '2024-T4', 7], ['Gand', '2024-T4', 5]]);
  const srv = await serve();
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const errs = [];
  // Vues : plusieurs tableaux / graphiques différents sur les mêmes données
  const ctxV = await b.newContext({ viewport: { width: 1600, height: 900 } }), pv = await ctxV.newPage();
  pv.on('pageerror', e => errs.push(e.message));
  await pv.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pv.setInputFiles('#fileIn', [f1, f2]); await pv.waitForTimeout(400);
  const vadd = (l, z) => pv.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await vadd('Commune', 'rows'); await vadd('Trimestre', 'cols'); await vadd('Nombre d\'établissements', 'vals');
  await pv.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click());
  await pv.selectOption('#chType', 'bar'); await pv.waitForTimeout(100);
  const tabs = () => pv.$$eval('#viewTabs .vt', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join('|'));
  A(await tabs() === 'Vue 1*' && !(await vhas(pv, 'del')), 'vues : une seule vue au départ (pas de suppression possible)');
  await vact(pv, 'add'); await pv.waitForTimeout(150);
  { const ord = await pv.$$eval('#amenu [data-vact]', e => e.map(x => x.dataset.vact).join()), inV = await pv.$$eval('#vmenu [data-vact]', e => e.map(x => x.dataset.vact).join()); A(ord === 'rename,dup,left,right,del' && inV === 'add', 'vues : ⋯ = renommer, dupliquer, déplacer ◂ ▸, supprimer ; « + Nouvelle vue » est dans le menu ▾ — ' + ord + ' / ' + inV); }
  A(await tabs() === 'Vue 1|Vue 2*' && (await pv.$$('.zone[data-zone="rows"] .chip')).length === 0 && await pv.inputValue('#chType') === 'none' && await pv.isHidden('#chartBox'), 'vues : « + » crée une vue vide (sans champs, sans graphique)');
  await vadd('Source', 'rows'); await pv.selectOption('#chType', 'pie'); await tpo(pv); await pv.selectOption('#optStyle', 'sombre'); await pv.waitForTimeout(150); await tpc(pv);
  A(/a\.xlsx/.test(await pv.textContent('#out')) && await pv.isVisible('#chart svg'), 'vues : la vue 2 a son propre tableau (Source) et son graphique (secteurs)');
  await vview(pv, 'v1'); await pv.waitForTimeout(200);
  const v1 = await pv.evaluate(() => ({ rows: __pivot.st.L.rows.join(), chart: document.querySelector('#chType').value, style: document.querySelector('#optStyle').value, out: document.querySelector('#out').textContent }));
  A(/commune/.test(v1.rows) && v1.chart === 'bar' && v1.style !== 'sombre' && /Anvers/.test(v1.out) && !/a\.xlsx/.test(v1.out), 'vues : retour à la vue 1 — champs, graphique et style retrouvés, sans contamination par la vue 2');
  await vact(pv, 'dup'); await pv.waitForTimeout(200);
  A(await tabs() === 'Vue 1|Vue 2|Vue 1 (copie)*' && await pv.inputValue('#chType') === 'bar' && /Anvers/.test(await pv.textContent('#out')), 'vues : « ⧉ » duplique (champs et graphique)');
  await vadd('Nombre d\'établissements', 'filters'); await pv.waitForTimeout(100);
  await vview(pv, 'v1'); await pv.waitForTimeout(150);
  A((await pv.$$('.zone[data-zone="filters"] .chip')).length === 0, 'vues : modifier la copie ne touche pas l\'original');
  pv.once('dialog', d => d.accept('Par commune'));
  await vact(pv, 'rename'); await pv.waitForTimeout(100);
  A((await tabs()).startsWith('Par commune*'), 'vues : renommage');
  await pv.waitForTimeout(1300);
  await pv.reload({ waitUntil: 'load' }); await pv.waitForTimeout(1000);
  A(await tabs() === 'Par commune*|Vue 2|Vue 1 (copie)' && await pv.inputValue('#chType') === 'bar' && /Anvers/.test(await pv.textContent('#out')), 'vues : toutes les vues et la vue active sont retrouvées après actualisation de la page');
  await vview(pv, 'v2'); await pv.waitForTimeout(150);
  A(/a\.xlsx/.test(await pv.textContent('#out')) && await pv.inputValue('#chType') === 'pie', 'vues : la vue 2 restaurée a son tableau et son graphique');
  await vact(pv, 'del'); await pv.waitForTimeout(150);
  A(await tabs() === 'Par commune*|Vue 1 (copie)' && /Anvers/.test(await pv.textContent('#out')), 'vues : suppression → retour à la vue voisine');
  for (let i = 0; i < 12; i++) { if ((await vhas(pv, 'add'))) await vact(pv, 'add'); }
  A((await pv.$$('#viewTabs .vt')).length === 12 && !(await vhas(pv, 'add')), 'vues : limite de 12 vues');
  await ctxV.close();

  // Tableau de bord : toutes les vues côte à côte
  const ctxD = await b.newContext({ viewport: { width: 1600, height: 900 } }), pb = await ctxD.newPage();
  pb.on('pageerror', e => errs.push(e.message));
  await pb.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pb.setInputFiles('#fileIn', [f1, f2]); await pb.waitForTimeout(400);
  const dadd = (l, z) => pb.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await dadd('Commune', 'rows'); await dadd('Nombre d\'établissements', 'vals');
  await pb.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click());
  await pb.selectOption('#chType', 'bar');
  await vact(pb, 'add'); await pb.waitForTimeout(100);
  await dadd('Source', 'rows'); await pb.waitForTimeout(100);
  A(await pb.isHidden('#dash'), 'tableau de bord : masqué par défaut');
  await vact(pb, 'dash'); await pb.waitForTimeout(250);
  const tiles = () => pb.$$eval('#dash .tile', e => e.map(x => ({ id: x.dataset.view, cur: x.classList.contains('cur'), svg: !!x.querySelector('svg'), table: !!x.querySelector('table.pv'), txt: x.textContent })));
  let tl = await tiles();
  A(await pb.isVisible('#dash') && await pb.isHidden('#tvBody') && tl.length === 2 && tl[0].svg && !tl[0].table && tl[1].table && !tl[1].svg && /a\.xlsx/.test(tl[1].txt) && tl[1].cur, 'tableau de bord : 2 tuiles — graphique (vue 1) et tableau (vue 2), vue active repérée');
  A(await pb.isVisible('#dashFocus'), 'tableau de bord : bouton ⛶ Agrandir disponible');
  // Graphique de tuile : largeur construite = largeur affichée, hauteur ≈ hauteur de la tuile, sans ascenseur
  const fitInfo = await pb.evaluate(() => { const bd = document.querySelector('#dash .tile[data-view="v1"] .tbody'), sv = bd.querySelector('svg'), r = sv.getBoundingClientRect(); return { built: +sv.getAttribute('width'), shown: Math.round(r.width), h: Math.round(r.height), body: bd.clientHeight, scroll: bd.scrollHeight }; });
  A(Math.abs(fitInfo.built - fitInfo.shown) <= 2 && fitInfo.scroll <= fitInfo.body + 2 && fitInfo.h >= fitInfo.body * 0.9, 'tableau de bord : le graphique d\'une tuile épouse sa largeur et sa hauteur (largeur construite = affichée, remplit la tuile, sans ascenseur) — ' + JSON.stringify(fitInfo));
  // Édition d'un graphique de tuile depuis le tableau de bord (fenêtre : aperçu, Enregistrer / Annuler)
  const tileBody = id => pb.innerHTML('#dash .tile[data-view="' + id + '"] .tbody'), ceVis = id => pb.isVisible('#' + id);
  const v1Before = await tileBody('v1'), v2Before = await tileBody('v2');
  A(await pb.isVisible('#dash .tile[data-view="v1"] [data-tact="chart"]') && (await pb.$$('#dash .tile[data-view="v2"] [data-tact="chart"]')).length === 0, 'tuile : bouton « ⚙ Graphique » seulement sur les tuiles graphique');
  await pb.click('#dash .tile[data-view="v1"] [data-tact="chart"]'); await pb.waitForTimeout(200);
  await pb.evaluate(() => document.querySelectorAll('dialog.ce details.sec').forEach(d => { d.open = true; }));
  A(await pb.isVisible('dialog.ce[open]') && await pb.inputValue('#ce_type') === 'bar' && await pb.isVisible('#ce_svg svg') && await ceVis('ce_bar') && await ceVis('ce_grid') && !await ceVis('ce_zoom') && !await ceVis('ce_hole'), 'éditeur de tuile : ouvert sans quitter le tableau de bord, prérempli (barres), options des barres');
  await pb.selectOption('#ce_type', 'pie'); await pb.waitForTimeout(150);
  A(await ceVis('ce_zoom') && !await ceVis('ce_bar') && !await ceVis('ce_grid') && !await ceVis('ce_trend') && await tileBody('v1') === v1Before, 'éditeur de tuile : options contextuelles (secteurs) et aperçu sans toucher la tuile avant enregistrement');
  let ceDlg = 0; pb.once('dialog', d => { ceDlg++; d.dismiss(); });
  await pb.click('#ce_cancel'); await pb.waitForTimeout(150);
  A(ceDlg === 1 && await pb.isVisible('dialog.ce[open]'), 'éditeur de tuile : Annuler avec modifications demande confirmation (refus → la fenêtre reste ouverte)');
  pb.once('dialog', d => { ceDlg++; d.accept(); });
  await pb.click('#ce_cancel'); await pb.waitForTimeout(150);
  A(ceDlg === 2 && (await pb.$$('dialog.ce')).length === 0 && await tileBody('v1') === v1Before && await tileBody('v2') === v2Before, 'éditeur de tuile : Annuler (confirmé) restaure exactement l\'état précédent, aucune tuile modifiée');
  await pb.click('#dash .tile[data-view="v1"] [data-tact="chart"]'); await pb.waitForTimeout(150);
  await pb.keyboard.press('Escape'); await pb.waitForTimeout(100);
  A((await pb.$$('dialog.ce')).length === 0 && ceDlg === 2, 'éditeur de tuile : Échap sans modification ferme sans confirmation');
  await pb.click('#dash .tile[data-view="v1"] [data-tact="chart"]'); await pb.waitForTimeout(150);
  await pb.selectOption('#ce_type', 'donut'); await pb.fill('#ce_title', 'Titre de la tuile'); await pb.selectOption('#ce_pal', 'pastel'); await pb.waitForTimeout(150);
  await pb.click('#ce_save'); await pb.waitForTimeout(250);
  const v1After = await tileBody('v1');
  A((await pb.$$('dialog.ce')).length === 0 && /Titre de la tuile/.test(v1After) && v1After !== v1Before && await tileBody('v2') === v2Before, 'éditeur de tuile : Enregistrer applique le graphique à cette tuile seulement (titre, type, palette)');
  await vview(pb, 'v1'); await pb.waitForTimeout(250);
  A(await pb.inputValue('#chType') === 'donut' && await pb.inputValue('#coTitle') === 'Titre de la tuile' && await pb.inputValue('#coPal') === 'pastel', 'éditeur de tuile : la modification est bien portée par la vue (retrouvée dans le panneau du Pivot)');
  await vview(pb, 'v2'); await pb.waitForTimeout(250);   // la vue 2 devient la vue active (le tableau de bord reste affiché)
  // Sélecteur (liste déroulante) : filtre le graphique d'une tuile, puis de la vue active
  await pb.click('#dash .tile[data-view="v1"] [data-tact="chart"]'); await pb.waitForTimeout(150);
  await pb.selectOption('#ce_sel select[data-add]', { label: 'Commune' }); await pb.waitForTimeout(100);
  A(await pb.isVisible('#ce_sel .chipbtn') && /Commune/.test(await pb.textContent('#ce_sel')), 'sélecteur : champ ajouté depuis la fenêtre du graphique de la tuile');
  await pb.click('#ce_save'); await pb.waitForTimeout(250);
  const selOpts = await pb.$$eval('#dash .tile[data-view="v1"] select[data-sel] option', e => e.map(x => x.textContent));
  const selV1All = await tileBody('v1'), selV2Ref = await tileBody('v2');
  A(selOpts[0] === 'Toutes' && selOpts.includes('Anvers') && selOpts.includes('Boom') && (await pb.$$('#dash .tile[data-view="v2"] select[data-sel]')).length === 0, 'sélecteur : liste « Toutes » + valeurs du champ sur la tuile concernée seulement');
  await pb.selectOption('#dash .tile[data-view="v1"] select[data-sel]', 'Anvers'); await pb.waitForTimeout(250);
  const selV1Anv = await tileBody('v1');
  A(selV1Anv !== selV1All && await tileBody('v2') === selV2Ref && await pb.inputValue('#dash .tile[data-view="v1"] select[data-sel]') === 'Anvers', 'sélecteur : choisir une valeur filtre le graphique de la tuile (les autres tuiles ne changent pas)');
  await vview(pb, 'v1'); await pb.waitForTimeout(250);
  await vact(pb, 'dash'); await pb.waitForTimeout(250);   // retour à la vue Pivot (la barre de sélecteurs est dans la zone du graphique)
  const selOutAnv = await pb.textContent('#out');
  A(await pb.isVisible('#selBar select[data-sel]') && await pb.inputValue('#selBar select[data-sel]') === 'Anvers' && !/Boom/.test(selOutAnv), 'sélecteur : la vue active affiche son sélecteur au-dessus du graphique, valeur conservée, tableau filtré');
  await pb.selectOption('#selBar select[data-sel]', ''); await pb.waitForTimeout(250);
  A(/Boom/.test(await pb.textContent('#out')) && await pb.inputValue('#selBar select[data-sel]') === '', 'sélecteur : « Toutes » rétablit le tableau (et le graphique)');
  await pb.evaluate(() => document.querySelector('#selBar [data-vx]').click()); await pb.waitForTimeout(200);
  A((await pb.$$('#selBar select[data-sel]')).length === 0, 'sélecteur : retiré depuis le panneau du Pivot');
  await vact(pb, 'dash'); await pb.waitForTimeout(250);
  A(await tileBody('v1') === selV1All && (await pb.$$('#dash select[data-sel]')).length === 0, 'sélecteur : retiré aussi de la tuile, graphique complet rétabli');
  // Sélecteur GLOBAL (barre du tableau de bord) : filtre toutes les tuiles
  const gBefore1 = await tileBody('v1'), gBefore2 = await tileBody('v2');
  await addFilter(pb, 'Commune', 'global', 'dash');
  A(await pb.isVisible('#dash select[data-gsel]') && (await pb.$$eval('#dash select[data-gsel] option', e => e.map(x => x.textContent))).includes('Boom'), 'sélecteur global : ajouté dans la barre du tableau de bord (liste « Toutes » + valeurs)');
  await pb.selectOption('#dash select[data-gsel]', 'Anvers'); await pb.waitForTimeout(300);
  A(await tileBody('v1') !== gBefore1 && await tileBody('v2') !== gBefore2 && await pb.inputValue('#dash select[data-gsel]') === 'Anvers', 'sélecteur global : une valeur filtre TOUTES les tuiles (graphique et tableau)');
  await vact(pb, 'dash'); await pb.waitForTimeout(250);   // vue Pivot
  const gOutF = await pb.textContent('#out');
  A(await pb.isVisible('#selBar [data-gx]') && await pb.inputValue('#selBar select[data-gsel]') === 'Anvers' && /Tout/.test(await pb.textContent('#selBar .fchip .scope')), 'sélecteur global : pastille « Tout » dans la vue Pivot (filtre actif, bouton × pour le retirer)');
  await pb.evaluate(() => document.querySelector('#selBar [data-gx]').click()); await pb.waitForTimeout(250);
  A(await pb.textContent('#out') !== gOutF && (await pb.$$('#selBar [data-gx]')).length === 0, 'sélecteur global : × rétablit les données');
  await vact(pb, 'dash'); await pb.waitForTimeout(250);
  A((await pb.$$('#dash select[data-gsel]')).length === 0&& await tileBody('v1') === gBefore1 && await tileBody('v2') === gBefore2, 'sélecteur global : retiré, tuiles d\'origine rétablies');
  await vview(pb, 'v2'); await pb.waitForTimeout(250);
  await pb.click('#dash .tile[data-view="v2"] [data-tact="mode"]'); await pb.waitForTimeout(150);
  tl = await tiles();
  A(tl[1].svg && !tl[1].table, 'tableau de bord : ◔ bascule une tuile en graphique (barres par défaut)');
  await pb.evaluate(() => { const t = document.querySelector('#coTitle'); t.value = 'Titre R1'; t.dispatchEvent(new Event('change', { bubbles: true })); }); await pb.waitForTimeout(150);
  tl = await tiles();
  A(/Titre R1/.test(tl[1].txt) && !/Titre R1/.test(tl[0].txt), 'tableau de bord : une option modifiée sur la vue active apparaît tout de suite sur sa tuile (et seulement sur elle)');
  await pb.click('#dash .tile[data-view="v2"] [data-tact="mode"]'); await pb.waitForTimeout(150);   // graphique → tableau
  tl = await tiles();
  A(tl[1].table && !tl[1].svg, 'tableau de bord : le bouton de mode finit par rebasculer en tableau seul');
  await vview(pb, 'v1'); await pb.waitForTimeout(250);
  tl = await tiles();
  A(tl[0].cur && !tl[1].cur && await pb.isVisible('#dash') && (await pb.$$('.zone[data-zone="rows"] .chip')).length === 1 && /Commune/.test(await pb.textContent('.zone[data-zone="rows"]')), 'tableau de bord : la vue active (zones, panneau) suit la vue choisie sans quitter le tableau de bord (zones = vue 1)');
  await dadd('Trimestre', 'cols'); await pb.waitForTimeout(250);
  tl = await tiles();
  A(tl[0].svg, 'tableau de bord : une modification de la vue active met sa tuile à jour');
  await pb.click('#dash .tile[data-view="v2"] [data-tact="hide"]'); await pb.waitForTimeout(150);
  A((await pb.$$('#dash .tile')).length === 1 && await pb.isHidden('#dash .tile [data-tact="hide"]') && /Masquées/.test(await pb.textContent('#dash .dash-bar')), 'tableau de bord : tuile masquée (la dernière ne peut pas l\'être), vue listée dans « Masquées »');
  await pb.waitForTimeout(1200);
  await pb.reload({ waitUntil: 'load' }); await pb.waitForTimeout(1000);
  A(await pb.isVisible('#dash') && (await pb.$$('#dash .tile')).length === 1 && /Masquées/.test(await pb.textContent('#dash .dash-bar')), 'tableau de bord : mode et tuiles masquées retrouvés après actualisation de la page');
  await pb.click('#dash [data-tact="show"]'); await pb.waitForTimeout(150);
  await pb.selectOption('#dashCols', '1'); await pb.waitForTimeout(150);
  const cols1 = await pb.evaluate(() => getComputedStyle(document.querySelector('#dash')).gridTemplateColumns.split(' ').length);
  await pb.selectOption('#dashCols', '2'); await pb.waitForTimeout(150);
  const cols2 = await pb.evaluate(() => getComputedStyle(document.querySelector('#dash')).gridTemplateColumns.split(' ').length);
  A((await pb.$$('#dash .tile')).length === 2 && cols1 === 1 && cols2 === 2, 'tableau de bord : tuile réaffichée ; choix du nombre de colonnes (1 → ' + cols1 + ', 2 → ' + cols2 + ')');
  await pb.emulateMedia({ media: 'print' }); await pb.waitForTimeout(100);
  const pr = await pb.evaluate(() => ({ aside: getComputedStyle(document.querySelector('aside')).display, hdr: getComputedStyle(document.querySelector('header')).display, bar: getComputedStyle(document.querySelector('.dash-bar')).display, btn: getComputedStyle(document.querySelector('.tile .tbtns')).display, tile: getComputedStyle(document.querySelector('.tile')).display, bg: getComputedStyle(document.body).backgroundColor }));
  A(pr.aside === 'none' && pr.hdr === 'none' && pr.bar === 'none' && pr.btn === 'none' && pr.tile !== 'none' && pr.bg === 'rgb(255, 255, 255)', 'impression : seules les tuiles sont imprimées, sur fond blanc (ni panneau, ni boutons)');
  await pb.emulateMedia({ media: 'screen' });
  await vact(pb, 'dash'); await pb.waitForTimeout(150);
  A(await pb.isHidden('#dash') && await pb.isVisible('#out'), 'tableau de bord : le bouton ▦ ramène à la vue unique');
  await ctxD.close();

  // Filtres riches dans l'interface : texte, plage, top
  const ctxF = await b.newContext({ viewport: { width: 1500, height: 900 } }), pf = await ctxF.newPage();
  pf.on('pageerror', e => errs.push(e.message));
  await pf.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pf.setInputFiles('#fileIn', [f1, f2]); await pf.waitForTimeout(400);
  const fadd = (l, z) => pf.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await fadd('Commune', 'rows'); await fadd('Nombre d\'établissements', 'vals');
  await pf.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click());
  await fadd('Commune', 'filters'); await pf.waitForTimeout(100);
  const fout = () => pf.textContent('#out');
  A(/Boom/.test(await fout()), 'filtres riches : point de départ — toutes les communes');
  await pf.click('.zone[data-zone="filters"] [data-act="filt"]'); await pf.waitForTimeout(100);
  A(await pf.isHidden('#frtQ'), 'filtres riches : règles avancées repliées tant qu\'aucune n\'est définie');
  await pf.evaluate(() => { document.querySelector('#fRules').open = true; });
  A(await pf.isVisible('#frtQ'), 'filtres riches : dialogue avec les règles avancées');
  A(await pf.isHidden('#frRange'), 'filtres riches : plage masquée pour un champ texte');
  await pf.fill('#frtQ', 'an'); await pf.click('#fOk'); await pf.waitForTimeout(150);
  A(!/Boom/.test(await fout()) && /Anvers/.test(await fout()) && /Gand/.test(await fout()) && /contient/.test(await pf.textContent('.zone[data-zone="filters"]')) && /Filtres/.test(await pf.textContent('#summary')), 'filtre texte : « contient an » → Anvers et Gand seulement ; pastille et résumé indiqués');
  await pf.click('.zone[data-zone="filters"] [data-act="filt"]'); await pf.waitForTimeout(100);
  await pf.fill('#frtN', '1'); await pf.click('#fOk'); await pf.waitForTimeout(150);
  A(/Anvers/.test(await fout()) && !/Gand/.test(await fout()) && /top 1/.test(await pf.textContent('.zone[data-zone="filters"]')), 'filtre top : le meilleur seulement (Anvers), après la règle de texte');
  await pf.click('.zone[data-zone="filters"] [data-act="filt"]'); await pf.waitForTimeout(100);
  A(await pf.inputValue('#frtQ') === 'an' && await pf.inputValue('#frtN') === '1', 'filtres riches : les règles saisies sont retrouvées à la réouverture');
  await pf.click('#fRClear'); await pf.click('#fOk'); await pf.waitForTimeout(150);
  A(/Boom/.test(await fout()) && /Gand/.test(await fout()) && !/contient|top 1/.test(await pf.textContent('.zone[data-zone="filters"]')), 'filtres riches : « Effacer les règles » rétablit toutes les communes');
  await fadd('Nombre d\'établissements', 'filters'); await pf.waitForTimeout(100);
  await pf.click('.zone[data-zone="filters"] .chip:nth-child(2) [data-act="filt"]'); await pf.waitForTimeout(100);
  await pf.evaluate(() => { document.querySelector('#fRules').open = true; });
  A(await pf.isVisible('#frRange') && await pf.getAttribute('#frrMin', 'type') === 'number', 'filtres riches : plage proposée pour un champ numérique');
  await pf.fill('#frrMin', '50'); await pf.click('#fOk'); await pf.waitForTimeout(150);
  A(/Anvers/.test(await fout()) && !/Boom|Gand/.test(await fout()) && /190/.test(await fout()) && /50/.test(await pf.textContent('.zone[data-zone="filters"]')), 'filtre plage : établissements ≥ 50 → seules les lignes d\'Anvers (100 + 90 = 190)');
  await pf.evaluate(() => [...document.querySelectorAll('#out td[data-r]')].find(t => /190/.test(t.textContent)).click()); await pf.waitForTimeout(150);
  A(/2 ligne/.test(await pf.textContent('#dTitle')), 'filtre plage : le détail de la cellule respecte la règle (2 lignes)');
  await pf.click('#dClose');
  await ctxF.close();

  // Tableau de bord : déplacer, élargir et agrandir les tuiles
  const ctxT = await b.newContext({ viewport: { width: 1600, height: 900 } }), pt = await ctxT.newPage();
  pt.on('pageerror', e => errs.push(e.message));
  await pt.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pt.setInputFiles('#fileIn', [f1, f2]); await pt.waitForTimeout(400);
  await vact(pt, 'add'); await vact(pt, 'add');
  await vact(pt, 'dash'); await pt.waitForTimeout(300);
  const tnames = () => pt.$$eval('#dash .tile b', e => e.map(x => x.textContent).join('|'));
  const tgeo = n => pt.evaluate(n => { const t = [...document.querySelectorAll('#dash .tile')].find(x => x.querySelector('b').textContent === n); const r = t.getBoundingClientRect(), g = document.querySelector('#dash').getBoundingClientRect(); return { w: r.width, g: g.width, l: r.left, t: r.top, mh: t.querySelector('.tbody').style.maxHeight, span: t.style.gridColumn }; }, n);
  let g1 = await tgeo('Vue 1');
  A(await tnames() === 'Vue 1|Vue 2|Vue 3' && g1.w < g1.g / 2, 'tuiles : 3 tuiles de largeur 1 colonne au départ');
  await pt.click('#dash .tile:has(b:text-is("Vue 1")) [data-tact="wide"]'); await pt.waitForTimeout(150);
  g1 = await tgeo('Vue 1');
  A(/span 2/.test(g1.span) && g1.w > g1.g * 0.6 && g1.w < g1.g * 0.75, 'tuiles : ↔ élargit sur 2 colonnes (' + Math.round(g1.w) + ' / ' + Math.round(g1.g) + ' px)');
  await pt.click('#dash .tile:has(b:text-is("Vue 1")) [data-tact="wide"]'); await pt.waitForTimeout(150);
  g1 = await tgeo('Vue 1');
  A(/span 3/.test(g1.span) && g1.w > g1.g * 0.95, 'tuiles : ↔ encore → pleine largeur (3 colonnes)');
  await pt.click('#dash .tile:has(b:text-is("Vue 1")) [data-tact="wide"]'); await pt.waitForTimeout(150);
  g1 = await tgeo('Vue 1');
  A(/span 1/.test(g1.span), 'tuiles : ↔ encore → retour à 1 colonne');
  await pt.click('#dash .tile:has(b:text-is("Vue 2")) [data-tact="tall"]'); await pt.waitForTimeout(150);
  A((await tgeo('Vue 2')).mh === '720px', 'tuiles : ↕ → hauteur grande (720 px)');
  await pt.click('#dash .tile:has(b:text-is("Vue 2")) [data-tact="tall"]'); await pt.waitForTimeout(100);
  A((await tgeo('Vue 2')).mh === '260px', 'tuiles : ↕ → hauteur petite (260 px)');
  await pt.dragAndDrop('#dash .tile:has(b:text-is("Vue 3")) .th', '#dash .tile:has(b:text-is("Vue 1"))', { targetPosition: { x: 6, y: 40 } }); await pt.waitForTimeout(250);
  A(await tnames() === 'Vue 3|Vue 1|Vue 2', 'tuiles : glisser « Vue 3 » sur la moitié gauche de « Vue 1 » la place en premier');
  A(await pt.$$eval('#viewTabs .vt', e => e.map(x => x.textContent).join('|')) === 'Vue 3|Vue 1|Vue 2', 'tuiles : l\'ordre des onglets suit celui des tuiles');
  await pt.click('#dash .tile:has(b:text-is("Vue 2")) [data-tact="hide"]'); await pt.waitForTimeout(100);
  await pt.dragAndDrop('#dash .tile:has(b:text-is("Vue 3")) .th', '#dash .tile:has(b:text-is("Vue 1"))', { targetPosition: { x: 330, y: 40 } }); await pt.waitForTimeout(250);
  A(await tnames() === 'Vue 1|Vue 3', 'tuiles : déposer sur la moitié droite place après ; une tuile masquée garde sa place dans l\'ordre');
  await pt.waitForTimeout(1300);
  await pt.reload({ waitUntil: 'load' }); await pt.waitForTimeout(1000);
  A(await tnames() === 'Vue 1|Vue 3' && (await tgeo('Vue 3')).mh === '440px', 'tuiles : ordre conservé après actualisation de la page');
  await pt.click('#dash [data-tact="show"]'); await pt.waitForTimeout(150);
  A((await tgeo('Vue 2')).mh === '260px', 'tuiles : hauteur retrouvée après actualisation (tuile réaffichée → 260 px)');
  await ctxT.close();

  // Nouveaux graphiques dans l'interface
  const fBE = mk('be.xlsx', [['Commune', 'Année', 'Établissements', 'Habitants'], ['Anvers', 2023, 520, 52000], ['Anvers', 2024, 540, 52500], ['Gand', 2023, 260, 26000], ['Gand', 2024, 280, 26200], ['Liège', 2023, 310, 31000], ['Liège', 2024, 300, 31100], ['Bruxelles', 2023, 1200, 120000], ['Bruxelles', 2024, 1250, 121000]]);
  const ctxG = await b.newContext({ viewport: { width: 1500, height: 900 } }), pg = await ctxG.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pg.setInputFiles('#fileIn', [fBE]); await pg.waitForTimeout(400);
  const gadd = (l, z) => pg.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await gadd('Commune', 'rows'); await gadd('Établissements', 'vals');
  await pg.evaluate(() => { document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click(); document.querySelector('.zone[data-zone="vals"] .chip[data-i="0"] button[data-act="rm"]').click(); });   // une seule valeur : Établissements
  A((await pg.$$eval('#chType option', e => e.map(x => x.value))).join() === 'none,bar,hbar,stack,stack100,hstack,hstack100,combo,pyramid,line,area,sarea,pie,donut,treemap,scatter,map,kpi,gauge', 'graphiques : 19 choix dans la liste (barres, aires, anneau, treemap, nuage, carte, KPI, jauges…)');
  for (const t of ['donut', 'treemap', 'kpi', 'gauge', 'area', 'sarea']) {
    await pg.selectOption('#chType', t); await pg.waitForTimeout(120);
    A(await pg.isVisible('#chart svg') && (await pg.$$('#chart svg rect, #chart svg path, #chart svg polygon')).length >= 2, 'graphique ' + t + ' : SVG affiché');
  }
  await pg.selectOption('#chType', 'scatter'); await pg.waitForTimeout(120);
  A(await pg.isHidden('#chart svg') && /deuxième valeur/.test(await pg.textContent('#chNote')) && await pg.isHidden('#chK2'), 'nuage de points : une seule valeur → message d\'aide');
  await gadd('Habitants', 'vals'); await pg.waitForTimeout(200);
  A(await pg.isVisible('#chK2') && await pg.isVisible('#chart svg') && /R²/.test(await pg.textContent('#chNote')), 'nuage de points : deux valeurs → sélecteur de 2e valeur, nuage et R²');
  await pg.selectOption('#chType', 'gauge'); await pg.waitForTimeout(120);
  A(await pg.isVisible('#chG') && /Maximum automatique/.test(await pg.textContent('#chNote')), 'jauges : champ « Objectif » visible');
  await pg.fill('#chG', '800'); await pg.dispatchEvent('#chG', 'change'); await pg.waitForTimeout(120);
  A(/Maximum fixé à 800/.test(await pg.textContent('#chNote')) && await pg.evaluate(() => JSON.parse(localStorage.getItem('statbel_pivot_chart')).gmax === 800), 'jauges : objectif fixé et mémorisé');
  await pg.selectOption('#chType', 'map'); await pg.waitForFunction(() => !!window.PIVOT_GEO_DATA, null, { timeout: 8000 }); await pg.waitForTimeout(300);
  A(await pg.isVisible('#chart svg') && (await pg.$$('#chart svg circle')).length >= 4 && /lieu\(x\) placé/.test(await pg.textContent('#chNote')), 'carte : fonds de carte chargés à la demande, communes localisées (bulles)');
  const pngOk = await Promise.all([pg.waitForEvent('download'), xclick(pg, '#chPng')]).then(async ([dl]) => { const buf = fs.readFileSync(await dl.path()); return buf[0] === 0x89 && buf.length > 3000; });
  A(pngOk, 'carte : export PNG valide');
  // Options de graphique dans l'interface : étiquettes, combiné, 100 %, pyramide ; mémorisées
  await pg.selectOption('#chType', 'bar'); await pg.waitForTimeout(150);
  A(await pg.isVisible('#btnChOpts') && await pg.isHidden('#chOpts') && await pg.isHidden('#coLab'), 'options du graphique : bouton « ⚙ Graphique » dès qu\'un graphique est choisi, panneau fermé par défaut');
  await pg.click('#btnChOpts'); await pg.waitForTimeout(300);
  A(await pg.isVisible('#chOpts') && await pg.isVisible('#coLab') && await pg.isVisible('#coPal') && await pg.getAttribute('#btnChOpts', 'aria-expanded') === 'true', 'options du graphique : le bouton ouvre le panneau latéral (réglages visibles)');
  A(await pg.evaluate(() => { const E = window.PivotChartEditor, ids = [...document.querySelectorAll('#coBox [data-opt]:not(label)')].map(x => x.id); return ids.length === E.DEFS.length && E.DEFS.every(d => ids.includes(E.PANEL_ID[d.key])); }), 'éditeur commun : le panneau du Pivot est généré par les mêmes définitions que la fenêtre de tuile (une option par définition, mêmes clés)');
  await pg.click('#cpClose'); await pg.waitForTimeout(300);
  A(await pg.isHidden('#coLab') && await pg.isHidden('#chOpts'), 'options du graphique : ✕ ferme le panneau');
  await pg.click('#btnChOpts'); await pg.waitForTimeout(250); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  A(await pg.isHidden('#chOpts'), 'options du graphique : Échap ferme le panneau');
  await pg.click('#btnChOpts'); await pg.waitForTimeout(300);
  await pg.selectOption('#coLab', 'both'); await pg.waitForTimeout(150);
  A(/\(\d+(,\d+)? %\)/.test(await pg.textContent('#chart svg')), 'options : étiquettes « valeur + % » affichées sur les barres');
  await pg.selectOption('#chType', 'combo'); await pg.waitForTimeout(150);
  A(await pg.isVisible('#chK2') && (await pg.$$('#chart svg circle')).length >= 4 && /Habitants/.test(await pg.textContent('#chart svg')), 'combiné : 2e valeur proposée, ligne tracée sur l\'axe de droite');
  await pg.selectOption('#chType', 'stack100'); await pg.waitForTimeout(150);
  A(/100 %/.test(await pg.textContent('#chart svg')), 'colonnes empilées 100 % : axe en pourcentage');
  await gadd('Année', 'cols'); await pg.waitForTimeout(200);
  await pg.selectOption('#chType', 'pyramid'); await pg.waitForTimeout(150);
  A(await pg.isVisible('#chart svg') && /2023/.test(await pg.textContent('#chart svg')) && /2024/.test(await pg.textContent('#chart svg')) && (await pg.$$('#chart svg rect[fill^="#"]')).length >= 8, 'pyramide : les 2 modalités de la colonne face à face');
  await pg.fill('#coTitle', 'Ma pyramide'); await pg.dispatchEvent('#coTitle', 'change'); await pg.selectOption('#coPal', 'pastel'); await pg.waitForTimeout(150);
  A(/Ma pyramide/.test(await pg.textContent('#chart svg')) && await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('statbel_pivot_chart')).o; return o.title === 'Ma pyramide' && o.pal === 'pastel' && o.lab === 'both'; }), 'options : titre et palette appliqués, mémorisés');
  await pg.selectOption('#coTAl', 'center'); await pg.selectOption('#coTVe', 'bottom'); await pg.selectOption('#chType', 'bar'); await pg.fill('#coBar', '40'); await pg.dispatchEvent('#coBar', 'change'); await pg.waitForTimeout(150);
  A(/text-anchor="middle" font-weight="700"/.test(await pg.innerHTML('#chart')) && await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('statbel_pivot_chart')).o; return o.talign === 'center' && o.tvert === 'bottom' && o.bar === 40; }), 'options : position du titre et épaisseur des barres appliquées et mémorisées');
  await pg.waitForTimeout(1500); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(900);
  A(await pg.inputValue('#coTAl') === 'center' && await pg.inputValue('#coBar') === '40' && await pg.inputValue('#coLab') === 'both' && await pg.inputValue('#coPal') === 'pastel' && await pg.inputValue('#coTitle') === 'Ma pyramide', 'options : retrouvées après rechargement');
  // Options contextuelles : seules les options utiles au type sont affichées, les réglages masqués sont conservés
  const cv = id => pg.evaluate(x => { const el = document.getElementById(x), l = el && el.closest('label'), sec = el && el.closest('details.sec'); return !!l && l.style.display !== 'none' && !(sec && sec.hidden); }, id);   // réglage proposé pour ce type (indépendant de l'état replié des sections)
  await cpo(pg); await pg.evaluate(() => document.querySelectorAll('#coBox details.sec').forEach(d => { d.open = true; }));   // panneau refermé par le rechargement ; sections dépliées pour les réglages ci-dessous
  await pg.selectOption('#chType', 'pie'); await pg.waitForTimeout(100);
  A(await cv('coZoom') && await cv('coLab') && await cv('coTitle') && !await cv('coBar') && !await cv('coHole') && !await cv('coGrid') && !await cv('coTrend') && !await cv('coMin') && /non applicable/.test(await pg.textContent('#coHidden')), 'options contextuelles : secteurs → zoom/étiquettes/titre, pas d\'axes ni d\'épaisseur de barres');
  await pg.selectOption('#chType', 'donut'); await pg.waitForTimeout(100);
  A(await cv('coHole') && await cv('coZoom') && !await cv('coScale'), 'options contextuelles : anneau → trou de l\'anneau en plus');
  await pg.selectOption('#chType', 'scatter'); await pg.waitForTimeout(100);
  A(await cv('coTrend') && !await cv('coGrid') && !await cv('coBar') && !await cv('coSmooth') && !await cv('coLab'), 'options contextuelles : nuage de points → tendance, pas de quadrillage ni de barres');
  await pg.selectOption('#chType', 'line'); await pg.waitForTimeout(100);
  A(await cv('coTrend') && await cv('coSmooth') && await cv('coScale') && !await cv('coBar') && !await cv('coTrendWindow') && !await cv('coTrendEq'), 'options contextuelles : courbes → tendance et échelle ; fenêtre / équation seulement si utiles');
  await pg.selectOption('#coTrend', 'ma'); await pg.waitForTimeout(100);
  A(await cv('coTrendWindow') && !await cv('coTrendEq'), 'options contextuelles : moyenne mobile → fenêtre affichée, équation masquée');
  await pg.selectOption('#coTrend', 'poly2'); await pg.waitForTimeout(100);
  A(!await cv('coTrendWindow') && await cv('coTrendEq'), 'options contextuelles : polynôme → équation affichée, fenêtre masquée');
  await pg.selectOption('#chType', 'bar'); await pg.waitForTimeout(100);
  A(await cv('coBar') && await cv('coGrid') && !await cv('coTrend') && !await cv('coScale') && await pg.inputValue('#coBar') === '40' && await pg.evaluate(() => JSON.parse(localStorage.getItem('statbel_pivot_chart')).o.trend === 'poly2'), 'options contextuelles : retour aux barres → réglages d\'avant conservés (épaisseur 40, tendance mémorisée mais masquée)');
  await ctxG.close();

  // Tuile indépendante des filtres globaux : bouton, effet, liste non limitée, sauvegarde / restauration
  { const ctxG = await b.newContext({ viewport: { width: 1500, height: 900 } }), pg2 = await ctxG.newPage();
    pg2.on('pageerror', e => errs.push(e.message));
    await pg2.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pg2.setInputFiles('#fileIn', [{ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Parité;Nb\nA;x;1\nB;y;2\nC;z;4\n') }]); await pg2.waitForTimeout(700);
    const gadd = (l, z) => pg2.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await gadd('Région', 'rows'); await gadd('Nb', 'vals'); await pg2.selectOption('#chType', 'hbar'); await pg2.waitForTimeout(200);
    await pg2.evaluate(() => { document.querySelector('#viewTabs [data-vact="dup"]').click(); }); await pg2.waitForTimeout(300);
    await pg2.evaluate(() => document.querySelector('#viewTabs [data-vact="dash"]').click()); await pg2.waitForTimeout(500);
    const noG = await pg2.$$('#dash .tile [data-tact="glob"]');
    await addFilter(pg2, 'Région', 'global', 'dash');
    await pg2.selectOption('#dash select[data-gsel]', 'A'); await pg2.waitForTimeout(500);
    const tiles = () => pg2.evaluate(() => [...document.querySelectorAll('#dash .tile .tbody')].map(x => (x.textContent || '').replace(/\s+/g, ' ')));
    const t1 = await tiles();
    A(noG.length === 0 && (await pg2.$$('#dash .tile [data-tact="glob"]')).length === 2 && t1.length === 2 && t1.every(x => /A/.test(x) && !/ B| C/.test(x)), 'tuile indépendante : bouton visible seulement s\'il existe un filtre global ; le filtre global s\'applique à toutes les tuiles par défaut');
    await pg2.click('#dash .tile [data-tact="glob"]'); await pg2.waitForTimeout(500);
    const t2 = await tiles();
    A(/B/.test(t2[0]) && /C/.test(t2[0]) && !/ B| C/.test(t2[1]) && await pg2.getAttribute('#dash .tile [data-tact="glob"]', 'aria-pressed') === 'true', 'tuile indépendante : la tuile qui ignore les filtres globaux montre toutes ses données, l\'autre reste filtrée');
    await pg2.waitForTimeout(1500); await pg2.reload({ waitUntil: 'load' }); await pg2.waitForTimeout(1400);
    A(await pg2.evaluate(() => __pivot.st.views[0].ng === true && !__pivot.st.views[1].ng) , 'tuile indépendante : retrouvée après rechargement (session)');
    await ctxG.close(); }
  // Champ du graphique : le graphique ne garde que Commune + valeur, Région / Province ne servent plus qu'à filtrer
  { const ctxC = await b.newContext({ viewport: { width: 1500, height: 900 } }), pc = await ctxC.newPage();
    pc.on('pageerror', e => errs.push(e.message));
    await pc.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pc.setInputFiles('#fileIn', [{ name: 'c.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Province;Commune;Nb\nFlandre;Anvers;Anvers;10\nFlandre;Anvers;Malines;5\nFlandre;Limbourg;Hasselt;7\nWallonie;Liège;Liège;8\nWallonie;Namur;Namur;3\n') }]); await pc.waitForTimeout(700);
    const cadd = (l, z) => pc.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await cadd('Région', 'rows'); await cadd('Commune', 'rows'); await cadd('Nb', 'vals'); await pc.selectOption('#chType', 'hbar'); await pc.waitForTimeout(300);
    const ctxt = () => pc.$eval('#chart', e => e.textContent);
    const c0 = await ctxt();
    await cpo(pc); await pc.selectOption('#coCdim', { label: 'Commune' }); await pc.waitForTimeout(400);
    const c1 = await ctxt(), tbl = await pc.$eval('#out', e => e.textContent);
    A(/Flandre › Anvers/.test(c0) && /Liège/.test(c1) && !/›/.test(c1) && /par Commune/.test(c1) && /Flandre/.test(tbl) && /Hasselt/.test(tbl), 'champ du graphique : le graphique ne garde que Commune (sans « Région › »), le tableau croisé reste inchangé');
    await addFilter(pc, 'Région', 'view', 'view');
    await pc.selectOption('#selBar select[data-sel]', 'Flandre'); await pc.waitForTimeout(500);
    const c2 = await ctxt();
    A(/Hasselt/.test(c2) && /Malines/.test(c2) && !/Liège|Namur/.test(c2), 'champ du graphique : un champ absent du graphique (Région) filtre bien via un sélecteur');
    await pc.selectOption('#coCdim2', { label: 'Province' }); await pc.waitForTimeout(400);
    A(/Limbourg/.test(await ctxt()) && /Anvers/.test(await ctxt()), 'champ du graphique : séries facultatives (une série par Province)');
    await pc.evaluate(() => document.querySelector('#viewTabs [data-vact="dash"]').click()); await pc.waitForTimeout(500);
    await pc.click('#dash .tile [data-tact="chart"]'); await pc.waitForTimeout(200);
    await pc.selectOption('#ce_cdim', { label: 'Province' }); await pc.selectOption('#ce_cdim2', ''); await pc.waitForTimeout(300);
    const pvw = await pc.$eval('#ce_svg', e => e.textContent);
    A(/Limbourg/.test(pvw) && !/›|Hasselt/.test(pvw), 'fenêtre de tuile : l\'aperçu suit le champ du graphique choisi (Province)');
    await pc.click('#ce_save'); await pc.waitForTimeout(500);
    const tt = await pc.$eval('#dash .tile .tbody', e => e.textContent);
    A(/Limbourg/.test(tt) && !/Hasselt/.test(tt), 'champ du graphique : appliqué à la tuile du tableau de bord');
    await pc.waitForTimeout(1500); await pc.reload({ waitUntil: 'load' }); await pc.waitForTimeout(1400);
    A(await pc.evaluate(() => { const c = __pivot.st.views[0].ch || {}; return !!(c.o && c.o.cdim); }), 'champ du graphique : retrouvé après rechargement (session)');
    await ctxC.close(); }
  // Tuile = UN contenu (graphique OU tableau) : bascule ⇄, mêmes champs, persistance ; ancien mode « graphique + tableau » migré en deux tuiles
  { const ctxB = await b.newContext({ viewport: { width: 1500, height: 900 } }), pb2 = await ctxB.newPage();
    pb2.on('pageerror', e => errs.push(e.message));
    await pb2.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pb2.setInputFiles('#fileIn', [{ name: 'b.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nFlandre;Malines;5\nWallonie;Liège;8\n') }]); await pb2.waitForTimeout(700);
    const badd = (l, z) => pb2.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await badd('Commune', 'rows'); await badd('Nb', 'vals'); await pb2.selectOption('#chType', 'hbar'); await pb2.waitForTimeout(200);
    await pb2.evaluate(() => document.querySelector('#viewTabs [data-vact="dash"]').click()); await pb2.waitForTimeout(500);
    const bst = () => pb2.evaluate(() => { const t = document.querySelector('#dash .tile'), bd = t.querySelector('.tbody'); return { svg: !!bd.querySelector('svg'), tbl: !!bd.querySelector('table'), gear: !!t.querySelector('[data-tact="chart"]'), txt: bd.textContent }; });
    const s0 = await bst();
    await pb2.click('#dash .tile [data-tact="mode"]'); await pb2.waitForTimeout(500);
    const s1 = await bst();
    await pb2.click('#dash .tile [data-tact="mode"]'); await pb2.waitForTimeout(400);
    const s2 = await bst();
    A(s0.svg && !s0.tbl && s0.gear && !s1.svg && s1.tbl && !s1.gear && /Anvers/.test(s1.txt) && /Malines/.test(s1.txt) && s2.svg && !s2.tbl, 'tuile : le bouton ⇄ bascule graphique ⇄ tableau (un seul contenu à la fois, mêmes lignes et valeurs)');
    await pb2.click('#dash .tile [data-tact="mode"]'); await pb2.waitForTimeout(400);
    await pb2.waitForTimeout(1500); await pb2.reload({ waitUntil: 'load' }); await pb2.waitForTimeout(1400);
    A(await pb2.evaluate(() => __pivot.st.views[0].tile === 'table') && (await bst()).tbl, 'tuile : contenu retrouvé après rechargement (session)');
    A(/Nouvelle tuile/.test(await pb2.textContent('#dash .newtile')), 'tableau de bord : « ＋ Nouvelle tuile »');
    await vact(pb2, 'dash'); await pb2.waitForTimeout(300);   // niveau 2 (vue ouverte)
    await pb2.evaluate(() => { while (__pivot.st.views.length < 12) document.querySelector('#vmenu [data-vact="add"]').click(); });
    await pb2.waitForTimeout(300);
    const n12 = await pb2.evaluate(() => __pivot.st.views.length);
    await pb2.evaluate(() => { document.querySelector('#msg').textContent = ''; document.querySelector('#amenu [data-vact="dup"]').click(); });
    await pb2.waitForTimeout(300);
    A(n12 === 12 && await pb2.evaluate(() => __pivot.st.views.length) === 12 && /Limite de 12 tuiles/.test(await pb2.textContent('#msg')), 'limite de 12 tuiles : dupliquer / ajouter affiche un message (au lieu de ne rien faire)');
    await ctxB.close(); }
  { // migration : l'ancien mode « graphique + tableau » devient deux tuiles (graphique, puis tableau), vue courante recalculée
    const mk = (n, tile) => ({ name: n, layout: { rows: [], cols: [], vals: [], filters: {}, sort: null }, chart: null, sel: [], ng: false, tile, span: 1, h: 2 });
    const raw = { v: 1, sources: [], over: {}, views: [mk('A', 'chart'), mk('B', 'both'), mk('C', 'table')], cur: 2, dash: { on: true, cols: 0, sel: [] } };
    const st = SSM.sanitizeState(JSON.parse(JSON.stringify(raw)));
    A(st.views.map(v => v.name + ':' + v.tile).join() === 'A:chart,B:chart,B (tableau):table,C:table' && st.cur === 3, 'migration : « graphique + tableau » → deux tuiles (graphique, puis tableau), vue courante conservée');
    const full = Array.from({ length: SSM.MAX_VIEWS }, (_, i) => mk('V' + i, i === 0 ? 'both' : 'chart'));
    const st2 = SSM.sanitizeState({ v: 1, sources: [], over: {}, views: full, cur: 0, dash: { on: false, cols: 0, sel: [] } });
    A(st2.views.length === SSM.MAX_VIEWS && st2.views[0].tile === 'chart' && st2.views.every(v => v.tile !== 'both'), 'migration : au plafond de tuiles, la tuile « les deux » garde son graphique (pas de dépassement)'); }
  // Panneau « ⚙ Tableau » : réglages du tableau par tuile, un seul tiroir à la fois, bouton sur la tuile « tableau »
  { const ctxT = await b.newContext({ viewport: { width: 1400, height: 900 } }), pt = await ctxT.newPage();
    pt.on('pageerror', e => errs.push(e.message));
    await pt.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pt.setInputFiles('#fileIn', [{ name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nFlandre;Malines;5\nWallonie;Liège;8\n') }]); await pt.waitForTimeout(700);
    const tadd = (l, z) => pt.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await tadd('Commune', 'rows'); await tadd('Nb', 'vals'); await pt.waitForTimeout(300);
    const ids = ['optRowTot', 'optColTot', 'optSub', 'optDec', 'optTopN', 'optTopMode', 'optTopOthers', 'optStyle', 'optDensity', 'optColW', 'optFreeze', 'optWrap', 'optCap', 'optCapH', 'optCapV', 'optCf'];
    const where = await pt.evaluate(ids => ids.map(i => ({ i, tb: !!document.getElementById(i).closest('#tbOpts'), zones: !!document.getElementById(i).closest('#cfgZones') })), ids);
    A(where.every(x => x.tb && !x.zones), 'panneau ⚙ Tableau : tous les réglages du tableau (totaux, décimales, Top N, mise en forme) sont dans le panneau, plus dans la carte des zones');
    A(await pt.isVisible('#btnTbOpts') && await pt.isHidden('#tbOpts') && (await pt.$$eval('#tbOpts details.sec > summary', e => e.map(x => x.textContent.trim()))).join('|') === 'Totaux et décimales|Top N|Mise en forme', 'panneau ⚙ Tableau : fermé au départ, trois sections');
    await pt.click('#btnTbOpts'); await pt.waitForTimeout(250);
    A(await pt.isVisible('#tbOpts') && await pt.isVisible('#optStyle') && await pt.getAttribute('#btnTbOpts', 'aria-expanded') === 'true', 'panneau ⚙ Tableau : s\'ouvre avec le bouton');
    const before = await pt.evaluate(() => document.querySelectorAll('#out tr').length);
    await pt.uncheck('#optColTot'); await pt.waitForTimeout(250);
    A(await pt.evaluate(() => document.querySelectorAll('#out tr').length) === before - 1, 'panneau ⚙ Tableau : un réglage (total en bas) s\'applique en direct');
    await pt.keyboard.press('Escape'); await pt.waitForTimeout(250);
    A(await pt.isHidden('#tbOpts') && await pt.evaluate(() => document.activeElement && document.activeElement.id === 'btnTbOpts'), 'panneau ⚙ Tableau : Échap le ferme (focus rendu au bouton)');
    await pt.selectOption('#chType', 'bar'); await pt.waitForTimeout(300);
    await pt.click('#btnTbOpts'); await pt.waitForTimeout(200); await xclick(pt, '#btnChOpts'); await pt.waitForTimeout(250);
    A(await pt.evaluate(() => document.body.classList.contains('cp-open') && !document.body.classList.contains('tp-open')), 'tiroirs : ouvrir ⚙ Graphique ferme ⚙ Tableau (un seul à la fois)');
    await xclick(pt, '#btnTbOpts'); await pt.waitForTimeout(250);
    A(await pt.evaluate(() => document.body.classList.contains('tp-open') && !document.body.classList.contains('cp-open')), 'tiroirs : ouvrir ⚙ Tableau ferme ⚙ Graphique');
    await pt.keyboard.press('Escape'); await pt.selectOption('#chType', 'none'); await pt.waitForTimeout(200);
    // tuile « tableau » du tableau de bord : le bouton ⚙ Tableau ouvre la tuile avec son panneau
    await vact(pt, 'dash'); await pt.waitForTimeout(400);
    A(await pt.isVisible('#dash .tile [data-tact="tbl"]') && (await pt.$$('#dash .tile [data-tact="chart"]')).length === 0, 'tuile « tableau » : bouton ⚙ Tableau (pas de ⚙ Graphique)');
    await pt.click('#dash .tile [data-tact="tbl"]'); await pt.waitForTimeout(400);
    A(await pt.evaluate(() => !document.body.classList.contains('d-dash') && document.body.classList.contains('tp-open')) && await pt.isVisible('#tbOpts'), 'tuile « tableau » : ⚙ Tableau ouvre la tuile avec le panneau des options du tableau');
    await vact(pt, 'dash'); await pt.waitForTimeout(300);
    A(await pt.evaluate(() => !document.body.classList.contains('tp-open')), 'panneau ⚙ Tableau : fermé en revenant au tableau de bord');
    await ctxT.close(); }
  // Liste des champs : rubriques Dimensions / Mesures
  { const ctxD = await b.newContext({ viewport: { width: 1400, height: 900 } }), pd2 = await ctxD.newPage();
    pd2.on('pageerror', e => errs.push(e.message));
    await pd2.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pd2.setInputFiles('#fileIn', [{ name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Année;Mois;Nb\nFlandre;Anvers;2023;jan;10\nWallonie;Liège;2024;fév;8\n') }]); await pd2.waitForTimeout(700);
    const grpOf = () => pd2.evaluate(() => { const out = {}; let cur = ''; [...document.querySelectorAll('#fields > *')].forEach(e => { if (e.classList.contains('fgrp')) { cur = e.textContent.trim().split(' ')[0]; out[cur] = []; } else if (e.classList.contains('fld')) out[cur].push(e.querySelector('.fl').textContent); }); return out; });
    const g0 = await grpOf();
    A(g0.Dimensions && g0.Mesures && ['Région', 'Commune', 'Source'].every(x => g0.Dimensions.includes(x)) && g0.Mesures.includes('Nb') && g0.Mesures.includes('Nombre de lignes (∗)') && g0.Mesures.includes('Année'), 'champs : Dimensions (texte) et Mesures (nombres, nombre de lignes) ; une année numérique est d\'abord une mesure');
    await xclick(pd2, '#btnWiz'); await pd2.click('#wzSteps [data-wz="3"]'); await pd2.click('#wzHierDetect'); await pd2.waitForTimeout(250);
    const g1 = await grpOf();
    A(g1.Dimensions.includes('Année') && !g1.Mesures.includes('Année') && g1.Mesures.includes('Nb'), 'champs : un champ numérique qui est niveau d\'une hiérarchie (Année) devient une dimension');
    await pd2.evaluate(() => document.querySelector('#dlgWiz').close());
    await ctxD.close(); }
  // Navigation entre tuiles : clic sur une tuile, flèches précédent / suivant
  { const ctxN = await b.newContext({ viewport: { width: 1400, height: 900 } }), pnv = await ctxN.newPage();
    pnv.on('pageerror', e => errs.push(e.message));
    await pnv.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pnv.setInputFiles('#fileIn', [{ name: 'n.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nWallonie;Liège;8\n') }]); await pnv.waitForTimeout(700);
    const nadd = (l, z) => pnv.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await nadd('Commune', 'rows'); await nadd('Nb', 'vals'); await pnv.waitForTimeout(200);
    await pnv.evaluate(() => { document.querySelector('#vmenu [data-vact="add"]').click(); document.querySelector('#vmenu [data-vact="add"]').click(); });
    await pnv.waitForTimeout(300);
    const curName = () => pnv.evaluate(() => __pivot.st.views.find(v => v.id === __pivot.st.curView).name), nv = await pnv.evaluate(() => __pivot.st.views.length);
    A(nv === 3 && await pnv.isVisible('[data-vact="prev"]') && await pnv.isVisible('[data-vact="next"]'), 'navigation : flèches ‹ › visibles dans une tuile ouverte (plusieurs tuiles)');
    const n0 = await curName();
    await pnv.click('[data-vact="next"]'); await pnv.waitForTimeout(250);
    const n1 = await curName();
    await pnv.click('[data-vact="prev"]'); await pnv.waitForTimeout(250);
    const n2 = await curName();
    await pnv.click('[data-vact="prev"]'); await pnv.waitForTimeout(250);
    const n3 = await curName();
    A(n1 !== n0 && n2 === n0 && n3 !== n0 && n3 !== n1, 'navigation : suivante / précédente changent de tuile, circulaire (de la première on revient à la dernière)');
    await vact(pnv, 'dash'); await pnv.waitForTimeout(400);
    A((await pnv.$$('[data-vact="prev"]')).length === 0, 'navigation : pas de flèches au tableau de bord');
    const target = await pnv.evaluate(() => __pivot.st.views[1].id);
    await pnv.click('#dash .tile[data-view="' + target + '"] .tbody', { position: { x: 20, y: 20 } }); await pnv.waitForTimeout(400);
    A(await pnv.evaluate(t => !document.body.classList.contains('d-dash') && __pivot.st.curView === t, target), 'navigation : un clic sur le corps d\'une tuile du tableau de bord l\'ouvre');
    await vact(pnv, 'dash'); await pnv.waitForTimeout(400);
    await pnv.click('#dash .tile [data-tact="wide"]'); await pnv.waitForTimeout(250);
    A(await pnv.evaluate(() => document.body.classList.contains('d-dash')), 'navigation : un clic sur un bouton de la tuile (↔) ne l\'ouvre pas');
    await ctxN.close(); }
  A(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close();
  srv.close && srv.close();
  console.log(fails ? fails + ' échec(s)' : 'OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('pivot-tool diagnostic:', e && (e.stack || e)); process.exit(1); });
