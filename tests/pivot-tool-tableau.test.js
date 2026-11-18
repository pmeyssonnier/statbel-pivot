/*
 * Test de l'outil Tableaux croisés — index.html — Tableau croisé de bout en bout (import, fusion, détail, export, tris, sous-totaux, graphiques, Top N…), jointures, aperçu qualité, groupes / mesures, liste des données, session, dispositions, cube
 * (Découpé de l'ancien tests/pivot-tool.test.js en suites indépendantes, exécutées en parallèle : seule la
 *  couverture de la page par scénarios change, pas son contenu.)
 *
 * Lancer :  CHROMIUM_PATH=… node tests/pivot-tool-tableau.test.js
 */
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = (()=>{try{return require('playwright-core')}catch(e){return require('playwright')}})();
const { serve } = require('./_serve');
const XLSX = require('../vendor/xlsx/xlsx.full.min.js');
const EXEC = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';
let fails = 0;
const A = (cond, msg) => { if (!cond) { fails++; console.log('✗ FAIL ' + msg); } else console.log('✓ ' + msg); };
// Assistant « Projet » : ouvre la fenêtre à une étape / la ferme
const wzOpen = async (p, step) => { await p.evaluate(n => { document.querySelector('#btnWiz').click(); document.querySelector('#wzSteps [data-wz="' + n + '"]').click(); }, step || 1); await p.waitForTimeout(150); };
const wzClose = p => p.evaluate(() => { const d = document.querySelector('#dlgWiz'); if (d.open) d.close(); });
const vact = (p, act) => p.evaluate(x => document.querySelector('#viewTabs [data-vact="' + x + '"]').click(), act);
const vview = (p, id) => p.evaluate(x => document.querySelector('#viewTabs [data-view="' + x + '"]').click(), id);
const xclick = (p, sel) => p.evaluate(x => document.querySelector(x).click(), sel);
// ouvre le panneau « ⚙ Tableau » (tiroir : totaux, décimales, Top N, mise en forme)
const tpo = p => p.evaluate(() => { if (!document.body.classList.contains('tp-open')) document.getElementById('btnTbOpts').click(); });
const tpc = p => p.evaluate(() => { if (document.body.classList.contains('tp-open')) document.getElementById('btnTbOpts').click(); });
function unzipStore(buf) {   // lecteur minimal de ZIP « stocké » : { nom: texte }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = {};
  let eocd = buf.length - 22; while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = dv.getUint32(eocd + 16, true);
  for (let n = dv.getUint16(eocd + 10, true); n > 0; n--) {
    const size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nl)).toString('utf8');
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), start = off + 30 + lnl + lxl;
    out[name] = Buffer.from(buf.subarray(start, start + size)).toString('utf8');
    p += 46 + nl + xl + cl;
  }
  return out;
}
const wellFormed = xml => { const st = []; const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g; let m, pos = 0; while ((m = re.exec(xml))) { if (/[<>]/.test(xml.slice(pos, m.index).replace(/<\?xml[^>]*\?>/, ''))) return false; pos = re.lastIndex; if (m[4]) continue; if (m[1]) { if (st.pop() !== m[2]) return false; } else st.push(m[2]); } return st.length === 0; };

// ---------- UI ----------
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-'));
  const mk = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Feuil1'); const f = path.join(dir, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; };
  const f1 = mk('a.xlsx', [['Commune', 'Trimestre', 'Nombre d\'établissements'], ['Anvers', '2024-T4', 100], ['Boom', '2024-T4', 10], ['Anvers', '2024-T3', 90]]);
  const f2 = mk('b.xlsx', [['commune', 'Trim.', 'Nb établissements'], ['Anvers', '2024-T4', 7], ['Gand', '2024-T4', 5]]);
  const srv = await serve();
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const errs = [];
  const p = await b.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await p.setInputFiles('#fileIn', [f1, f2]);
  await p.waitForTimeout(400);
  A((await p.$$('#sources .src')).length === 2, '2 sources chargées');
  await xclick(p, '#wzMap');
  await p.$$eval('#mapBody input[data-v]', ins => {
    ins.forEach(i => { if (i.dataset.orig === 'Trim.') i.value = 'Trimestre'; if (i.dataset.orig === 'Nb établissements') i.value = 'Nombre d\'établissements'; });
  });
  await p.click('#mapOk');
  await p.waitForTimeout(200);
  const labels = await p.$$eval('#fields .fld .fl', e => e.map(x => x.textContent));
  A(labels.filter(l => /^Commune$/i.test(l)).length === 1 && !labels.includes('Trim.'), 'colonnes fusionnées (' + labels.join(' | ') + ')');
  const add = (label, z) => p.evaluate(([l, zz]) => {
    const f = [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l);
    f.querySelector('button[data-z="' + zz + '"]').click();
  }, [label, z]);
  await add('Commune', 'rows'); await add('Trimestre', 'cols'); await add('Nombre d\'établissements', 'vals');
  // retire la mesure par défaut « Nombre de lignes » (1re de la zone Valeurs) et la ligne « Source »
  await p.evaluate(() => {
    document.querySelector('.zone[data-zone="vals"] .chip[data-i="0"] button[data-act="rm"]').click();
    document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click();
  });
  await p.waitForTimeout(150);
  const txt = await p.textContent('#out');
  A(/Anvers/.test(txt) && /Gand/.test(txt) && /197/.test(txt), 'tableau croisé : Anvers/Gand + Anvers = 197 (100+90+7)');
  A(/Somme/.test(txt) && /Total/.test(txt), 'en-têtes Somme + Total');
  await p.evaluate(() => { [...document.querySelectorAll('#out td[data-r]')].find(t => t.textContent.trim() === '107').click(); });
  await p.waitForTimeout(150);
  A(/2 ligne/.test(await p.textContent('#dTitle')) && /Anvers/.test(await p.textContent('#dBody')), 'clic cellule → détail (2 lignes Anvers T4)');
  await p.click('#dClose');
  const [dl] = await Promise.all([p.waitForEvent('download'), xclick(p, '#btnCsv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  A(/Anvers;/.test(csv) && /Total/.test(csv), 'export CSV');
  const [dlx] = await Promise.all([p.waitForEvent('download'), xclick(p, '#btnXlsx')]);
  const xlsxBytes = fs.readFileSync(await dlx.path());
  const xlsxParts = unzipStore(new Uint8Array(xlsxBytes));
  A(dlx.suggestedFilename() === 'tableau-croise.xlsx' && !!xlsxParts['xl/styles.xml'] && xlsxParts['xl/worksheets/sheet1.xml'].includes('Anvers') && Object.values(xlsxParts).every(wellFormed), 'bouton XLSX : classeur mis en forme téléchargé (styles + données)');
  // Exclure une colonne source (⊘) puis la réafficher ; inverser lignes et colonnes
  const names = () => p.$$eval('#fields .fld:not(.der) .fl', e => e.map(x => x.textContent));
  await p.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'Trimestre').querySelector('[data-act="delfield"]').click());
  await p.waitForTimeout(150);
  A(!(await names()).includes('Trimestre') && /exclue/.test(await p.textContent('#sources')), 'colonne exclue : « Trimestre » retiré des champs');
  await xclick(p, '[data-act="restore"]'); await p.waitForTimeout(150);
  A((await names()).includes('Trimestre'), 'colonne réaffichée');
  await xclick(p, '#wzMap');
  await p.evaluate(() => { const tr = [...document.querySelectorAll('#mapBody tr')].find(r => r.querySelector('input[data-v]') && r.querySelector('input[data-v]').dataset.orig === 'Trimestre'); tr.querySelector('input[data-inc]').click(); });
  await p.click('#mapOk'); await p.waitForTimeout(150);
  A(!(await names()).includes('Trimestre'), 'fenêtre Colonnes : « Inclure » décoché → colonne exclue');
  await xclick(p, '[data-act="restore"]'); await p.waitForTimeout(150);
  const rc = await p.evaluate(() => JSON.stringify([__pivot.st.L.rows, __pivot.st.L.cols]));
  await p.click('#btnSwap');
  const rc2 = await p.evaluate(() => JSON.stringify([__pivot.st.L.rows, __pivot.st.L.cols]));
  A(rc2 === JSON.stringify(JSON.parse(rc).reverse()) && rc !== rc2, 'inverser lignes ↔ colonnes');
  await p.click('#btnSwap');

  // Liste déroulante « Valeur ↓ » : trie les lignes par valeur
  await p.selectOption('#optSort', 'desc'); await p.waitForTimeout(100);
  const ordre = await p.evaluate(() => __pivot.st.res.rows.map(r => r.tot[0]));
  A(ordre.every((v, i) => i === 0 || ordre[i - 1] >= v) && (await p.inputValue('#optSort')) === 'desc', 'liste « Valeur ↓ » : lignes triées par valeur décroissante');
  await p.selectOption('#optSort', 'label'); await p.waitForTimeout(50);

  // Clic sur l'en-tête de la 1re colonne (libellés) : Z→A puis retour A→Z
  const premier = () => p.evaluate(() => __pivot.st.res.rows.map(r => r.labels[0]));
  const avantTri = await premier();
  await p.click('#out th.rl.srt'); await p.waitForTimeout(100);
  const zA = await premier();
  A(JSON.stringify(zA) === JSON.stringify(avantTri.slice().reverse()), 'clic sur l\'en-tête de la 1re colonne : tri Z→A');
  await p.selectOption('#optSort', 'label'); await p.waitForTimeout(100);
  A(JSON.stringify(await premier()) === JSON.stringify(avantTri), 'liste « Lignes A→Z » : retour au tri A→Z');

  // Mise en forme : style, figer la 1re colonne, format d'une valeur, règle conditionnelle
  await tpo(p); await p.selectOption('#optStyle', 'statbel'); await tpc(p);
  A(await p.evaluate(() => document.querySelector('#out table').classList.contains('pv-s-statbel')), 'style de tableau appliqué (Statbel)');
  A((await p.evaluate(() => getComputedStyle(document.querySelector('#out th.rlab')).position)) === 'sticky', '1re colonne figée (position sticky)');
  await tpo(p); await p.uncheck('#optFreeze'); await tpc(p);
  A((await p.evaluate(() => getComputedStyle(document.querySelector('#out th.rlab')).position)) !== 'sticky', '« Figer la 1re colonne » décoché → plus figée');
  await tpo(p); await p.check('#optFreeze'); await tpc(p);
  await tpo(p); await p.selectOption('#optDensity', 'compact'); await tpc(p);
  A(await p.evaluate(() => document.querySelector('#out table').classList.contains('pv-d-compact')), 'densité compacte');
  await p.evaluate(() => { const s = document.querySelector('.zone[data-zone="vals"] select[data-act="vfmt"]'); s.value = 'eur'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(100);
  A(/€/.test(await p.textContent('#out')), 'format « Euro » d\'une valeur appliqué au tableau');
  await tpo(p); await p.selectOption('#optCf', 'rule'); await p.fill('#optCfVal', '100'); await p.selectOption('#optCfOp', '>'); await tpc(p);
  await p.waitForTimeout(100);
  A((await p.$$('#out td[style*="ffc7ce"]')).length > 0, 'mise en forme conditionnelle : règle > 100 colore des cellules');
  await tpo(p); await p.selectOption('#optCf', 'none'); await p.selectOption('#optStyle', 'standard'); await p.selectOption('#optDensity', 'normal'); await tpc(p);

  // Sous-totaux : avec Source > Commune, une ligne « Total <commune> » apparaît
  await p.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'Source').querySelector('button[data-z="rows"]').click());
  await p.waitForTimeout(100);
  A((await p.$$('#out tr.sub')).length === 0, 'sans option : pas de ligne de sous-total');
  await tpo(p); await p.check('#optSub'); await p.waitForTimeout(150); await tpc(p);
  A((await p.$$('#out tr.sub')).length >= 1 && /Total Anvers/.test(await p.textContent('#out')), 'option « Sous-totaux par niveau » : ligne « Total <commune> »');
  // Repli / dépli des groupes
  const nbTr = async () => (await p.$$('#out tbody tr')).length;
  const full = await nbTr();
  A(await p.isVisible('#btnFoldAll'), 'repli : boutons Replier / Déplier visibles avec les sous-totaux');
  await p.click('#btnFoldAll'); await p.waitForTimeout(100);
  const closed = await nbTr();
  A(closed < full && (await p.$$('#out tr.sub.collapsed')).length >= 1 && /Total Anvers/.test(await p.textContent('#out')) && (await p.$$('#out td[data-r]:not([data-r="-1"])')).length === 0, 'repli : tout replier ne laisse que les lignes « Total <groupe> » (' + full + ' → ' + closed + ' lignes)');
  await p.click('#out tr.sub.collapsed th[data-fold]'); await p.waitForTimeout(100);
  A(await nbTr() > closed && (await p.$$('#out tr.sub.collapsed')).length === (await p.$$('#out tr.sub')).length - 1 || await nbTr() > closed, 'repli : clic sur un groupe replié → il se déplie');
  await p.click('#btnUnfoldAll'); await p.waitForTimeout(100);
  A(await nbTr() === full, 'repli : tout déplier restitue le tableau complet');
  await p.click('#out .fold[data-fold]'); await p.waitForTimeout(100);
  A(await nbTr() < full, 'repli : le ▾ d\'un groupe le replie');
  const xl = await p.evaluate(() => window.PivotEngine ? 0 : (window.PivotX ? window.PivotX.flatMatrix(__pivot.st.res, __pivot.st.o).length : 0));
  A(xl === 0 || xl > closed, 'repli : l\'export garde toutes les lignes');
  await p.click('#btnUnfoldAll');
  // Graphiques : sélection du type, SVG affiché, exports PNG / SVG
  A(await p.isHidden('#chartBox'), 'graphique : masqué par défaut');
  for (const t of ['bar', 'hbar', 'stack', 'line', 'pie']) {
    await p.selectOption('#chType', t); await p.waitForTimeout(80);
    A(await p.isVisible('#chart svg') && (await p.$$('#chart svg rect, #chart svg path, #chart svg circle')).length > 3, 'graphique ' + t + ' : SVG affiché');
  }
  const [dlPng] = await Promise.all([p.waitForEvent('download'), xclick(p, '#chPng')]);
  const png = fs.readFileSync(await dlPng.path());
  A(dlPng.suggestedFilename() === 'graphique.png' && png[0] === 0x89 && png.slice(1, 4).toString() === 'PNG' && png.length > 2000, 'graphique : export PNG valide (' + png.length + ' o)');
  const [dlSvg] = await Promise.all([p.waitForEvent('download'), xclick(p, '#chSvg')]);
  A(/^<svg /.test(fs.readFileSync(await dlSvg.path(), 'utf8')), 'graphique : export SVG');
  A(await p.evaluate(() => JSON.parse(localStorage.getItem('statbel_pivot_chart')).type) === 'pie', 'graphique : type retenu pour la prochaine visite');
  await p.selectOption('#chType', 'none'); await p.waitForTimeout(80);
  A(await p.isHidden('#chartBox'), 'graphique : « Aucun graphique » le masque');
  await tpo(p); await p.uncheck('#optSub'); await p.waitForTimeout(100); await tpc(p);
  A(!(await p.isVisible('#btnFoldAll')), 'repli : boutons masqués sans sous-totaux');
  await p.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click());
  await p.waitForTimeout(100);


  // Top N
  const nTous = (await p.$$('#out td[data-r]:not([data-r="-1"])')).length;
  await tpo(p); await p.fill('#optTopN', '1'); await p.dispatchEvent('#optTopN', 'change'); await p.waitForTimeout(150); await tpc(p);
  A(/Autres/.test(await p.textContent('#out')) && /Top 1 sur/.test(await p.textContent('#info')) && /a\.xlsx/.test(await p.textContent('#out')) && !/b\.xlsx/.test(await p.textContent('#out')), 'Top N : a.xlsx conservé, b.xlsx regroupé en « Autres », mention « Top 1 sur … »');
  await p.evaluate(() => [...document.querySelectorAll('#out td[data-r]')].find(t => /Autres/.test(t.parentElement.textContent) && t.dataset.c !== '-1').click());
  await p.waitForTimeout(150);
  A(/ligne/.test(await p.textContent('#dTitle')) && /Autres/.test(await p.textContent('#dTitle')), 'Top N : clic sur « Autres » → détail');
  await p.click('#dClose');
  await tpo(p); await p.uncheck('#optTopOthers'); await p.waitForTimeout(150); await tpc(p);
  A(!/Autres/.test(await p.textContent('#out')), 'Top N : sans « Autres », le reste disparaît');
  A(await p.evaluate(() => { const PL = window.PivotLayouts, lay = PL.serialize(__pivot.st.L, __pivot.st.o); return lay.opts.topN === 1 && PL.sanitize(lay).opts.topN === 1 && PL.sanitize(lay).opts.topOthers === false; }), 'Top N : conservé dans les dispositions enregistrées');
  await tpo(p); await p.fill('#optTopN', '0'); await p.dispatchEvent('#optTopN', 'change'); await p.check('#optTopOthers'); await p.waitForTimeout(100); await tpc(p);
  A((await p.$$('#out td[data-r]:not([data-r="-1"])')).length === nTous, 'Top N : 0 → tableau complet');

  // Renommer une valeur (✎ dans « Valeurs »)
  p.once('dialog', d => d.accept('Établissements (total)'));
  await p.click('.zone[data-zone="vals"] [data-act="vname"]'); await p.waitForTimeout(150);
  A(/Établissements \(total\)/.test(await p.textContent('#out')) && /Établissements \(total\)/.test(await p.textContent('#summary')) && /on/.test(await p.getAttribute('.zone[data-zone="vals"] [data-act="vname"]', 'class')), 'valeur renommée : titre dans le tableau et le résumé');
  const [dlRn] = await Promise.all([p.waitForEvent('download'), xclick(p, '#btnCsv')]);
  A(/Établissements \(total\)/.test(fs.readFileSync(await dlRn.path(), 'utf8')), 'valeur renommée : reprise dans l\'export CSV');
  p.once('dialog', d => d.accept(''));
  await p.click('.zone[data-zone="vals"] [data-act="vname"]'); await p.waitForTimeout(150);
  A(!/Établissements \(total\)/.test(await p.textContent('#out')), 'valeur renommée : vide → nom par défaut rétabli');

  // Champs calculés : créer, utiliser comme valeur, exporter, supprimer
  await wzOpen(p, 3); await p.evaluate(() => { document.getElementById('detCalc').open = true; });
  await p.fill('#cName', 'Moyenne par ligne'); await p.fill('#cFormula', "[Nombre d'établissements] / [Nombre de lignes]");
  await p.click('#cSave'); await p.waitForTimeout(150);
  A(/enregistré/.test(await p.textContent('#cMsg')) && /Moyenne par ligne/.test(await p.textContent('#cList')) && await p.evaluate(() => JSON.parse(localStorage.getItem('statbel_pivot_calcs'))[0].name === 'Moyenne par ligne'), 'champ calculé : enregistré et conservé sur l\'appareil');
  await p.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'Moyenne par ligne').querySelector('button[data-z="vals"]').click());
  await p.waitForTimeout(150);
  A(/66,67/.test(await p.textContent('#out')) && /Moyenne par ligne/.test(await p.textContent('#out')), 'champ calculé : posé dans Valeurs, ratio calculé (200 / 3 lignes = 66,67)');
  await p.fill('#cName', 'Doublon'); await p.fill('#cFormula', '[Inconnu] * 2'); await p.click('#cSave'); await p.waitForTimeout(100);
  A(/Formule invalide/.test(await p.textContent('#cMsg')) && !/Doublon/.test(await p.textContent('#cList')), 'champ calculé : formule invalide refusée avec message');
  await p.click('#cList [data-act="calcdel"]'); await p.waitForTimeout(150); await wzClose(p);
  A(!/Moyenne par ligne/.test(await p.textContent('#out')) && await p.evaluate(() => JSON.parse(localStorage.getItem('statbel_pivot_calcs')).length === 0), 'champ calculé : supprimé de la liste, du tableau et du stockage');

  // Jointures dans l'interface : lier un fichier de référence (Commune → Province)
  const fJ = mk('c.xlsx', [['Ville', 'Province'], ['Anvers', 'Anvers (prov)'], ['Gand', 'Flandre or.'], ['Boom', 'Anvers (prov)']]);
  const ctxJ = await b.newContext({ viewport: { width: 1500, height: 900 } }), pj = await ctxJ.newPage();
  pj.on('pageerror', e => errs.push(e.message));
  await pj.goto(srv.url + '/index.html', { waitUntil: 'load' });
  A(await pj.isDisabled('#wzJoin'), 'jointure : bouton « Jointures… » désactivé sans fichier');
  await pj.setInputFiles('#fileIn', [f1]); await pj.waitForTimeout(300);
  A(await pj.isDisabled('#wzJoin'), 'jointure : toujours désactivé avec une seule source');
  await pj.setInputFiles('#fileIn', [fJ]); await pj.waitForTimeout(300);
  A(await pj.isEnabled('#wzJoin'), 'jointure : activé dès deux sources');
  await xclick(pj, '#wzJoin'); await pj.waitForTimeout(150);
  const optTxt = sel => pj.$$eval(sel + ' option', e => e.map(x => x.textContent).join('|'));
  A(/a\.xlsx/.test(await optTxt('#jLeft')) && /c\.xlsx/.test(await optTxt('#jRight')), 'jointure : dialogue avec les sources');
  await pj.selectOption('#jKeys [data-jk="l0"]', 'Commune'); await pj.selectOption('#jKeys [data-jk="r0"]', 'Ville'); await pj.waitForTimeout(100);
  A(/ligne\(s\) à gauche → \d+ avec correspondance/.test(await pj.textContent('#jPrev')), 'jointure : aperçu des correspondances affiché');
  await pj.click('#jSave'); await pj.waitForTimeout(100);
  A(/Donnez un nom/.test(await pj.textContent('#jPrev')), 'jointure : nom obligatoire');
  await pj.fill('#jName', 'Communes + provinces'); await pj.click('#jSave'); await pj.waitForTimeout(250);
  A(/enregistrée/.test(await pj.textContent('#jPrev')) && /Communes \+ provinces/.test(await pj.textContent('#jList')), 'jointure : enregistrée et listée');
  await pj.click('#jClose'); await pj.waitForTimeout(100);
  const srcTxt = await pj.textContent('#sources');
  A(/⨝ Communes \+ provinces/.test(srcTxt) && /jointure/.test(srcTxt) && await pj.evaluate(() => __pivot.st.sources.filter(s => !s.join).every(s => s.use === false)), 'jointure : source « ⨝ » ajoutée, les deux sources d\'origine désactivées');
  A(await pj.evaluate(() => [...document.querySelectorAll('#fields .fld .fl')].map(x => x.textContent).includes('Province')), 'jointure : la colonne « Province » de droite est un nouveau champ');
  const padd = (l, z) => pj.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
  await padd('Province', 'rows'); await padd('Nombre d\'établissements', 'vals');
  await pj.evaluate(() => document.querySelector('.zone[data-zone="rows"] .chip[data-i="0"] button[data-act="rm"]').click()); await pj.waitForTimeout(200);
  const pOut = await pj.textContent('#out');
  A(/Anvers \(prov\)/.test(pOut) && /200/.test(pOut) && !/Boom/.test(pOut), 'jointure : tableau par province (Anvers = 100 + 90 + 10 de Boom = 200)');
  await pj.waitForTimeout(1300);
  await pj.reload({ waitUntil: 'load' }); await pj.waitForTimeout(1000);
  A(/⨝ Communes \+ provinces/.test(await pj.textContent('#sources')) && /Anvers \(prov\)/.test(await pj.textContent('#out')), 'jointure : retrouvée après actualisation de la page (définition mémorisée, données recalculées)');
  await xclick(pj, '#sources [data-act="editjoin"]'); await pj.waitForTimeout(150);
  await pj.selectOption('#jType', 'inner'); await pj.click('#jSave'); await pj.waitForTimeout(250);
  await pj.click('#jClose');
  A(await pj.evaluate(() => __pivot.st.sources.find(s => s.join).aoa.length - 1) === 3, 'jointure : modifiée (jointure interne)');
  await pj.evaluate(() => [...document.querySelectorAll('#sources .src')].find(x => /⨝/.test(x.textContent)).querySelector('[data-act="delsrc"]').click()); await pj.waitForTimeout(200);
  A(!/⨝/.test(await pj.textContent('#sources')) && (await pj.$$('#sources .src')).length === 2, 'jointure : supprimée depuis la liste des sources');
  await ctxJ.close();

  // Aperçu et contrôle qualité dans l'interface
  const fQ = mk('q.xlsx', [['Commune', 'Nb'], ['Anvers', 10], ['ANVERS', 12], ['Gand', 'n.d.'], ['Gand', 11], ['Mons', 10], ['Mons', 10], ['Mons', 10], ['Boom', null], ['Anvers', 13], ['Gand', 14], ['Liège', 15], ['Namur', 16], ['Spa', 17], ['Huy', 18]]);
  const ctxQ = await b.newContext({ viewport: { width: 1500, height: 900 } }), pq = await ctxQ.newPage();
  pq.on('pageerror', e => errs.push(e.message));
  await pq.goto(srv.url + '/index.html', { waitUntil: 'load' });
  A(await pq.isDisabled('#btnPreview'), 'aperçu : bouton désactivé sans fichier');
  await pq.setInputFiles('#fileIn', [fQ]); await pq.waitForTimeout(400);
  A(await pq.isEnabled('#btnPreview'), 'aperçu : bouton activé avec des données');
  await pq.click('#btnPreview'); await pq.waitForTimeout(400);
  const issuesTxt = await pq.textContent('#pvIssues');
  A(await pq.isVisible('#dlgPreview') && /non numérique/.test(issuesTxt) && /plusieurs façons/.test(issuesTxt) && /identique/.test(issuesTxt) && /point\(s\) à vérifier/.test(await pq.textContent('#pvSum')), 'aperçu : contrôle qualité — anomalies affichées (non numérique, variantes, doublons)');
  const profTxt = await pq.textContent('#pvProf');
  A(/Commune/.test(profTxt) && /Nb/.test(profTxt) && /Distincts/.test(profTxt) && /Médiane/.test(profTxt), 'aperçu : tableau de profil par champ');
  await pq.click('#dlgPreview [data-pv="rows"]'); await pq.waitForTimeout(150);
  A(await pq.isVisible('#pvRowsBox table') && (await pq.$$('#pvRowsBox tbody tr')).length === 14 && /Anvers/.test(await pq.textContent('#pvRowsBox')) && await pq.isHidden('#pvQual'), 'aperçu : aperçu des lignes (14 lignes de données, champ Source compris)');
  await pq.click('#dlgPreview [data-pv="raw"]'); await pq.waitForTimeout(150);
  A(await pq.isVisible('#pvRawBox table') && (await pq.$$('#pvRawBox tr.hdrrow')).length === 1 && /Ligne d'en-tête retenue : 1/.test(await pq.textContent('#pvRawInfo')) && /q\.xlsx/.test(await pq.textContent('#pvSrc')), 'aperçu : fichier brut — ligne d\'en-tête surlignée et indiquée');
  const [dlQ] = await Promise.all([pq.waitForEvent('download'), pq.click('#pvCsv')]);
  const csvQ = fs.readFileSync(await dlQ.path(), 'utf8');
  A(dlQ.suggestedFilename() === 'rapport-qualite.csv' && /Champ;Type;Remplis/.test(csvQ) && /Commune/.test(csvQ) && /Anomalies/.test(csvQ) && /À vérifier/.test(csvQ), 'aperçu : export du rapport en CSV (profil + anomalies)');
  await pq.click('#pvClose'); await pq.waitForTimeout(100);
  A(await pq.isHidden('#dlgPreview'), 'aperçu : fermeture');
  await ctxQ.close();

  // Info-bulle : nom complet d'un champ tronqué
  const fLong = mk('long.xlsx', [['une_colonne_au_nom_vraiment_tres_long_a_afficher_en_entier', 'Nb'], ['x', 1], ['y', 2]]);
  const ctxT2 = await b.newContext({ viewport: { width: 1500, height: 900 } }), pt2 = await ctxT2.newPage();
  pt2.on('pageerror', e => errs.push(e.message));
  await pt2.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pt2.setInputFiles('#fileIn', [fLong]); await pt2.waitForTimeout(400);
  const longFld = '#fields .fld:has(.fl[data-full="une_colonne_au_nom_vraiment_tres_long_a_afficher_en_entier"]) .fl';
  A(await pt2.evaluate(sel => { const e = document.querySelector(sel); return e.scrollWidth > e.clientWidth; }, longFld), 'info-bulle : le nom long est bien tronqué dans la liste des champs');
  await pt2.hover(longFld); await pt2.waitForTimeout(120);
  A(await pt2.isVisible('#fieldTip') && await pt2.textContent('#fieldTip') === 'une_colonne_au_nom_vraiment_tres_long_a_afficher_en_entier', 'info-bulle : le nom complet s\'affiche immédiatement au survol');
  const tipBox = await pt2.evaluate(() => { const r = document.querySelector('#fieldTip').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, iw: innerWidth, ih: innerHeight }; });
  A(tipBox.l >= 0 && tipBox.r <= tipBox.iw && tipBox.t >= 0 && tipBox.b <= tipBox.ih, 'info-bulle : entièrement dans la fenêtre');
  await pt2.hover('#fields .fld:has(.fl[data-full="Nb"]) .fl'); await pt2.waitForTimeout(100);
  A(await pt2.isHidden('#fieldTip'), 'info-bulle : rien pour un nom qui n\'est pas tronqué');
  await pt2.hover(longFld); await pt2.waitForTimeout(80); await pt2.mouse.move(700, 600); await pt2.waitForTimeout(100);
  A(await pt2.isHidden('#fieldTip'), 'info-bulle : disparaît quand la souris quitte le nom');
  await ctxT2.close();

  // Liste des données (composant table) dans l'interface
  const bigRows = [['Commune', 'Nb', 'Date']];
  for (let i = 0; i < 250; i++) bigRows.push([['Anvers', 'Gand', 'Liège', 'Namur'][i % 4] + ' ' + (i % 7), i + 1, '0' + (1 + i % 9) + '/03/2024']);
  const fBig = mk('big-liste.xlsx', bigRows);
  const ctxL = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }), pl = await ctxL.newPage();
  pl.on('pageerror', e => errs.push(e.message));
  await pl.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pl.setInputFiles('#fileIn', [fBig]); await pl.waitForTimeout(500);
  { const pvv = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8').match(/PIVOT_VERSION = '(\d+\.\d+\.\d+)'/)[1]; A(await pl.textContent('#pvVer') === 'v' + pvv && fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8').includes('Pivot ' + pvv), 'version : numéro affiché à côté du titre, identique à celui du CHANGELOG'); }
  { const pvr = await ctxL.newPage(); await pvr.route('**/index.html', async r => { const rs = await r.fetch(); await r.fulfill({ response: rs, body: (await rs.text()).replace(/<small id="pvVer"[^>]*><\/small>/, '') }); }); await pvr.goto(srv.url + '/index.html', { waitUntil: 'load' }); A(/^v\d+\.\d+\.\d+$/.test(await pvr.textContent('header #pvVer')) && await pvr.isVisible('#pvVer'), 'version : badge ajouté par le script même avec une page HTML en cache sans élément'); await pvr.close(); }
  A(await pl.isHidden('#listBar') && await pl.inputValue('#optMode') === 'pivot', 'liste : mode « Tableau croisé » par défaut, barre de liste masquée');
  await pl.selectOption('#optMode', 'list'); await pl.waitForTimeout(300);
  const lsRows = () => pl.$$eval('#out tbody tr', e => e.length), lsHead = () => pl.$$eval('#out thead th', e => e.map(x => x.textContent.replace(/[▲▼]/g, '').trim()).join('|'));
  A(await pl.isVisible('#listBar') && await lsRows() === 100 && /Commune\|Nb\|Date/.test(await lsHead()) && /250 ligne/.test(await pl.textContent('#info')) && /page 1 \/ 3/.test(await pl.textContent('#lsPage')) && await pl.isDisabled('#lsPrev'), 'liste : toutes les données par pages de 100 (250 lignes → 3 pages), colonnes = champs');
  await pl.click('#lsNext'); await pl.waitForTimeout(100);
  A(/page 2 \/ 3/.test(await pl.textContent('#lsPage')) && /101/.test(await pl.textContent('#out tbody tr:first-child')), 'liste : page suivante');
  await pl.click('#lsNext'); await pl.waitForTimeout(100);
  A(await lsRows() === 50 && await pl.isDisabled('#lsNext'), 'liste : dernière page (50 lignes)');
  await pl.fill('#lsQ', 'gand 3'); await pl.waitForTimeout(500);
  const lsTxt = await pl.textContent('#out');
  A(/Gand 3/.test(lsTxt) && !/Anvers/.test(lsTxt) && /page 1 \/ 1/.test(await pl.textContent('#lsPage')) && /sur 250 après filtres/.test(await pl.textContent('#info')), 'liste : recherche texte (sans casse) dans les colonnes affichées');
  await pl.fill('#lsQ', ''); await pl.waitForTimeout(500);
  await pl.click('#out thead th:has-text("Nb")'); await pl.click('#out thead th:has-text("Nb")'); await pl.waitForTimeout(200);
  A(/250/.test(await pl.textContent('#out tbody tr:first-child')) && /▼/.test(await pl.textContent('#out thead')), 'liste : tri par clic sur l\'en-tête (numérique, décroissant au 2e clic)');
  await pl.click('#lsCols'); await pl.waitForTimeout(100);
  await pl.uncheck('#lcList label:has-text("Date") input'); await pl.click('#lcOk'); await pl.waitForTimeout(200);
  A(!/Date/.test(await lsHead()) && /Commune\|Nb/.test(await lsHead()), 'liste : choix des colonnes affichées');
  const [dlLs] = await Promise.all([pl.waitForEvent('download'), xclick(pl, '#btnCsv')]);
  const csvLs = fs.readFileSync(await dlLs.path(), 'utf8').replace(/^\ufeff/, '').split(/\r?\n/);
  A(dlLs.suggestedFilename() === 'liste-donnees.csv' && /^Source;Commune;Nb$/.test(csvLs[0].trim()) && !/Date/.test(csvLs[0]) && csvLs.filter(Boolean).length === 251, 'liste : export CSV de la liste (colonnes choisies, 250 lignes)');
  await vact(pl, 'dash'); await pl.waitForTimeout(300);
  A(await pl.isVisible('#dash .tile table.ls') && (await pl.$$('#dash .tile table.ls tbody tr')).length === 200, 'liste : tuile du tableau de bord = liste (200 premières lignes)');
  await vact(pl, 'dash'); await pl.selectOption('#optMode', 'pivot'); await pl.waitForTimeout(200);
  A(await pl.isHidden('#listBar') && await pl.isVisible('#out table.pv:not(.ls)'), 'liste : retour au tableau croisé');
  await ctxL.close();

  // Groupes de valeurs dans l'interface
  const fGr = mk('groupes.xlsx', [['Etat civil', 'Age', 'Nb'], ['Single', 17, 1], ['Married', 18, 1], ['Divorced', 24, 1], ['Separated', 25, 1], ['Widowed', 80, 1], ['Single', 30, 1], ['Other', 34, 1]]);
  const ctxGr = await b.newContext({ viewport: { width: 1500, height: 900 } }), pgr = await ctxGr.newPage();
  pgr.on('pageerror', e => errs.push(e.message));
  await pgr.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pgr.setInputFiles('#fileIn', [fGr]); await pgr.waitForTimeout(500);
  await wzOpen(pgr, 3); await pgr.evaluate(() => { document.getElementById('detGrp').open = true; }); await pgr.waitForTimeout(200);
  await pgr.selectOption('#gSrc', { label: 'Etat civil' }); await pgr.waitForTimeout(100);
  A((await pgr.$$('#gList input')).length === 6 && /Single/.test(await pgr.textContent('#gList')) && await pgr.isHidden('#gRanges'), 'groupes (UI) : valeurs distinctes du champ proposées');
  await pgr.selectOption('#gSrc', { label: 'Etat civil' });
  await pgr.check('#gList input[value="Divorced"]'); await pgr.check('#gList input[value="Separated"]'); await pgr.fill('#gLabel', 'Divorcé(e)'); await pgr.click('#gAdd'); await pgr.waitForTimeout(100);
  A(/Divorcé\(e\)/.test(await pgr.textContent('#gDraft')) && await pgr.isDisabled('#gList input[value="Divorced"]'), 'groupes (UI) : groupe créé avec les valeurs cochées (valeurs déjà prises désactivées)');
  await pgr.selectOption('#gRest', 'other'); await pgr.fill('#gName', 'État regroupé'); await pgr.click('#gSave'); await pgr.waitForTimeout(300);
  A(/État regroupé/.test(await pgr.textContent('#gDefs')) && await pgr.evaluate(() => [...document.querySelectorAll('#fields .fld .fl')].some(x => x.textContent === 'État regroupé')), 'groupes (UI) : nouveau champ ajouté à la liste des champs');
  await pgr.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'État regroupé').querySelector('button[data-z="rows"]').click()); await pgr.waitForTimeout(300);
  A(/Divorcé\(e\)/.test(await pgr.textContent('#out')) && /Autres/.test(await pgr.textContent('#out')) && !/Single/.test(await pgr.textContent('#out')), 'groupes (UI) : le champ s\'utilise en lignes du tableau croisé');
  await pgr.selectOption('#gKind', 'ranges'); await pgr.waitForTimeout(100);
  A(await pgr.isVisible('#gRanges') && await pgr.isHidden('#gValues') && (await pgr.$$eval('#gSrc option', e => e.map(x => x.textContent))).join() === 'Age,Nb', 'groupes (UI) : tranches → seulement les champs numériques');
  await pgr.selectOption('#gSrc', { label: 'Age' }); await pgr.fill('#gBreaks', '18, 25, 35'); await pgr.fill('#gName', 'Âge en tranches'); await pgr.waitForTimeout(100);
  A(/< 18 \| 18–24 \| 25–34 \| 35\+/.test(await pgr.textContent('#gPrev')), 'groupes (UI) : aperçu des tranches');
  await pgr.fill('#gBreaks', '17,24,34'); await pgr.selectOption('#gEdge', 'end'); await pgr.waitForTimeout(100);
  A(/≤ 17 \| 18–24 \| 25–34 \| 35\+/.test(await pgr.textContent('#gPrev')), 'groupes (UI) : seuils séparés par de simples virgules, sens « fin de tranche »');
  await pgr.fill('#gBreaks', '18, 25, 35'); await pgr.selectOption('#gEdge', 'start');
  await pgr.click('#gSave'); await pgr.waitForTimeout(300);
  await pgr.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'Âge en tranches').querySelector('button[data-z="cols"]').click()); await pgr.waitForTimeout(300);
  A(/18–24/.test(await pgr.textContent('#out')) && /35\+/.test(await pgr.textContent('#out')), 'groupes (UI) : tranches utilisables en colonnes');
  await pgr.fill('#gStep', '10'); await pgr.click('#gAuto'); await pgr.waitForTimeout(100);
  A(await pgr.inputValue('#gBreaks') === '20, 30, 40, 50, 60, 70, 80', 'groupes (UI) : seuils réguliers générés');
  await pgr.click('#gDefs [data-gact="edit"][data-gid="g2"]'); await pgr.fill('#gBreaks', '18, 65'); await pgr.fill('#gLabels', 'Jeunes; Adultes; Aînés'); await pgr.click('#gSave'); await pgr.waitForTimeout(300);
  A(/Jeunes/.test(await pgr.textContent('#out')) && /Aînés/.test(await pgr.textContent('#out')) && (await pgr.$$('#gDefs .cl')).length === 2, 'groupes (UI) : modification (libellés personnalisés) ; le champ reste en colonnes');
  await pgr.click('#gDefs [data-gact="edit"][data-gid="g2"]'); await pgr.fill('#gName', 'Etat civil'); await pgr.click('#gSave');
  A(/déjà/.test(await pgr.textContent('#gMsg')), 'groupes (UI) : nom déjà pris refusé');
  await pgr.waitForTimeout(1500);
  await pgr.reload({ waitUntil: 'load' }); await pgr.waitForTimeout(1000);
  A((await pgr.$$('#gDefs .cl')).length === 2 && /Jeunes/.test(await pgr.textContent('#out')) && /Divorcé\(e\)/.test(await pgr.textContent('#out')), 'groupes (UI) : conservés après rechargement (session) avec leur utilisation dans le tableau');
  await pgr.click('#btnProj'); await pgr.waitForTimeout(150);
  const [dlG] = await Promise.all([pgr.waitForEvent('download'), pgr.click('#projList .pl.cur [data-pact="export"]')]);
  const gProj = JSON.parse(fs.readFileSync(await dlG.path(), 'utf8'));
  A(Array.isArray(gProj.state.groups) && gProj.state.groups.length === 2 && gProj.state.groups.some(g => g.kind === 'ranges' && g.breaks.join() === '18,65'), 'groupes : inclus dans l\'export de projet');
  await pgr.click('#projClose');
  await vact(pgr, 'dup'); await pgr.waitForTimeout(300);   // 2e vue (copie : contient le groupe g1 en lignes) ; la vue active est maintenant la copie
  await wzOpen(pgr, 3); await pgr.evaluate(() => { document.getElementById('detGrp').open = true; });
  await pgr.click('#gDefs [data-gact="del"][data-gid="g1"]'); await pgr.waitForTimeout(300);
  A((await pgr.$$('#gDefs .cl')).length === 1 && !(await pgr.evaluate(() => [...document.querySelectorAll('#fields .fld .fl')].some(x => x.textContent === 'État regroupé'))), 'groupes (UI) : suppression (le champ disparaît de la liste)');
  await pgr.selectOption('#gSrc', { label: 'Etat civil' }); await pgr.check('#gList input[value="Single"]'); await pgr.fill('#gLabel', 'Seuls'); await pgr.click('#gAdd'); await pgr.fill('#gName', 'Nouveau groupe'); await pgr.click('#gSave'); await pgr.waitForTimeout(300);   // réutilise l'identifiant g1
  const dropRows = async v => { await vview(pgr, v); await pgr.waitForTimeout(300); return pgr.textContent('.zone[data-zone="rows"]'); };
  const dropV1 = await dropRows('v1'), dropV2 = await dropRows('v2');
  A(!/Nouveau groupe/.test(dropV1) && !/Nouveau groupe/.test(dropV2) && !/État regroupé/.test(dropV1 + dropV2), 'groupes (UI) : un groupe supprimé quitte toutes les vues — un nouveau groupe qui reprend son identifiant ne retrouve pas ses anciens emplacements');
  await ctxGr.close();

  // Mesures dans l'interface
  const ctxMes = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }), pmes = await ctxMes.newPage();
  pmes.on('pageerror', e => errs.push(e.message));
  await pmes.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await pmes.setInputFiles('#fileIn', [fGr]); await pmes.waitForTimeout(500);
  await wzOpen(pmes, 3); await pmes.evaluate(() => { document.getElementById('detMes').open = true; }); await pmes.waitForTimeout(100);
  await pmes.fill('#mName', 'Nb célibataires'); await pmes.click('#mAddCond'); await pmes.selectOption('#mConds [data-f="key"]', { label: 'Etat civil' }); await pmes.fill('#mConds [data-f="v"]', 'Single'); await pmes.dispatchEvent('#mConds [data-f="v"]', 'change');
  await pmes.click('#mSave'); await pmes.waitForTimeout(300);
  A(/Nb célibataires/.test(await pmes.textContent('#mDefs')) && await pmes.evaluate(() => [...document.querySelectorAll('#fields .fld .fl')].some(x => x.textContent === 'Nb célibataires')), 'mesures (UI) : mesure créée avec un critère, ajoutée à la liste des champs');
  await pmes.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === 'Nb célibataires').querySelector('button[data-z="vals"]').click()); await pmes.waitForTimeout(300);
  A(/Nb célibataires/.test(await pmes.textContent('#out thead')) && (await pmes.$$eval('#out tbody tr:first-child td', e => e.map(x => x.textContent.trim()))).includes('2'), 'mesures (UI) : posée dans Valeurs, 2 célibataires comptés (agrégat par défaut : somme)');
  await pmes.fill('#mName', '% célibataires'); await pmes.selectOption('#mKind', 'pct'); await pmes.click('#mAddCond'); await pmes.selectOption('#mConds [data-i="0"] [data-f="key"]', { label: 'Etat civil' }); await pmes.fill('#mConds [data-i="0"] [data-f="v"]', 'Single'); await pmes.dispatchEvent('#mConds [data-i="0"] [data-f="v"]', 'change');
  await pmes.click('#mSave'); await pmes.waitForTimeout(300);
  await pmes.evaluate(() => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === '% célibataires').querySelector('button[data-z="vals"]').click()); await pmes.waitForTimeout(300);
  A(await pmes.evaluate(() => __pivot.st.L.vals.find(v => v.key.startsWith('mes|m2')).agg === 'avg') && (await pmes.$$eval('#out tbody tr:first-child td', e => e.map(x => x.textContent.trim()))).some(t => /^28[,.]\d/.test(t)), 'mesures (UI) : mesure en % → moyenne par défaut (2 / 7 = 28,6 %)');
  await pmes.fill('#mName', 'Nb célibataires'); await pmes.click('#mSave');
  A(/déjà/.test(await pmes.textContent('#mMsg')), 'mesures (UI) : nom déjà pris refusé');
  await pmes.fill('#mName', 'Critère vide'); await pmes.click('#mAddCond'); await pmes.click('#mSave');
  A(/Complétez/.test(await pmes.textContent('#mMsg')), 'mesures (UI) : critère sans valeur refusé');
  await pmes.waitForTimeout(1500); await pmes.reload({ waitUntil: 'load' }); await pmes.waitForTimeout(1000);
  A((await pmes.$$('#mDefs .cl')).length === 2 && /Nb célibataires/.test(await pmes.textContent('#out thead')), 'mesures (UI) : conservées après rechargement (session) avec leur utilisation');
  await pmes.click('#btnProj'); await pmes.waitForTimeout(150);
  const [dlMes] = await Promise.all([pmes.waitForEvent('download'), pmes.click('#projList .pl.cur [data-pact="export"]')]);
  const mesProj = JSON.parse(fs.readFileSync(await dlMes.path(), 'utf8'));
  A(Array.isArray(mesProj.state.measures) && mesProj.state.measures.length === 2 && mesProj.state.measures[0].conds[0].v === 'Single', 'mesures : incluses dans l\'export de projet');
  await pmes.click('#projClose');
  await wzOpen(pmes, 3); await pmes.evaluate(() => { document.getElementById('detMes').open = true; }); await pmes.click('#mDefs [data-mact="edit"][data-mid="m1"]'); await pmes.fill('#mName', 'Célibataires (nb)'); await pmes.click('#mSave'); await pmes.waitForTimeout(300);
  A(/Célibataires \(nb\)/.test(await pmes.textContent('#mDefs')) && /Célibataires \(nb\)/.test(await pmes.textContent('#out thead')), 'mesures (UI) : renommer une mesure met à jour le tableau');
  await pmes.click('#mDefs [data-mact="del"][data-mid="m2"]'); await pmes.waitForTimeout(300);
  A((await pmes.$$('#mDefs .cl')).length === 1 && !(await pmes.evaluate(() => [...document.querySelectorAll('#fields .fld .fl')].some(x => x.textContent === '% célibataires'))), 'mesures (UI) : suppression (la mesure disparaît des champs et du tableau)');
  // titre de tableau
  await wzClose(pmes);
  await pmes.evaluate(() => { document.querySelector('#optCap').closest('details').open = true; });
  await tpo(pmes); await pmes.fill('#optCap', 'Mon tableau'); await pmes.dispatchEvent('#optCap', 'change'); await pmes.selectOption('#optCapH', 'center'); await pmes.selectOption('#optCapV', 'bottom'); await pmes.waitForTimeout(200); await tpc(pmes);
  A(await pmes.$eval('#out table caption', e => e.textContent === 'Mon tableau' && e.style.captionSide === 'bottom' && e.style.textAlign === 'center'), 'tableau (UI) : titre positionné (centre, en dessous)');
  await ctxMes.close();

  // Session mémorisée (IndexedDB) : survit à une actualisation ; effaçable ; désactivable
  const ctxS = await b.newContext(), ps = await ctxS.newPage();
  ps.on('pageerror', e => errs.push(e.message));
  await ps.goto(srv.url + '/index.html', { waitUntil: 'load' });
  await ps.setInputFiles('#fileIn', [f1, f2]); await ps.waitForTimeout(400);
  await ps.evaluate(() => {
    const add = (l, z) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click();
    add('Commune', 'rows'); add('Trimestre', 'cols'); add('Nombre d\'établissements', 'vals');
  });
  await ps.selectOption('#optSort', 'desc'); await tpo(ps); await ps.selectOption('#optStyle', 'statbel'); await tpc(ps);
  await ps.waitForTimeout(1400);
  A(/mémorisée/.test(await ps.textContent('#ssMsg')), 'session : « Session mémorisée » affiché après les changements');
  await ps.reload({ waitUntil: 'load' }); await ps.waitForTimeout(900);
  const restaure = await ps.evaluate(() => ({ n: __pivot.st.sources.length, rows: __pivot.st.rows.length, L: __pivot.st.L.rows.join() + '|' + __pivot.st.L.cols.join(), sort: __pivot.st.L.sort && __pivot.st.L.sort.dir, style: __pivot.st.o.style, out: document.querySelector('#out').textContent, msg: document.querySelector('#ssMsg').textContent }));
  A(restaure.n === 2 && restaure.rows === 5 && /Anvers/.test(restaure.out) && /commune/.test(restaure.L) && restaure.sort === -1 && restaure.style === 'statbel' && /restaurée/.test(restaure.msg), 'session : après actualisation, fichiers, champs, tri et style retrouvés (' + restaure.n + ' sources, ' + restaure.rows + ' lignes)');
  await xclick(ps, '#sources .src [data-act="delsrc"]'); await ps.waitForTimeout(1400);
  await ps.reload({ waitUntil: 'load' }); await ps.waitForTimeout(900);
  A((await ps.$$('#sources .src')).length === 1, 'session : le retrait d\'un fichier est mémorisé aussi');
  await xclick(ps, '#ssClear'); await ps.waitForTimeout(400);
  await ps.reload({ waitUntil: 'load' }); await ps.waitForTimeout(700);
  A((await ps.$$('#sources .src')).length === 0, 'session : « Oublier la session mémorisée » → page vide après actualisation');
  await ps.setInputFiles('#fileIn', [f1]); await ps.waitForTimeout(400);
  await ps.evaluate(() => { const c = document.querySelector('#ssRemember'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await ps.waitForTimeout(1400);
  await ps.reload({ waitUntil: 'load' }); await ps.waitForTimeout(700);
  A((await ps.$$('#sources .src')).length === 0 && !(await ps.isChecked('#ssRemember')), 'session : mémorisation désactivée → rien n\'est conservé, la préférence est retenue');
  await ctxS.close();

  // Dispositions enregistrées : enregistrer, modifier, réappliquer, exporter, importer, supprimer
  p.on('dialog', d => d.accept());
  await p.evaluate(() => { document.getElementById('detLayouts').open = true; });
  const layout = () => p.evaluate(() => JSON.stringify([__pivot.st.L.rows, __pivot.st.L.cols, __pivot.st.o.style]));
  await tpo(p); await p.selectOption('#optStyle', 'bandes'); await tpc(p);
  const avantLy = await layout();
  await p.fill('#lyName', 'Ma vue test'); await p.click('#lySave'); await p.waitForTimeout(100);
  A((await p.$$eval('#lySel option', o => o.map(x => x.value))).includes('Ma vue test') && /enregistrée/.test(await p.textContent('#lyMsg')), 'disposition enregistrée et listée');
  await p.click('#btnReset'); await tpo(p); await p.selectOption('#optStyle', 'sombre'); await p.waitForTimeout(100); await tpc(p);
  A((await layout()) !== avantLy, 'disposition modifiée (réinitialisation + style sombre)');
  await p.selectOption('#lySel', 'Ma vue test'); await p.click('#lyApply'); await p.waitForTimeout(150);
  A((await layout()) === avantLy && /appliquée/.test(await p.textContent('#lyMsg')) && (await p.inputValue('#lyName')) === 'Ma vue test', 'disposition réappliquée : champs, tris et style retrouvés');
  const [dlLy] = await Promise.all([p.waitForEvent('download'), p.click('#lyExport')]);
  const lyJson = JSON.parse(fs.readFileSync(await dlLy.path(), 'utf8'));
  A(dlLy.suggestedFilename() === 'disposition-ma-vue-test.json' && lyJson.v === 1 && lyJson.name === 'Ma vue test' && Array.isArray(lyJson.rows) && lyJson.opts.style === 'bandes' && !JSON.stringify(lyJson).includes('Anvers'), 'export .json : disposition sans données');
  await p.setInputFiles('#lyFile', { name: 'mauvais.json', mimeType: 'application/json', buffer: Buffer.from('{"v":9}') }); await p.waitForTimeout(100);
  A(/invalide/.test(await p.textContent('#lyMsg')), 'import d\'un fichier invalide refusé avec un message');
  const importee = Object.assign({}, lyJson, { name: 'Importée', rows: ['f:commune', 'f:inconnu'] });
  await p.click('#btnReset');
  await p.setInputFiles('#lyFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importee)) }); await p.waitForTimeout(200);
  A((await p.$$eval('#lySel option', o => o.map(x => x.value))).includes('Importée') && /inconnu/.test(await p.textContent('#lyMsg')) && JSON.parse(await layout())[0].join() === 'f:commune', 'import valide : enregistré, appliqué, champ absent signalé');
  await p.selectOption('#lySel', 'Importée'); await p.click('#lyDel'); await p.waitForTimeout(100);
  await p.selectOption('#lySel', 'Ma vue test'); await p.click('#lyDel'); await p.waitForTimeout(100);
  A((await p.$$eval('#lySel option', o => o.length)) === 1, 'dispositions supprimées');
  await tpo(p); await p.selectOption('#optStyle', 'standard'); await tpc(p);

  // Cube de données : champ du graphique par défaut + champs de filtrage (sélecteurs globaux), exception par vue, persistance
  { const ctxQ = await b.newContext({ viewport: { width: 1500, height: 900 } }), pq = await ctxQ.newPage();
    pq.on('pageerror', e => errs.push(e.message));
    await pq.goto(srv.url + '/index.html', { waitUntil: 'load' });
    await pq.setInputFiles('#fileIn', [{ name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from('Région;Province;Commune;Nb\nFlandre;Anvers;Anvers;10\nFlandre;Anvers;Malines;5\nFlandre;Limbourg;Hasselt;7\nWallonie;Liège;Liège;8\nWallonie;Namur;Namur;3\n') }]); await pq.waitForTimeout(700);
    const qadd = (l, z) => pq.evaluate(([l, z]) => [...document.querySelectorAll('#fields .fld')].find(x => x.querySelector('.fl').textContent === l).querySelector('button[data-z="' + z + '"]').click(), [l, z]);
    await qadd('Région', 'rows'); await qadd('Commune', 'rows'); await qadd('Nb', 'vals'); await pq.selectOption('#chType', 'hbar'); await pq.waitForTimeout(300);
    const qtxt = () => pq.$eval('#chart', e => e.textContent);
    const q0 = await qtxt();
    await pq.click('#btnCube'); await pq.waitForTimeout(200);
    await pq.selectOption('#cu_chart', { label: 'Commune' }); await pq.check('#cu_filters label:has-text("Région") input'); await pq.check('#cu_filters label:has-text("Province") input'); await pq.click('#cu_save'); await pq.waitForTimeout(500);
    const q1 = await qtxt();
    A(/Flandre › Anvers/.test(q0) && /Liège/.test(q1) && !/›/.test(q1) && /par Commune/.test(q1), 'cube : le champ du graphique par défaut (Commune) s\'applique à un graphique sans réglage propre');
    await pq.evaluate(() => document.querySelector('#viewTabs [data-vact="dash"]').click()); await pq.waitForTimeout(500);
    const gcount = await pq.$$eval('#dash select[data-gsel]', e => e.length);
    await pq.selectOption('#dash select[data-gsel]', 'Flandre'); await pq.waitForTimeout(500);
    const qt = await pq.$eval('#dash .tile .tbody', e => e.textContent);
    A(gcount === 2 && /Hasselt/.test(qt) && !/Liège|Namur|›/.test(qt), 'cube : les champs de filtrage deviennent des filtres globaux (Région, Province) ; le graphique ne garde que Commune');
    await pq.click('#dash .tile [data-tact="chart"]'); await pq.waitForTimeout(200);
    const lab = await pq.$$eval('#ce_cdim option', e => e.map(x => x.textContent).join('|'));
    await pq.selectOption('#ce_cdim', '-'); await pq.waitForTimeout(300); await pq.click('#ce_save'); await pq.waitForTimeout(500);
    const qt2 = await pq.$eval('#dash .tile .tbody', e => e.textContent);
    A(/^Défaut du cube : Commune\|Comme le tableau\|/.test(lab) && /Flandre › Anvers/.test(qt2), 'cube : une vue peut s\'en écarter (« Comme le tableau »), la liste du champ propose le défaut du cube');
    await pq.waitForTimeout(1500); await pq.reload({ waitUntil: 'load' }); await pq.waitForTimeout(1400);
    A(await pq.evaluate(() => __pivot.st.cube.chart !== '' && __pivot.st.cube.filters.length === 2 && __pivot.st.dash.sel.length === 2), 'cube : retrouvé après rechargement (session)');
    await ctxQ.close(); }
  A(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close();
  srv.close && srv.close();
  console.log(fails ? fails + ' échec(s)' : 'OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('pivot-tool diagnostic:', e && (e.stack || e)); process.exit(1); });
