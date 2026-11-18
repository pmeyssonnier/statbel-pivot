/*
 * Test de l'outil Tableaux croisés — index.html — Projets, assistant « Projet », grand écran, actualisation, mobile, sélecteurs, onglets de vues, accordéons, navigation à deux niveaux et menus
 * (Découpé de l'ancien tests/pivot-tool.test.js en suites indépendantes, exécutées en parallèle : seule la
 *  couverture de la page par scénarios change, pas son contenu.)
 *
 * Lancer :  CHROMIUM_PATH=… node tests/pivot-tool-projets.test.js
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
// Assistant « Projet » : ouvre la fenêtre à une étape / la ferme
const wzOpen = async (p, step) => { await p.evaluate(n => { document.querySelector('#btnWiz').click(); document.querySelector('#wzSteps [data-wz="' + n + '"]').click(); }, step || 1); await p.waitForTimeout(150); };
const wzClose = p => p.evaluate(() => { const d = document.querySelector('#dlgWiz'); if (d.open) d.close(); });
const vact = (p, act) => p.evaluate(x => document.querySelector('#viewTabs [data-vact="' + x + '"]').click(), act);
const vtext = (p, txt) => p.evaluate(x => [...document.querySelectorAll('#viewTabs .vt')].find(e => e.textContent === x).click(), txt);
const vhas = async (p, act) => (await p.$('#viewTabs [data-vact="' + act + '"]')) !== null;
const cpo = p => p.evaluate(() => { if (!document.body.classList.contains('cp-open')) document.getElementById('btnChOpts').click(); });   // ouvre le panneau « ⚙ Graphique » (tiroir)

// ---------- UI ----------
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-'));
  const mk = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Feuil1'); const f = path.join(dir, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; };
  const f1 = mk('a.xlsx', [['Commune', 'Trimestre', 'Nombre d\'établissements'], ['Anvers', '2024-T4', 100], ['Boom', '2024-T4', 10], ['Anvers', '2024-T3', 90]]);
  const f2 = mk('b.xlsx', [['commune', 'Trim.', 'Nb établissements'], ['Anvers', '2024-T4', 7], ['Gand', '2024-T4', 5]]);
  const srv = await serve();
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const errs = [];
  // Réordonner les onglets de vues : boutons ◂ ▸ et glisser-déposer ; ordre mémorisé et repris par le tableau de bord
  const ctxO = await b.newContext({ viewport: { width: 1600, height: 900 } }), po = await ctxO.newPage();
  po.on('pageerror', e => errs.push(e.message));
  await po.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await po.setInputFiles('#fileIn', [f1, f2]); await po.waitForTimeout(400);
  const otabs = () => po.$$eval('#viewTabs .vt', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join('|'));
  A(!(await vhas(po, 'left')), 'onglets : pas de déplacement avec une seule vue');
  await vact(po, 'add'); await vact(po, 'add'); await po.waitForTimeout(100);
  A(await otabs() === 'Vue 1|Vue 2|Vue 3*' && await po.isDisabled('#viewTabs [data-vact="right"]') && await po.isEnabled('#viewTabs [data-vact="left"]'), 'onglets : trois vues, « ▸ » désactivé sur la dernière');
  await vtext(po, 'Vue 1'); await po.waitForTimeout(100);
  A(await po.isDisabled('#viewTabs [data-vact="left"]'), 'onglets : « ◂ » désactivé sur la première');
  await vact(po, 'right'); await po.waitForTimeout(100);
  A(await otabs() === 'Vue 2|Vue 1*|Vue 3', 'onglets : « ▸ » déplace la vue active vers la droite (elle reste active)');
  await vact(po, 'left'); await vact(po, 'left').catch(() => {}); await po.waitForTimeout(100);
  A(await otabs() === 'Vue 1*|Vue 2|Vue 3', 'onglets : « ◂ » ramène la vue (arrêt en première position)');
  await vtext(po, 'Vue 2'); await vact(po, 'right'); await po.waitForTimeout(100);
  await vact(po, 'dash'); await po.waitForTimeout(250);
  A(await po.$$eval('#dash .tile b', e => e.map(x => x.textContent).join('|')) === 'Vue 1|Vue 3|Vue 2', 'onglets : le tableau de bord suit le nouvel ordre');
  await po.waitForTimeout(1300);
  await po.reload({ waitUntil: 'load' }); await po.waitForTimeout(1000);
  A(await otabs() === 'Vue 1|Vue 3|Vue 2*', 'onglets : ordre et vue active retrouvés après actualisation de la page');
  await ctxO.close();

  // Accordéons : Sources, Champs, zones de configuration
  const ctxC = await b.newContext({ viewport: { width: 1500, height: 900 } }), pc = await ctxC.newPage();
  pc.on('pageerror', e => errs.push(e.message));
  await pc.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pc.setInputFiles('#fileIn', [f1, f2]); await pc.waitForTimeout(400);
  const IDS = ['accFld', 'accZ_filters', 'accZ_cols', 'accZ_rows', 'accZ_vals'];
  const accOpen = () => pc.evaluate(ids => ids.map(id => document.getElementById(id).open).join(), IDS);
  A(await accOpen() === 'true,true,true,true,true' && await pc.isVisible('#fields') && await pc.isVisible('.zone[data-zone="rows"] .zc'), 'accordéons : Champs et les 4 zones ouverts par défaut');
  A((await pc.$$eval('.zone > summary', e => e.map(x => x.firstChild.textContent.trim()).join('|'))) === 'Filtres|Colonnes|Lignes|Valeurs' && await pc.isHidden('#accZones'), 'accordéons : chaque zone a son propre titre (Filtres, Colonnes, Lignes, Valeurs), plus de titre groupé');
  A(/feuille/.test(await pc.textContent('#wzSrcInfo')) && /\d/.test(await pc.textContent('#accFldInfo')) && /· 1/.test(await pc.textContent('#accInfo_rows')) && await pc.textContent('#accInfo_cols') === '', 'accordéons : résumé dans le titre (feuilles, champs, nombre de champs d\'une zone non vide)');
  await pc.click('#accFld > summary'); await pc.waitForTimeout(50);
  A(await pc.isHidden('#fields') && await pc.isHidden('#fieldSearch') && await pc.isVisible('.zone[data-zone="rows"] .zc'), 'accordéons : replier « Champs » ne masque que cette section');
  await pc.click('#accZ_rows > summary'); await pc.waitForTimeout(50);
  A(await pc.isHidden('.zone[data-zone="rows"] .zc') && await pc.isVisible('.zone[data-zone="vals"] .zc') && await pc.isVisible('#btnTbOpts'), 'accordéons : une zone repliable séparément ; les autres zones et les réglages restent visibles');
  await pc.reload({ waitUntil: 'load' }); await pc.waitForTimeout(800);
  A(await accOpen() === 'false,true,true,false,true', 'accordéons : états ouvert/fermé mémorisés après actualisation de la page');
  await pc.click('#accZ_rows > summary'); await pc.click('#accFld > summary'); await pc.waitForTimeout(50);
  A(await accOpen() === 'true,true,true,true,true' && await pc.isVisible('#fields') && await pc.isVisible('.zone[data-zone="rows"] .zc'), 'accordéons : réouverture');
  await ctxC.close();

  // Projets : enregistrer un tableau de bord complet, en créer un nouveau (vide), ouvrir, dupliquer, exporter, importer
  const ctxP = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }), pp = await ctxP.newPage();
  pp.on('pageerror', e => errs.push(e.message));
  await pp.goto(srv.url + '/index.html', { waitUntil: 'load' });
  A(/Projet 1/.test(await pp.textContent('#btnProj')), 'projets : « Projet 1 » proposé au premier lancement');
  await pp.setInputFiles('#fileIn', [f1]); await pp.waitForTimeout(400);
  const padd2 = (l, z) => pp.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await padd2('Commune', 'rows'); await padd2('Nombre d\'établissements', 'vals');
  await pp.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click());
  await pp.selectOption('#chType', 'bar');
  await vact(pp, 'add'); await padd2('Trimestre', 'rows'); await pp.selectOption('#chType', 'pie');
  await wzOpen(pp, 3); await pp.evaluate(() => { document.getElementById('detCalc').open = true; });
  await pp.fill('#cName', 'Moyenne ligne'); await pp.fill('#cFormula', "[Nombre d'établissements] / [Nombre de lignes]"); await pp.click('#cSave');
  await pp.waitForTimeout(1400); await wzClose(pp);
  await pp.click('#btnProj'); await pp.waitForTimeout(150);
  A(await pp.isVisible('#dlgProj') && (await pp.$$('#projList .pl')).length === 1 && /ouvert/.test(await pp.textContent('#projList')) && /1 feuille/.test(await pp.textContent('#projList')) && /500|3 ligne/.test(await pp.textContent('#projList')), 'projets : liste avec le projet ouvert (feuilles, lignes, date d\'enregistrement)');
  pp.once('dialog', d => d.accept('Établissements 2024'));
  await pp.click('#projList [data-pact="rename"]'); await pp.waitForTimeout(150);
  A(/Établissements 2024/.test(await pp.textContent('#projCur')) && /Établissements 2024/.test(await pp.textContent('#projList')), 'projets : renommer');
  await pp.fill('#projNewName', 'Autre analyse'); await pp.click('#projNew'); await pp.waitForTimeout(400);
  A(await pp.isVisible('#dlgWiz') && /Autre analyse/.test(await pp.textContent('#wzProj')) && await pp.isVisible('#wzAdd'), 'projets : un nouveau projet démarre par l\'assistant (étape Sources)');
  await wzClose(pp);
  A(await pp.isHidden('#dlgProj') && /Autre analyse/.test(await pp.textContent('#projCur')) && (await pp.$$('#sources .src')).length === 0 && (await pp.$$('#viewTabs .vt')).length === 1 && await pp.isHidden('#dash') && await pp.inputValue('#chType') === 'none' && /ajoutez vos sources/.test(await pp.textContent('#msg')), 'projets : « Nouveau projet » repart d\'un tableau de bord vide (aucun fichier, un seul onglet vide, pas de graphique)');
  A(!/Moyenne ligne/.test(await pp.textContent('#cList')) && await pp.evaluate(() => __pivot.st.views[0].name === 'Vue 1' && __pivot.st.L.rows.length === 0), 'projets : le nouveau projet n\'hérite ni des champs calculés ni de la disposition');
  await pp.setInputFiles('#fileIn', [f2]); await pp.waitForTimeout(400);
  A((await pp.$$('#sources .src')).length === 1 && /b\.xlsx/.test(await pp.textContent('#sources')), 'projets : chargement d\'un autre fichier source dans le nouveau projet');
  await pp.waitForTimeout(1400);
  await pp.reload({ waitUntil: 'load' }); await pp.waitForTimeout(1000);
  A(/Autre analyse/.test(await pp.textContent('#projCur')) && /b\.xlsx/.test(await pp.textContent('#sources')) && !/a\.xlsx/.test(await pp.textContent('#sources')), 'projets : après actualisation de la page, le projet ouvert est restauré');
  await pp.click('#btnProj'); await pp.waitForTimeout(150);
  A((await pp.$$('#projList .pl')).length === 2, 'projets : deux projets enregistrés');
  await pp.click('#projList .pl:has-text("Établissements 2024") [data-pact="open"]'); await pp.waitForTimeout(500);
  A(/Établissements 2024/.test(await pp.textContent('#projCur')) && /a\.xlsx/.test(await pp.textContent('#sources')) && !/b\.xlsx/.test(await pp.textContent('#sources')) && (await pp.$$('#viewTabs .vt')).length === 2 && /Moyenne ligne/.test(await pp.textContent('#cList')), 'projets : ouvrir retrouve fichier, onglets et champs calculés du projet');
  A(await pp.evaluate(() => __pivot.st.views[0].ch.type === 'bar' && __pivot.st.views[1].ch.type === 'pie'), 'projets : graphiques de chaque onglet retrouvés');
  await pp.click('#projList .pl.cur [data-pact="dup"]'); await pp.waitForTimeout(500);
  A((await pp.$$('#projList .pl')).length === 3 && /\(copie\)/.test(await pp.textContent('#projList')), 'projets : dupliquer');
  const [dlP] = await Promise.all([pp.waitForEvent('download'), pp.click('#projList .pl.cur [data-pact="export"]')]);
  const projJson = fs.readFileSync(await dlP.path(), 'utf8'), projObj = JSON.parse(projJson);
  const projFile = path.join(dir, 'projet-test.json'); fs.writeFileSync(projFile, projJson);
  A(dlP.suggestedFilename() === 'projet-Etablissements-2024.json' && projObj.kind === 'statbel-pivot-project' && projObj.state.views.length === 2 && Object.values(projObj.data.sources)[0].aoa.length > 2 && projObj.state.calcs.length === 1 && !/handle/.test(projJson), 'projets : export .json autonome (données, onglets, champs calculés ; sans lien vers le disque)');
  pp.once('dialog', d => d.accept());
  await pp.click('#projList .pl:has-text("(copie)") [data-pact="del"]'); await pp.waitForTimeout(300);
  A((await pp.$$('#projList .pl')).length === 2 && !/\(copie\)/.test(await pp.textContent('#projList')), 'projets : supprimer un autre projet');
  await pp.setInputFiles('#projFile', projFile); await pp.waitForTimeout(600);
  A((await pp.$$('#projList .pl')).length === 3 && /Établissements 2024/.test(await pp.textContent('#projCur')) && (await pp.$$('#viewTabs .vt')).length === 2 && /a\.xlsx/.test(await pp.textContent('#sources')), 'projets : import d\'un fichier exporté → nouveau projet ouvert (onglets et données retrouvés)');
  await pp.setInputFiles('#projFile', f1); await pp.waitForTimeout(300);
  A(/pas un projet|illisible/.test(await pp.textContent('#projMsg')), 'projets : import d\'un fichier qui n\'est pas un projet → message');
  pp.once('dialog', d => d.accept());
  await pp.click('#projList .pl.cur [data-pact="del"]'); await pp.waitForTimeout(600);
  A((await pp.$$('#projList .pl')).length === 2 && !/Établissements 2024.*ouvert/.test(await pp.textContent('#projList').then(t => t.replace(/\s+/g, ' '))) || (await pp.$$('#projList .pl')).length === 2, 'projets : supprimer le projet ouvert bascule sur un autre projet');
  await pp.click('#projClose');
  // reprise d'une ancienne session unique (avant les projets)
  await pp.waitForTimeout(1400);
  await pp.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('statbel-pivot', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const get = k => new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); });
    const idx = await get('projects'), d = await get(idx.cur + ':data'), st = await get(idx.cur + ':state');
    await new Promise(res => { const t = db.transaction('kv', 'readwrite'), o = t.objectStore('kv'); o.put(d, 'data'); o.put(st, 'state'); o.delete('projects'); o.delete(idx.cur + ':data'); o.delete(idx.cur + ':state'); t.oncomplete = res; });
    db.close();
  });
  await pp.reload({ waitUntil: 'load' }); await pp.waitForTimeout(1000);
  A(/Projet 1/.test(await pp.textContent('#projCur')) && (await pp.$$('#sources .src')).length >= 1, 'projets : une ancienne session unique est reprise comme « Projet 1 »');
  await ctxP.close();

  // Grand écran : tableau et graphique maximisés (mode agrandi, graphique à droite, en-têtes collants)
  const pd = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  pd.on('pageerror', e => errs.push(e.message));
  await pd.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pd.setInputFiles('#fileIn', [f1, f2]); await pd.waitForTimeout(400);
  await pd.evaluate(() => {
    const add = (l, z) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click();
    add('Commune', 'rows'); add('Trimestre', 'cols'); add('Nombre d\'établissements', 'vals');
  });
  await pd.waitForTimeout(150);
  const dvis = sel => pd.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
  A(await dvis('aside') && await dvis('#cfgZones') && await dvis('#btnFocus') && !(await dvis('#btnCfg')), 'grand écran : panneau, zones et bouton « Agrandir » visibles (pas de bouton mobile)');
  const col = await pd.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect(), a = r('aside'), z = r('#cfgZones'), t = r('#tview');
    return { ovA: getComputedStyle(document.querySelector('aside')).overflowY, ovF: getComputedStyle(document.querySelector('#fields')).overflowY, zRightOfA: z.left >= a.right - 1, zAboveT: z.bottom <= t.top + 1 && Math.abs(z.left - t.left) < 2, zTop: Math.abs(z.top - a.top) < 2, tW: t.width, aW: a.width };
  });
  A(col.ovA === 'visible' && col.ovF === 'visible', 'grand écran : aucun ascenseur dans la colonne de gauche (sources, champs)');
  A(col.zRightOfA && col.zAboveT && col.zTop && col.tW > col.aW * 3, 'grand écran : champs à gauche, zones (Filtres, Colonnes, Lignes, Valeurs) au-dessus du tableau/graphique de la tuile, à droite (' + Math.round(col.aW) + ' | ' + Math.round(col.tW) + ' px)');
  const expMods = (fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/\[('engine'[^\]]*)\]\.forEach/) || ['', ''])[1].split(',').map(x => x.trim().replace(/'/g, ''));
  A(expMods.length >= 19 && expMods.every(m => fs.existsSync(path.join(__dirname, '../outils/pivot/' + m + '.js'))) && await pd.evaluate(exp => { const src = [...document.querySelectorAll('script[src*="outils/pivot/"]')].map(x => x.getAttribute('src')); return src.length === exp.length && src.every((x, i) => new RegExp('^outils/pivot/' + exp[i] + '\\.js\\?v=\\d+$').test(x)); }, expMods), 'modules du pivot rechargés à chaque ouverture, dans l\'ordre du chargeur (pas de vieux fichier en cache ; la liste attendue est lue dans la page)');
  const stick = await pd.evaluate(() => { const th = [...document.querySelectorAll('#out thead tr:nth-child(2) th')].find(x => !x.classList.contains('fc')); return { pos: getComputedStyle(th).position, top: th.style.top, h1: document.querySelector('#out thead tr').getBoundingClientRect().height }; });
  A(stick.pos === 'sticky' && Math.abs(parseFloat(stick.top) - stick.h1) < 1, 'grand écran : en-têtes collants, 2e ligne sous la 1re (' + stick.top + ' ≈ ' + Math.round(stick.h1) + ' px)');
  const wA = await pd.evaluate(() => document.querySelector('#out').getBoundingClientRect().width);
  await pd.click('#btnFocus'); await pd.waitForTimeout(150);
  const wB = await pd.evaluate(() => document.querySelector('#out').getBoundingClientRect().width);
  A(!(await dvis('aside')) && !(await dvis('#cfgZones')) && wB > wA + 250 && /Réduire/.test(await pd.textContent('#btnFocus')), 'mode agrandi : panneau et zones masqués, tableau plus large (' + Math.round(wA) + ' → ' + Math.round(wB) + ' px)');
  A(await dvis('#rail') && await dvis('#btnWiz') && await dvis('#btnCube') && await dvis('#railTg'), 'mode agrandi : le menu vertical « Données » reste visible (icônes accessibles, sans réduire l\'écran)');
  await pd.selectOption('#chType', 'bar'); await pd.waitForTimeout(150);
  const svgW = await pd.evaluate(() => document.querySelector('#chart svg').getBoundingClientRect().width);
  A(svgW > 1200, 'graphique : occupe la largeur de l\'écran (' + Math.round(svgW) + ' px)');
  const geo = () => pd.evaluate(() => { const o = document.querySelector('#out').getBoundingClientRect(), c = document.querySelector('#chartBox').getBoundingClientRect(); return { oL: o.left, oR: o.right, oT: o.top, oB: o.bottom, cL: c.left, cR: c.right, cT: c.top, cB: c.bottom }; });
  let g = await geo();
  A(g.cB <= g.oT + 1, 'graphique « Au-dessus » (par défaut) : au-dessus du tableau');
  const al = await pd.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect(), cs = s => getComputedStyle(document.querySelector(s));
    const mid = s => (r(s).top + r(s).bottom) / 2;
    return { fType: cs('#chType').fontSize, fPos: cs('#chPos').fontSize, hType: r('#chType').height, hPos: r('#chPos').height, dLab: Math.abs(mid('#chPosL .meta') - mid('#chPos')), dLab0: Math.abs(mid('.chbar > label.meta') - mid('#chType')), dSel: Math.abs(mid('#chPos') - mid('#chType')) };
  });
  A(al.fType === al.fPos && Math.abs(al.hType - al.hPos) < 1 && al.dLab < 2 && al.dSel < 2, 'graphique : « Position » aligné comme « Graphique » (même taille de liste, libellé centré sur sa liste)');
  await pd.selectOption('#chPos', 'bottom'); await pd.waitForTimeout(200); g = await geo();
  A(g.cT >= g.oB - 1, 'graphique « En dessous » : sous le tableau');
  await pd.selectOption('#chPos', 'left'); await pd.waitForTimeout(250); g = await geo();
  A(g.cR <= g.oL + 1 && Math.abs(g.cT - g.oT) < 20, 'graphique « À gauche » : à gauche du tableau, même hauteur');
  await pd.selectOption('#chPos', 'right'); await pd.waitForTimeout(250); g = await geo();
  A(g.cL >= g.oR - 1 && Math.abs(g.cT - g.oT) < 20, 'graphique « À droite » : à droite du tableau, même hauteur (' + Math.round(g.oR) + ' → ' + Math.round(g.cL) + ' px)');
  const prefs = await pd.evaluate(() => ({ f: localStorage.getItem('statbel_pivot_focus'), c: JSON.parse(localStorage.getItem('statbel_pivot_chart')) }));
  A(prefs.f === '1' && prefs.c.pos === 'right' && prefs.c.type === 'bar', 'grand écran : mode agrandi et position du graphique mémorisés');
  await pd.keyboard.press('f'); await pd.waitForTimeout(100);
  A(await dvis('aside') && !(await pd.evaluate(() => document.body.classList.contains('d-focus'))), 'touche F : quitte le mode agrandi');
  await pd.focus('#fieldSearch'); await pd.keyboard.type('f'); await pd.waitForTimeout(50);
  A(!(await pd.evaluate(() => document.body.classList.contains('d-focus'))) && await pd.inputValue('#fieldSearch') === 'f', 'touche F : sans effet pendant la saisie dans un champ');
  // Actualiser les données si le fichier a été modifié (poignée de fichier simulée)
  await pd.setViewportSize({ width: 1920, height: 1080 }); await pd.waitForTimeout(150);
  A(await pd.isHidden('#btnRefresh'), 'actualiser : bouton masqué tant qu\'aucun fichier n\'est relié');
  await pd.evaluate(() => {
    const s0 = __pivot.st.sources[0];
    window.__setFile = (rows, mt) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), s0.sheet); window.__f = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'a.xlsx', { lastModified: mt }); };
    window.__fh = { kind: 'file', perm: 'granted', queryPermission: async function () { return this.perm; }, requestPermission: async function () { this.perm = window.__grant ? 'granted' : 'denied'; return this.perm; }, getFile: async () => window.__f };
    s0.handle = window.__fh; s0.mtime = 1000;
    window.__setFile([['Commune', 'Trimestre', "Nombre d'établissements"], ['Anvers', '2024-T4', 4242], ['Boom', '2024-T4', 10]], 1000);
    window.dispatchEvent(new Event('focus'));
  });
  await pd.waitForTimeout(200);
  A(await pd.isVisible('#btnRefresh') && !/modifié/.test(await pd.textContent('#btnRefresh')) && await pd.evaluate(() => !document.querySelector('#autoRow').hidden), 'actualiser : bouton visible pour un fichier relié, rien à signaler tant qu\'il n\'a pas changé');
  await pd.click('#btnRefresh'); await pd.waitForTimeout(150);
  A(/à jour/.test(await pd.textContent('#msg')) && !/4.?242/.test(await pd.textContent('#out')), 'actualiser : fichier inchangé → « à jour », données intactes');
  await pd.evaluate(() => { window.__setFile([['Commune', 'Trimestre', "Nombre d'établissements"], ['Anvers', '2024-T4', 4242], ['Boom', '2024-T4', 10]], 2000); window.dispatchEvent(new Event('focus')); });
  await pd.waitForTimeout(250);
  A(/modifié/.test(await pd.textContent('#btnRefresh')) && await pd.evaluate(() => document.querySelector('#btnRefresh').classList.contains('stale')), 'actualiser : fichier modifié détecté au retour sur la page (bouton signalé)');
  await pd.evaluate(() => { __pivot.st.sources[0].handle.perm = 'prompt'; window.__grant = false; });
  await pd.click('#btnRefresh'); await pd.waitForTimeout(150);
  A(/refusé/.test(await pd.textContent('#msg')) && !/4.?242/.test(await pd.textContent('#out')), 'actualiser : accès refusé → message, anciennes données conservées');
  await pd.evaluate(() => { window.__grant = true; });
  await pd.click('#btnRefresh'); await pd.waitForTimeout(250);
  A(/actualisées/.test(await pd.textContent('#msg')) && /4.?242/.test(await pd.textContent('#out')) && !/modifié/.test(await pd.textContent('#btnRefresh')), 'actualiser : nouvelles données lues sans rajouter le fichier (' + (await pd.textContent('#msg')).slice(0, 70) + ')');
  A(await pd.evaluate(() => __pivot.st.L.rows.length > 0 && __pivot.st.sources.length === 2), 'actualiser : champs et sélections conservés');
  await pd.evaluate(() => { window.__setFile([['Commune', 'Trimestre', "Nombre d'établissements"], ['Anvers', '2024-T4', 7777]], 3000); });
  await pd.evaluate(() => { const c = document.querySelector('#optAuto'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await pd.waitForTimeout(400);
  A(/7.?777/.test(await pd.textContent('#out')) && await pd.evaluate(() => localStorage.getItem('statbel_pivot_auto') === '1'), 'actualiser : option automatique → relecture dès le retour sur la page');
  await pd.evaluate(() => { const c = document.querySelector('#optAuto'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await pd.evaluate(() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Autre'], ['x']]), 'Nouvelle feuille'); window.__f = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'a.xlsx', { lastModified: 4000 }); });
  await pd.click('#btnRefresh'); await pd.waitForTimeout(250);
  A(/feuille introuvable|vide/.test(await pd.textContent('#msg')) && /7.?777/.test(await pd.textContent('#out')), 'actualiser : feuille absente du nouveau fichier → avertissement, anciennes données conservées');
  await pd.setViewportSize({ width: 1366, height: 768 }); await pd.waitForTimeout(300);
  const l2 = await pd.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, side: document.querySelector('#tvBody').classList.contains('p-right') }));
  A(l2.sw <= l2.iw && l2.side, 'portable 1366×768 : pas de débordement horizontal (' + l2.sw + '/' + l2.iw + ')');
  await pd.setViewportSize({ width: 1000, height: 700 }); await pd.waitForTimeout(300);
  g = await geo();
  A(await pd.evaluate(() => document.querySelector('#chPos [value="left"]').disabled && document.querySelector('#chPos [value="right"]').disabled && document.querySelector('#tvBody').classList.contains('p-bottom')) && g.cT >= g.oB - 1, 'écran moyen (< 1200 px) : gauche/droite indisponibles, graphique replié sous le tableau');

  // Mobile : écran « Configurer » / écran « Tableau » plein écran, sans débordement horizontal
  const { devices } = require('playwright-core');
  const pm = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  pm.on('pageerror', e => errs.push(e.message));
  await pm.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pm.setInputFiles('#fileIn', [f1, f2]);
  await pm.waitForTimeout(400);
  const larg = () => pm.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth }));
  const vis = sel => pm.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
  A(await vis('#out') && !(await vis('aside')) && !(await vis('#cfgZones')), 'mobile : après import → tableau seul (sélection masquée)');
  let w = await larg(); A(w.sw <= w.iw, `mobile (tableau) : pas de débordement (${w.sw}/${w.iw})`);
  await pm.click('#btnCfg'); await pm.waitForTimeout(100);
  A((await vis('aside')) && (await vis('#cfgZones')) && !(await vis('#out')), 'mobile : « Configurer » → sélection seule');
  await pm.evaluate(() => {
    const add = (l, z) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click();
    add('Commune', 'rows'); add('Trimestre', 'cols'); add('Nombre d\'établissements', 'vals');
  });
  w = await larg(); A(w.sw <= w.iw, `mobile (configuration, zones remplies) : pas de débordement (${w.sw}/${w.iw})`);
  await pm.click('#btnView'); await pm.waitForTimeout(100);
  A((await vis('#out')) && /Commune/.test(await pm.textContent('#summary')), 'mobile : « Voir le tableau » + résumé de la sélection');
  // Sélecteurs : filtre global + filtre de tuile sur le même champ, valeurs absentes, champs à plus de 2000 valeurs, restauration
  { const ctxK = await b.newContext({ viewport: { width: 1500, height: 900 } }), pk = await ctxK.newPage();
    pk.on('pageerror', e => errs.push(e.message));
    let kCsv = 'Code;Parité;Nb\n'; for (let i = 0; i < 2600; i++) kCsv += 'C' + String(i).padStart(4, '0') + ';' + (i % 2 ? 'Impair' : 'Pair') + ';1\n';
    await pk.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pk.setInputFiles('#fileIn', [{ name: 'codes.csv', mimeType: 'text/csv', buffer: Buffer.from(kCsv) }]); await pk.waitForTimeout(800);
    const kadd = (l, z) => pk.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await kadd('Code', 'rows'); await kadd('Nb', 'vals'); await pk.selectOption('#chType', 'hbar'); await pk.waitForTimeout(200);
    await pk.evaluate(() => document.querySelector('#viewTabs [data-vact="dash"]').click()); await pk.waitForTimeout(400);
    const kTxt = () => pk.evaluate(() => (document.querySelector('#dash .tile .tbody').textContent || '').replace(/\s+/g, ' '));
    await pk.click('#dash .tile [data-tact="chart"]'); await pk.waitForTimeout(200);
    await pk.selectOption('#ce_sel select[data-add]', { label: 'Code' }); await pk.selectOption('#ce_sel select[data-add]', { label: 'Parité' }); await pk.click('#ce_save'); await pk.waitForTimeout(400);
    await pk.selectOption('#dash .tile select[data-sel="' + await pk.evaluate(() => __pivot.st.views[0].sel[0].key) + '"]', 'C0010'); await pk.waitForTimeout(500);
    const kOne = await kTxt();
    A(/C0010/.test(kOne) && !/C0011|C0009|C0012/.test(kOne), 'sélecteur : champ de 2 600 valeurs (au-delà du plafond de liste) — une seule valeur affichée, aucune ligne ne passe à travers');
    const kSetVal = (key, val) => pk.evaluate(([key, val]) => { const el = document.querySelector('#dash .tile select[data-sel="' + key + '"]'); if (![...el.options].some(o => o.value === val)) { const o = document.createElement('option'); o.value = val; o.textContent = val; el.appendChild(o); } el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, [key, val]);   // valeur absente de la liste (plafond) : option injectée puis « change » (chemin réel)
    await kSetVal(await pk.evaluate(() => __pivot.st.views[0].sel[0].key), 'C2599'); await pk.waitForTimeout(600);
    const kBeyond = await kTxt();
    A(/C2599/.test(kBeyond) && !/C0000|C1999|C2598/.test(kBeyond), 'sélecteur : valeur au-delà du plafond de la liste (C2599) — bien filtrée, la valeur choisie reste affichée');
    // même champ : sélecteur global « Parité » et sélecteur de tuile « Parité »
    await pk.evaluate(() => { __pivot.st.views[0].sel[0].val = ''; }); await pk.waitForTimeout(100);
    const kParKey = await pk.evaluate(() => __pivot.st.views[0].sel[1].key);
    await pk.selectOption('#dash .tile select[data-sel="' + kParKey + '"]', 'Impair'); await pk.waitForTimeout(400);
    await addFilter(pk, 'Parité', 'global', 'dash');
    await pk.selectOption('#dash select[data-gsel]', 'Pair'); await pk.waitForTimeout(500);
    const kLoc = await pk.$$eval('#dash .tile select[data-sel="' + kParKey + '"] option', e => e.map(x => x.textContent).join('/')), kLocVal = await pk.inputValue('#dash .tile select[data-sel="' + kParKey + '"]'), kConf = await kTxt();
    A(kLoc === 'Toutes/Pair' && kLocVal === '' && kConf !== '' && !/Rien à afficher|Aucune ligne/.test(kConf), 'sélecteurs : global et tuile sur le même champ — le global l\'emporte, la liste de la tuile se limite à « Toutes / valeur globale » et affiche « Toutes » (pas d\'état caché)');
    await pk.selectOption('#dash select[data-gsel]', ''); await pk.waitForTimeout(400);
    await kSetVal(kParKey, 'Inconnu'); await pk.waitForTimeout(600);
    const kAbs = await kTxt();
    A(kAbs !== '' && !/Rien à afficher|Aucune ligne/.test(kAbs) && await pk.inputValue('#dash .tile select[data-sel="' + kParKey + '"]') === '', 'sélecteur : valeur absente des données — ignorée (« Toutes »), le graphique n\'est pas vidé');
    await pk.evaluate(() => { __pivot.st.views[0].sel[1].val = 'Impair'; __pivot.st.dash.sel[0].val = 'Pair'; });
    await pk.evaluate(() => { const t = document.querySelector('#coTitle'); if (t) { t.value = 'Sauvegarde'; t.dispatchEvent(new Event('change', { bubbles: true })); } });
    await pk.waitForTimeout(1500); await pk.reload({ waitUntil: 'load' }); await pk.waitForTimeout(1400);
    A(await pk.evaluate(() => __pivot.st.dash.sel.length === 1 && __pivot.st.dash.sel[0].val === 'Pair' && __pivot.st.views[0].sel.length === 2) && await pk.isVisible('#dash select[data-gsel]'), 'sélecteurs : global et tuile retrouvés après rechargement (session)');
    // Redimensionnement : étiquettes longues, beaucoup de catégories, impression
    // police large et disponible partout (CI compris) : le contrôle ne dépend pas de la police du poste
    const kClip = await pk.evaluate(() => {
      const PCh2 = window.PivotChart, mkR = (n, lab) => ({ K: 1, specs: [{ label: 'Nb', agg: 'sum' }], rowDims: ['A'], colDims: [], cols: [{ labels: [], key: 'c' }], rows: Array.from({ length: n }, (_, i) => ({ labels: [lab(i)], cells: [i + 5], tot: [i + 5] })), bottom: [1], grand: [1] }), out = [];
      [300, 373, 520].forEach(w => [['bar', 6, i => 'Établissements de commerce de détail ' + i], ['bar', 40, i => 'Commune ' + i], ['hbar', 6, i => 'Établissements de commerce de détail ' + i], ['hbar', 40, i => 'Commune ' + i], ['line', 12, i => 'Commune numéro ' + i]].forEach(([ty, n, lab]) => {
        const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;width:' + w + 'px;font-family:system-ui,Segoe UI,Arial,sans-serif'; host.innerHTML = PCh2.build(mkR(n, lab), { type: ty, k: 0, fmt: v => String(v), width: w, minW: 300, fitH: 434, o: {} }).svg.replace(/font-family="[^"]*"/, 'font-family="DejaVu Sans"'); document.body.appendChild(host);
        const sv = host.querySelector('svg'), r = sv.getBoundingClientRect(); let minL = 1e9; sv.querySelectorAll('text').forEach(tx => { const bb = tx.getBoundingClientRect(); if (bb.width) minL = Math.min(minL, bb.left - r.left); });
        const bars = [...sv.querySelectorAll('rect')].map(x => x.getBoundingClientRect().width).filter(x => x > 1 && x < w - 2); const plotW = ty === 'hbar' ? Math.max(0, ...bars) : 0;
        out.push({ ty, n, w, minL: Math.round(minL), plotW: Math.round(plotW), labels: sv.querySelectorAll('text[transform*="rotate"]').length }); host.remove();
      }));
      return out; });
    A(kClip.every(x => x.minL >= -1), 'redimensionnement : aucune étiquette coupée à gauche (étiquettes longues, 40 catégories, 300 / 373 / 520 px)' + JSON.stringify(kClip.filter(x => x.minL < -1)));
    A(kClip.filter(x => x.ty === 'hbar' && x.n === 6).every(x => x.plotW >= x.w * 0.3) && kClip.filter(x => x.ty === 'bar' && x.n === 40 && x.w <= 373).every(x => x.labels <= 21), 'redimensionnement : barres horizontales à étiquettes longues gardent un tracé exploitable (≥ 30 % de la largeur) ; 40 catégories → étiquettes éclaircies');
    await pk.click('#dash .tile [data-tact="chart"]'); await pk.waitForTimeout(200); await pk.selectOption('#ce_type', 'bar'); await pk.click('#ce_save'); await pk.waitForTimeout(400);   // colonnes : hauteur ajustable
    await pk.emulateMedia({ media: 'print' }); await pk.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await pk.waitForTimeout(500);
    const kPrint = await pk.evaluate(() => { const sv = document.querySelector('#dash .tile .tbody svg'); return sv ? { w: +sv.getAttribute('width'), h: +sv.getAttribute('height') } : null; });
    await pk.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await pk.emulateMedia({ media: 'screen' }); await pk.waitForTimeout(300);
    A(kPrint && kPrint.w === 700 && kPrint.h <= 0.8 * 440 + 8, 'impression : graphiques construits à une largeur fixe de 700 px (mise en page imprimante pas encore appliquée) et plus compacts (80 % de la hauteur de tuile) — ' + JSON.stringify(kPrint));
    await ctxK.close(); }
  // Panneau « ⚙ Graphique » : sections repliables, réglages alignés (même largeur), sections vides masquées selon le type, feuille sur téléphone
  { const ctxO = await b.newContext({ viewport: { width: 1500, height: 900 } }), po = await ctxO.newPage();
    po.on('pageerror', e => errs.push(e.message));
    await po.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await po.setInputFiles('#fileIn', [{ name: 'o.csv', mimeType: 'text/csv', buffer: Buffer.from('Commune;Nb\nA;1\nB;2\nC;3\n') }]); await po.waitForTimeout(700);
    const oadd = (l, z) => po.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await oadd('Commune', 'rows'); await oadd('Nb', 'vals'); await po.selectOption('#chType', 'bar'); await po.waitForTimeout(300);
    await cpo(po); await po.waitForTimeout(300);
    const og = await po.evaluate(() => { const bx = document.querySelector('#coBox'), secs = [...bx.querySelectorAll('details.sec')].filter(d => !d.hidden), sels = [...bx.querySelectorAll('details.sec[open] > label[data-opt]')].filter(l => l.style.display !== 'none' && l.querySelector('select')).map(l => Math.round(l.querySelector('select').getBoundingClientRect().width)), rights = [...bx.querySelectorAll('details.sec[open] > label[data-opt]')].filter(l => l.style.display !== 'none' && l.querySelector('select')).map(l => Math.round(l.querySelector('select').getBoundingClientRect().right));
      const r = document.querySelector('#chOpts').getBoundingClientRect(); return { names: secs.map(d => d.dataset.sec).join(), counts: secs.map(d => d.querySelector('.tag.n').textContent).join('|'), sameW: new Set(sels).size, aligned: new Set(rights).size === 1, right: Math.round(r.right) === window.innerWidth }; });
    A(og.names === 'Données,Affichage,Axes' && /^\d+ réglages?\|/.test(og.counts) && og.sameW === 1 && og.aligned && og.right, 'panneau ⚙ Graphique : sections Données / Affichage / Axes (Tendance masquée pour des barres), champs de même largeur alignés, collé au bord droit ' + JSON.stringify(og));
    await po.selectOption('#chType', 'line'); await po.waitForTimeout(250);
    const namesLine = await po.$$eval('#coBox details.sec', e => e.filter(d => !d.hidden).map(d => d.dataset.sec).join());
    await po.selectOption('#chType', 'pie'); await po.waitForTimeout(250);
    const namesPie = await po.$$eval('#coBox details.sec', e => e.filter(d => !d.hidden).map(d => d.dataset.sec).join());
    A(namesLine === 'Données,Affichage,Axes,Tendance' && namesPie === 'Données,Affichage', 'panneau ⚙ Graphique : les sections suivent le type (lignes : + Tendance ; secteurs : sans Axes ni Tendance)');
    await po.click('#coBox details[data-sec="Affichage"] > summary'); await po.waitForTimeout(150);
    const folded = await po.evaluate(() => !document.querySelector('#coBox details[data-sec="Affichage"]').open);
    await po.click('#cpReset'); await po.waitForTimeout(250);
    A(folded && await po.inputValue('#coLab') === 'none' && await po.isHidden('#coBox details[data-sec="Tendance"]'), 'panneau ⚙ Graphique : une section se replie ; « Réinit. » rétablit les réglages par défaut');
    await ctxO.close(); }
  // Navigation à deux niveaux : menu Données (icônes), fil d'Ariane, menus ▾ ⋯ Exporter, tableau de bord, « Ouvrir » (vrais clics)
  { const ctxN = await b.newContext({ viewport: { width: 1400, height: 900 } }), pn = await ctxN.newPage();
    pn.on('pageerror', e => errs.push(e.message));
    await pn.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pn.setInputFiles('#fileIn', [{ name: 'n.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nFlandre;Malines;5\nWallonie;Liège;8\n') }]); await pn.waitForTimeout(700);
    const nadd = (l, z) => pn.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await nadd('Commune', 'rows'); await nadd('Nb', 'vals'); await pn.selectOption('#chType', 'hbar'); await pn.waitForTimeout(300);
    const wOf = sel => pn.$eval(sel, e => Math.round(e.getBoundingClientRect().width)), nviews = () => pn.evaluate(() => __pivot.st.views.length), lvl = () => pn.evaluate(() => document.body.classList.contains('d-dash') ? 1 : 2), cur = () => pn.$eval('#vsel', e => e.textContent);
    const hdr = await pn.$$eval('header button', e => e.map(x => x.id).join());
    A(!/btnPreview|btnCube|btnRefresh|btnReset/.test(hdr) && await pn.isVisible('#rail #btnWiz') && (await pn.$('#btnAdd')) === null && (await pn.$('#btnJoin')) === null && (await pn.$('#btnCalc')) === null && await pn.isVisible('#rail #btnCube'), 'navigation : l\'en-tête est minimal, les actions de données sont dans le menu vertical « Données »');
    const w0 = await wOf('#rail'), lb0 = await pn.isVisible('#btnPreview .lb');
    await pn.click('#railTg'); await pn.waitForTimeout(200);
    const w1 = await wOf('#rail'), lb1 = await pn.isVisible('#btnPreview .lb');
    A(w0 < 80 && !lb0 && w1 > 180 && lb1, 'navigation : le menu Données est replié en icônes par défaut et s\'élargit (libellés) au clic ▸');
    await pn.click('#railTg'); await pn.waitForTimeout(150);
    await pn.click('#btnPreview'); await pn.waitForTimeout(250);
    const prevOpen = await pn.evaluate(() => document.querySelector('#dlgPreview').open); await pn.evaluate(() => document.querySelector('#dlgPreview').close());
    A(prevOpen, 'navigation : un bouton du menu Données (Aperçu…) fonctionne par un vrai clic');
    // fil d'Ariane : une seule vue → pas de « ← Tableau de bord »
    A(/^Vue 1/.test(await cur()) && await pn.isHidden('.crumb-back'), 'navigation : une seule vue — fil d\'Ariane sans « ← Tableau de bord »');
    await pn.click('#vsel'); await pn.waitForTimeout(100);
    const menuOpen = await pn.isVisible('#vmenu');
    await pn.click('#vmenu [data-vact="add"]'); await pn.waitForTimeout(300);
    A(menuOpen && await nviews() === 2 && /^Vue 2/.test(await cur()) && await pn.isHidden('#vmenu') && await pn.isVisible('.crumb-back'), 'navigation : ▾ liste les vues, « + Nouvelle vue » en crée une (menu refermé, retour au tableau de bord possible)');
    await pn.click('#vsel'); await pn.click('#vmenu .vt:has-text("Vue 1")'); await pn.waitForTimeout(300);
    A(/^Vue 1/.test(await cur()), 'navigation : choisir une vue dans le menu ▾ l\'ouvre');
    await pn.click('#vact'); await pn.waitForTimeout(100);
    const actOk = await pn.isVisible('#amenu') && await pn.isVisible('#amenu [data-vact="rename"]') && await pn.isVisible('#amenu [data-vact="dup"]') && await pn.isVisible('#amenu [data-vact="del"]') && await pn.isDisabled('#amenu [data-vact="left"]');
    await pn.keyboard.press('Escape'); await pn.waitForTimeout(100);
    A(actOk && await pn.isHidden('#amenu'), 'navigation : ⋯ regroupe renommer / dupliquer / déplacer / supprimer (« ◂ » désactivé sur la première vue) ; Échap referme le menu');
    await pn.click('#vact'); await pn.click('#amenu [data-vact="dup"]'); await pn.waitForTimeout(300);
    A(await nviews() === 3 && /copie/.test(await cur()), 'navigation : ⋯ › Dupliquer crée une copie et l\'ouvre');
    await pn.click('#btnExp'); await pn.waitForTimeout(100);
    const expOk = await pn.isVisible('#xmenu') && await pn.isVisible('#btnCsv') && await pn.isVisible('#btnXlsx') && await pn.isVisible('#btnCopy') && await pn.isVisible('#chPng') && await pn.isVisible('#chSvg');
    const [dlN] = await Promise.all([pn.waitForEvent('download'), pn.click('#btnCsv')]);
    A(expOk && /\.csv$/i.test(dlN.suggestedFilename()) && await pn.isHidden('#xmenu'), 'navigation : le menu Exporter regroupe copier, CSV, XLSX, PNG, SVG (vrai téléchargement CSV, menu refermé)');
    await pn.click('.crumb-back'); await pn.waitForTimeout(500);
    const titles = await pn.$$eval('#dash .tile .th b', e => e.length), hasNew = await pn.isVisible('#dash .newtile');
    A(await lvl() === 1 && titles === 3 && hasNew && /Tableau de bord/.test(await pn.textContent('#viewTabs .crumb-cur')) && await pn.isHidden('aside'), 'navigation : « ← Tableau de bord » ouvre le niveau 1 (tuiles + tuile « Nouvelle vue », panneau de gauche masqué)');
    await pn.click('#dash .tile:nth-of-type(2) [data-tact="edit"]'); await pn.waitForTimeout(400);
    A(await lvl() === 2 && /^Vue 2/.test(await cur()) && await pn.isVisible('aside'), 'navigation : « ✎ Ouvrir » ouvre la vue de la tuile dans le Pivot (le tableau de bord se ferme)');
    await pn.click('.crumb-back'); await pn.waitForTimeout(400);
    await pn.click('#dash .tile:nth-of-type(1) .th b'); await pn.waitForTimeout(400);
    A(await lvl() === 2 && /^Vue 1/.test(await cur()), 'navigation : un clic sur le titre d\'une tuile ouvre aussi la vue');
    await pn.click('.crumb-back'); await pn.waitForTimeout(400);
    await pn.click('#dash .newtile'); await pn.waitForTimeout(400);
    A(await nviews() === 4 && await lvl() === 2 && /^Vue 4/.test(await cur()), 'navigation : la tuile « + Nouvelle vue » crée une vue et l\'ouvre');
    await ctxN.close(); }
  // Navigation sur téléphone : les menus ▾ ⋯ Exporter restent entièrement dans l'écran
  { const ctxM = await b.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true }), pm = await ctxM.newPage();
    pm.on('pageerror', e => errs.push(e.message));
    await pm.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pm.setInputFiles('#fileIn', [{ name: 'm.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nWallonie;Liège;8\n') }]); await pm.waitForTimeout(700);
    if (!(await pm.isVisible('#vsel'))) { await pm.click('#btnCfg'); await pm.waitForTimeout(300); }
    const inScreen = sel => pm.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth && r.width > 100; });
    await pm.click('#vact'); await pm.waitForTimeout(150); const okA = await inScreen('#amenu'); await pm.keyboard.press('Escape');
    await pm.click('#vsel'); await pm.waitForTimeout(150); const okV = await inScreen('#vmenu'); await pm.keyboard.press('Escape');
    await pm.click('#btnExp'); await pm.waitForTimeout(150); const okX = await inScreen('#xmenu');
    A(okA && okV && okX, 'navigation (téléphone) : les menus ⋯, ▾ et Exporter restent entièrement dans l\'écran');
    await pm.click('#btnRail'); await pm.waitForTimeout(250);
    A(await pm.isVisible('#rail #btnPreview') && await pm.isVisible('#btnPreview .lb'), 'navigation (téléphone) : « ☰ Données » ouvre le tiroir avec les libellés');
    await ctxM.close(); }
  // Menu Données : infobulles riches (survol, clavier) et entrées Champs calculés / Groupes / Mesures
  { const ctxT = await b.newContext({ viewport: { width: 1400, height: 900 } }), ptt = await ctxT.newPage();
    ptt.on('pageerror', e => errs.push(e.message));
    await ptt.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await ptt.setInputFiles('#fileIn', [{ name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nWallonie;Liège;8\n') }]); await ptt.waitForTimeout(700);
    const tipOf = () => ptt.$eval('#railTip', e => ({ on: e.classList.contains('on'), txt: e.textContent }));
    await ptt.hover('#btnCube'); await ptt.waitForTimeout(500);
    const t1 = await tipOf();
    await ptt.mouse.move(900, 600); await ptt.waitForTimeout(250);
    const t2 = await tipOf();
    await ptt.hover('#btnWiz'); await ptt.waitForTimeout(500);
    const t3 = await tipOf();
    await ptt.mouse.move(900, 600); await ptt.focus('#btnReset'); await ptt.waitForTimeout(250);
    const t4 = await tipOf();
    A(t1.on && /^Cube de données/.test(t1.txt) && /filtrage/.test(t1.txt) && !t2.on && t3.on && /Assistant du projet/.test(t3.txt) && t4.on && /Réinitialiser/.test(t4.txt), 'menu Données : infobulle riche (nom + description) au survol et au clavier ; elle disparaît en quittant le bouton');
    await ptt.keyboard.press('Escape'); await ptt.waitForTimeout(150);
    A(!(await tipOf()).on, 'menu Données : Échap ferme l\'infobulle');
    await wzOpen(ptt, 3); await ptt.waitForTimeout(200);
    const dwhere = await ptt.evaluate(() => ['detCalc', 'detGrp', 'detMes'].map(id => ({ id, wz: !!document.getElementById(id).closest('#dlgWiz'), aside: !!document.getElementById(id).closest('aside') })));
    await ptt.evaluate(() => { document.getElementById('detCalc').open = true; });
    A(dwhere.every(x => x.wz && !x.aside) && await ptt.isVisible('#cName') && await ptt.isVisible('#cFormula') && (await ptt.$('#wzCalc')) === null, 'assistant projet (étape 3) : champs calculés, groupes et mesures sont dans l\'assistant (plus dans la colonne de gauche), formulaires utilisables');
    await wzClose(ptt);
    await ptt.evaluate(() => document.querySelector('.crumb-back') && document.querySelector('.crumb-back').click());
    await ctxT.close(); }
  // PC : bouton « ⚙ Configurer » quand le panneau de gauche est masqué (tableau de bord, mode agrandi)
  { const ctxP = await b.newContext({ viewport: { width: 1400, height: 900 } }), pcf = await ctxP.newPage();
    pcf.on('pageerror', e => errs.push(e.message));
    await pcf.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pcf.setInputFiles('#fileIn', [{ name: 'cf.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Commune;Nb\nFlandre;Anvers;10\nWallonie;Liège;8\n') }]); await pcf.waitForTimeout(700);
    const hiddenL2 = await pcf.isHidden('#btnCfgPc');
    await vact(pcf, 'dash'); await pcf.waitForTimeout(400);
    const shownDash = await pcf.isVisible('#btnCfgPc') && await pcf.isHidden('aside');
    await pcf.click('#btnCfgPc'); await pcf.waitForTimeout(300);
    const popDash = await pcf.isVisible('aside') && await pcf.isVisible('#cfgZones') && await pcf.isVisible('.zone[data-zone="rows"]') && await pcf.isVisible('#fields .fld') && await pcf.getAttribute('#btnCfgPc', 'aria-expanded') === 'true';
    await pcf.keyboard.press('Escape'); await pcf.waitForTimeout(250);
    const closed = await pcf.isHidden('aside') && await pcf.isHidden('#cfgZones');
    await pcf.click('#btnCfgPc'); await pcf.waitForTimeout(250);
    const swap = await pcf.isVisible('#cfgZones') && await pcf.isVisible('#fields .fld');
    await vact(pcf, 'dash'); await pcf.waitForTimeout(300);
    await pcf.click('#btnFocus'); await pcf.waitForTimeout(300);
    await pcf.click('#btnCfgPc'); await pcf.waitForTimeout(300);
    const popFocus = await pcf.isVisible('#cfgZones') && await pcf.isVisible('aside');
    A(hiddenL2 && shownDash && popDash && closed && swap && popFocus && (await pcf.$('#btnSrc')) === null, 'PC : « ⚙ Configurer » (absent quand le panneau de gauche est affiché) ouvre fichiers, champs et zones en panneau flottant en tableau de bord et en mode agrandi ; Échap le ferme');
    await ctxP.close(); }
  // Assistant « Projet » : étapes, hiérarchies (détection, édition), filtres en cascade, mémorisation
  { const H = require('../outils/pivot/hier.js');
    const rows = [{ r: 'F', p: 'A', c: 'a1' }, { r: 'F', p: 'L', c: 'l1' }, { r: 'W', p: 'H', c: 'h1' }, { r: 'W', p: 'Li', c: 'li1' }], dimOf = k => row => row[k];
    const hier = [{ name: 'Géo', levels: ['r', 'p', 'c'] }];
    A(JSON.stringify(H.sanitize([{ name: ' Géo ', levels: ['r', 'p', 'p', 'c'] }, { name: 'géo', levels: ['a', 'b'] }, { name: 'X', levels: ['a'] }, { name: '', levels: ['a', 'b'] }, null])) === JSON.stringify([{ name: 'Géo', levels: ['r', 'p', 'c'] }]), 'hiérarchies : nettoyées (noms uniques, ≥ 2 niveaux, pas de doublon de niveau)');
    const det = H.detect([{ key: 'k1', label: 'Commune' }, { key: 'k2', label: 'Région' }, { key: 'k3', label: 'Province' }, { key: 'k4', label: 'Année' }, { key: 'k5', label: 'Mois' }, { key: 'k6', label: 'Nb' }]);
    A(det.length === 2 && det[0].name === 'Géographie' && det[0].levels.join() === 'k2,k3,k1' && det[1].name === 'Temps' && det[1].levels.join() === 'k4,k5' && H.detect([{ key: 'a', label: 'Commune' }]).length === 0, 'hiérarchies : détection géographie / temps (du plus large au plus fin), rien si un seul niveau');
    A(H.uppers(hier, 'c').join() === 'r,p' && H.uppers(hier, 'r').length === 0, 'hiérarchies : niveaux supérieurs d\'un champ');
    const al = H.allowed(hier, 'p', [{ key: 'r', val: 'W' }], rows, dimOf);
    A(al && [...al].join() === 'H,Li' && H.allowed(hier, 'p', [{ key: 'r', val: '' }], rows, dimOf) === null && H.allowed(hier, 'r', [{ key: 'p', val: 'H' }], rows, dimOf) === null, 'hiérarchies : valeurs autorisées selon les niveaux supérieurs choisis (rien ne restreint le niveau le plus large)');
    const fx = H.fix(hier, [{ key: 'r', val: 'F' }, { key: 'p', val: 'H' }, { key: 'c', val: 'h1' }], [{ key: 'r', val: 'F' }, { key: 'p', val: 'H' }, { key: 'c', val: 'h1' }], rows, dimOf);
    A(fx.map(x => x.val).join() === 'F,,' , 'hiérarchies : un niveau incohérent revient à « Toutes » et la correction se propage vers le bas');

    const ctxW = await b.newContext({ viewport: { width: 1300, height: 800 } }), pw = await ctxW.newPage();
    pw.on('pageerror', e => errs.push(e.message));
    await pw.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pw.setInputFiles('#fileIn', [{ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Province;Commune;Année;Nb\nFlandre;Anvers;Anvers;2023;10\nFlandre;Limbourg;Hasselt;2024;5\nWallonie;Liège;Liège;2024;8\nWallonie;Hainaut;Mons;2023;3\n') }]); await pw.waitForTimeout(700);
    A(await pw.isHidden('#accSrc') === true && (await pw.$('#accSrc')) === null && (await pw.$('#btnAdd')) === null, 'assistant : plus de section « Sources » dans le panneau de gauche ni de bouton « Ajouter » dans le menu');
    await pw.click('#btnWizTop'); await pw.waitForTimeout(200);
    A(await pw.isVisible('#dlgWiz') && await pw.isVisible('#sources .src') && await pw.isVisible('#wzAdd') && await pw.isEnabled('#wzMap') && await pw.isHidden('#wzPrev') && /Projet 1/.test(await pw.textContent('#wzProj'))
      && await pw.getAttribute('#wzSteps [data-wz="1"]', 'aria-current') === 'step', 'assistant : étape 1 Sources (liste des fichiers, ajout, colonnes et fusion)');
    await pw.click('#wzNext'); await pw.waitForTimeout(100);
    A(await pw.isVisible('#wzJoin') && await pw.isDisabled('#wzJoin') && /au moins deux sources/.test(await pw.textContent('#wzJoins')) && await pw.isVisible('#wzPrev'), 'assistant : étape 2 Jointures (désactivée avec une seule source, explication)');
    await pw.click('#wzNext'); await pw.waitForTimeout(100);
    A(await pw.isVisible('#wzHierDetect') && await pw.isHidden('#wzNext') && /Aucune hiérarchie/.test(await pw.textContent('#wzHier')), 'assistant : étape 3 Champs dérivés et hiérarchies (aucune hiérarchie au départ)');
    await pw.click('#wzHierDetect'); await pw.waitForTimeout(250);
    A(await pw.evaluate(() => JSON.stringify(__pivot.st.hier.map(h => [h.name, h.levels.map(k => __pivot.st.byKey.get(k).label)]))) === JSON.stringify([['Géographie', ['Région', 'Province', 'Commune']]]), 'hiérarchies : « Détecter » crée Géographie = Région › Province › Commune');
    await pw.click('#wzHier [data-hi="0"] li:nth-child(3) [data-hup]'); await pw.waitForTimeout(150);
    const lv1 = await pw.evaluate(() => __pivot.st.hier[0].levels.map(k => __pivot.st.byKey.get(k).label).join('>'));
    await pw.click('#wzHier [data-hi="0"] li:nth-child(2) [data-hdn]'); await pw.waitForTimeout(150);
    const lv2 = await pw.evaluate(() => __pivot.st.hier[0].levels.map(k => __pivot.st.byKey.get(k).label).join('>'));
    A(lv1 === 'Région>Commune>Province' && lv2 === 'Région>Province>Commune', 'hiérarchies : monter / descendre un niveau');
    await pw.selectOption('#wzHier [data-hadd]', { label: 'Année' }); await pw.waitForTimeout(150);
    const lv3 = await pw.evaluate(() => __pivot.st.hier[0].levels.length);
    await pw.click('#wzHier [data-hi="0"] li:nth-child(4) [data-hrm]'); await pw.waitForTimeout(150);
    A(lv3 === 4 && await pw.evaluate(() => __pivot.st.hier[0].levels.length) === 3, 'hiérarchies : ajouter un niveau au plus fin, retirer un niveau');
    await pw.click('#wzHierAdd'); await pw.waitForTimeout(150);
    const two = await pw.evaluate(() => __pivot.st.hier.length);
    await pw.click('#wzHier [data-hi="1"] [data-hdel]'); await pw.waitForTimeout(150);
    A(two === 2 && await pw.evaluate(() => __pivot.st.hier.length) === 1, 'hiérarchies : ajouter une hiérarchie vide de sens (2 premiers champs) puis la supprimer');
    await pw.fill('#wzHier [data-hname]', 'Territoire'); await pw.dispatchEvent('#wzHier [data-hname]', 'change'); await pw.waitForTimeout(150);
    A(await pw.evaluate(() => __pivot.st.hier[0].name) === 'Territoire', 'hiérarchies : renommer');
    await pw.click('#wzDone'); await pw.waitForTimeout(150);
    A(await pw.isHidden('#dlgWiz'), 'assistant : « Terminer » ferme la fenêtre');
    // filtres en cascade (tableau de bord : globaux)
    await vact(pw, 'dash'); await pw.waitForTimeout(300);
    await addFilter(pw, 'Région', 'global', 'dash'); await addFilter(pw, 'Province', 'global', 'dash'); await addFilter(pw, 'Commune', 'global', 'dash');
    const optsOf = k => pw.$$eval('#dash select[data-gsel="' + k + '"] option', e => e.map(x => x.textContent));
    const keyOf = l => pw.evaluate(x => [...__pivot.st.byKey.values()].find(c => c.label === x).key, l);
    const kR = await keyOf('Région'), kP = await keyOf('Province'), kC = await keyOf('Commune');
    const allP = await optsOf(kP);
    await pw.selectOption('#dash select[data-gsel="' + kR + '"]', 'Wallonie'); await pw.waitForTimeout(300);
    const wP = await optsOf(kP), wC = await optsOf(kC);
    A(allP.length === 5 && wP.join() === 'Toutes,Hainaut,Liège' && wC.join() === 'Toutes,Liège,Mons', 'filtres en cascade : « Région = Wallonie » limite les provinces et les communes à la Wallonie');
    await pw.selectOption('#dash select[data-gsel="' + kP + '"]', 'Liège'); await pw.waitForTimeout(300);
    const lC = await optsOf(kC);
    await pw.selectOption('#dash select[data-gsel="' + kR + '"]', 'Flandre'); await pw.waitForTimeout(300);
    const resetP = await pw.inputValue('#dash select[data-gsel="' + kP + '"]'), fP = await optsOf(kP);
    A(lC.join() === 'Toutes,Liège' && resetP === '' && fP.join() === 'Toutes,Anvers,Limbourg', 'filtres en cascade : province incohérente après changement de région → « Toutes » ; liste des provinces flamandes');
    await pw.selectOption('#dash select[data-gsel="' + kR + '"]', ''); await pw.waitForTimeout(300);
    A((await optsOf(kP)).length === 5, 'filtres en cascade : « Toutes » au niveau supérieur rétablit toutes les valeurs');
    // mémorisation des hiérarchies dans le projet
    await pw.waitForTimeout(1500);
    await pw.reload({ waitUntil: 'load' }); await pw.waitForTimeout(1500);
    A(await pw.evaluate(() => JSON.stringify(__pivot.st.hier.map(h => [h.name, h.levels.length]))) === JSON.stringify([['Territoire', 3]]), 'hiérarchies : mémorisées avec le projet (rechargement de la page)');
    await ctxW.close(); }
  A(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close();
  srv.close && srv.close();
  console.log(fails ? fails + ' échec(s)' : 'OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('pivot-tool diagnostic:', e && (e.stack || e)); process.exit(1); });
