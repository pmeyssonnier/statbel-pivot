/*
 * Test de l'outil Tableaux croisés — index.html — Moteur : parseNumber, unify, compute, drill, formats, filtres, top N, champs calculés, jointures, qualité, géo, graphiques purs, session (parties pures), export CSV/TSV.
 * (Découpé de l'ancien tests/pivot-tool.test.js en suites indépendantes, exécutées en parallèle : seule la
 *  couverture de la page par scénarios change, pas son contenu.)
 *
 * Lancer :  CHROMIUM_PATH=… node tests/moteur.test.js
 */
const path = require('path'), fs = require('fs');
const E = require('../js/engine.js');
const PF = require('../js/format.js');
const XLSX = require('../vendor/xlsx/xlsx.full.min.js');
let fails = 0;
const A = (cond, msg) => { if (!cond) { fails++; console.log('✗ FAIL ' + msg); } else console.log('✓ ' + msg); };

// ---------- moteur ----------
A(E.parseNumber('2.584') === 2584 && E.parseNumber('1,5') === 1.5 && E.parseNumber('0.123') === 0.123 && E.parseNumber('1 234,5') === 1234.5 && isNaN(E.parseNumber('abc')), 'parseNumber (formats belges)');
A(E.normName('  Localisation de l’unité-établissement ') === 'localisation de l unite etablissement', 'normName');
A(E.parseCSV('a;b\n"x;1";2\n').length === 2 && E.parseCSV('a;b\n"x;1";2\n')[1][0] === 'x;1', 'parseCSV (séparateur ; + guillemets)');

const s1 = { id: 'a', label: 'f1', headerRow: 0, aoa: [['Commune', 'Trimestre', 'Nombre d\'établissements'], ['Anvers', '2024-T4', 100], ['Boom', '2024-T4', 10], ['Anvers', '2024-T3', 90]] };
const s2 = { id: 'b', label: 'f2', headerRow: 1, aoa: [['titre'], ['COMMUNE', 'Nb établissements', 'Trimestre'], ['Anvers', '1.000', '2024-T4'], ['Gand', '5', '2024-T4']] };
const u = E.unify([s1, s2], { 'b|1': 'Nombre d\'établissements' });
A(u.fields.length === 4 && u.rows.length === 5, 'unify : COMMUNE/Commune fusionnés + renommage (' + u.fields.map(f => f.label) + ')');
const nb = u.fields.find(f => /Nombre/.test(f.label));
A(nb.type === 'number' && u.rows.some(r => r[u.fields.indexOf(nb)] === 1000), 'type nombre + « 1.000 » → 1000');
const cat = E.buildCatalog(u.fields), key = l => cat.find(c => c.label === l).key;
const res = E.compute(u.rows, cat, { rows: [key('Commune')], cols: [key('Trimestre')], vals: [{ key: nb.key, agg: 'sum' }], filters: {}, sort: null });
const ant = res.rows.find(r => r.labels[0] === 'Anvers');
A(ant.tot[0] === 1190 && res.grand[0] === 1205, 'somme Anvers=1190, total=1205 (got ' + ant.tot[0] + '/' + res.grand[0] + ')');
const dr = E.drill(u.rows, cat, { rows: [key('Commune')], cols: [key('Trimestre')], vals: [], filters: {} }, ['Anvers'], ['2024-T4']);
A(dr.length === 2, 'drill : Anvers × 2024-T4 = 2 lignes (got ' + dr.length + ')');
const m = E.flatMatrix(res, { rowTot: true, colTot: true });
A(m[0].length === m[m.length - 1].length, 'flatMatrix rectangulaire');
const pct = E.compute(u.rows, cat, { rows: [key('Commune')], cols: [], vals: [{ key: nb.key, agg: 'pctgrand' }], filters: {}, sort: null });
A(Math.abs(pct.grand[0] - 100) < 1e-9, '% du total = 100 au total');
const filt = E.compute(u.rows, cat, { rows: [], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: { [key('Commune')]: new Set(['Boom']) }, sort: null });
A(filt.grand[0] === 4 && filt.rows.length === 1, 'filtre d\'exclusion + pivot sans dimension (got ' + filt.grand[0] + ')');

// Formats de nombres et mise en forme conditionnelle
const norm = s => s.replace(/[\s\u00a0\u202f]/g, ' ');
A(norm(PF.formatValue(1234.5, { agg: 'sum' }, 'auto')) === '1 234,5' && norm(PF.formatValue(1234.567, { agg: 'sum', fmt: 'int' })) === '1 235', 'format automatique / entier');
A(norm(PF.formatValue(0.256, { agg: 'sum', fmt: 'pct' })) === '25,6 %' && norm(PF.formatValue(25.6, { agg: 'pctgrand', fmt: 'pct' })) === '25,6 %', 'format pourcentage (×100, sauf agrégat déjà en %)');
A(norm(PF.formatValue(1234.5, { agg: 'sum', fmt: 'eur' })) === '1 234,50 €' && norm(PF.formatValue(12345, { agg: 'sum', fmt: 'k' })) === '12,3 k', 'format euro et milliers');
const stl = PF.buildStyler('rule', [[1, 5, 10]], { op: '>', val: '4,5' });
A(stl(10, 0).includes('#ffc7ce') && stl(1, 0) === '', 'règle conditionnelle valeur > 4,5');
const st3 = PF.buildStyler('scale3', [[0, 5, 10]]);
A(st3(0, 0).includes('rgb(248,105,107)') && st3(10, 0).includes('rgb(99,190,123)'), 'échelle 3 couleurs (min rouge, max vert)');
A(PF.buildStyler('scale3', [[1, 1, 1]])(1, 0) === '', 'colonne constante : pas de couleur');
A(PF.buildStyler('bars', [[0, 10]])(5, 0).includes('50%') && PF.buildStyler('none', [[1]])(1, 0) === '', 'barres de données 50 % ; aucune mise en forme');

// Session mémorisée : validation de ce qui est relu d'IndexedDB (parties pures)
const SSM = require('../js/session.js');
// Top N + « Autres » : classement par valeur, regroupement du reste, détail cohérent
const tnA = [['Commune', 'Année', 'Nb']];
[['A', 50], ['B', 40], ['C', 30], ['D', 20], ['E', 10], ['F', 5]].forEach(([c, v]) => { tnA.push([c, '2023', v]); tnA.push([c, '2024', v]); });
const tnU = E.unify([{ id: 'x', label: 'f', headerRow: 0, aoa: tnA }], {}), tnC = E.buildCatalog(tnU.fields), tnK = l => tnC.find(c => c.label === l).key;
const tnL = top => ({ rows: [tnK('Commune')], cols: [tnK('Année')], vals: [{ key: tnK('Nb'), agg: 'sum' }], filters: {}, sort: null, top });
const tn = E.compute(tnU.rows, tnC, tnL({ n: 3, k: 0, mode: 'top', others: true }));
A(tn.rows.map(r => r.labels[0]).join() === 'A,B,C,Autres' && tn.rows[3].tot[0] === 70 && tn.grand[0] === 310 && tn.top.hidden === 3 && tn.top.total === 6, 'Top 3 : A, B, C puis « Autres » (D+E+F = 70), total général inchangé');
const tnS = E.compute(tnU.rows, tnC, Object.assign(tnL({ n: 3, k: 0, mode: 'top', others: true }), { sort: { col: '__tot', k: 0, dir: 1 } }));
A(tnS.rows[tnS.rows.length - 1].labels[0] === 'Autres', 'Top N : « Autres » reste en dernier même avec un tri croissant');
const tnF = E.compute(tnU.rows, tnC, tnL({ n: 2, k: 0, mode: 'flop', others: false }));
A(tnF.rows.map(r => r.labels[0]).sort().join() === 'E,F' && tnF.grand[0] === 30 && tnF.nf === 4, 'Derniers 2 sans « Autres » : E et F seulement, le reste est écarté');
A(E.compute(tnU.rows, tnC, tnL({ n: 99, k: 0, mode: 'top', others: true })).rows.length === 6 && E.compute(tnU.rows, tnC, tnL(null)).top === null, 'Top N plus grand que le nombre de valeurs / désactivé : tableau complet');
const tnD = E.drill(tnU.rows, tnC, tnL({ n: 3, k: 0, mode: 'top', others: true }), ['Autres'], null, tn.top);
A(tnD.length === 6, 'détail d\'« Autres » : lignes des communes regroupées (' + tnD.length + ')');
A(E.drill(tnU.rows, tnC, tnL({ n: 2, k: 0, mode: 'top', others: false }), ['A'], null, E.compute(tnU.rows, tnC, tnL({ n: 2, k: 0, mode: 'top', others: false })).top).length === 2, 'détail d\'une ligne du palmarès inchangé');

// Renommage d'une valeur (champ calculé) : titre personnalisé, dispositions, nettoyage
const rnL = name => ({ rows: [tnK('Commune')], cols: [], vals: [{ key: tnK('Nb'), agg: 'sum', name }], filters: {}, sort: null });
A(E.compute(tnU.rows, tnC, rnL('Établissements')).specs[0].label === 'Établissements' && E.compute(tnU.rows, tnC, rnL('  ')).specs[0].label === 'Somme de Nb' && E.compute(tnU.rows, tnC, rnL(undefined)).specs[0].label === 'Somme de Nb', 'valeur renommée : titre personnalisé, vide → nom par défaut');
const rnLay = require('../js/layouts.js');
const rnS = rnLay.sanitize(rnLay.serialize(rnL('Mon \u0007titre'), {}));
A(rnS.vals[0].name === 'Mon  titre' && rnLay.sanitize(rnLay.serialize(rnL('x'.repeat(200)), {})).vals[0].name.length === 80 && rnLay.sanitize(rnLay.serialize(rnL(''), {})).vals[0].name === undefined && rnLay.apply(rnS, [tnK('Commune'), tnK('Nb')]).L.vals[0].name === 'Mon  titre', 'valeur renommée : conservée dans les dispositions, nettoyée et bornée');

// Champs calculés : formule sur les sommes de chaque cellule (vrai ratio à tous les niveaux)
const PCA = require('../js/calc.js');
const cA = [['Commune', 'Province', 'Établissements', 'Habitants']];
[['A', 'P1', 10, 1000], ['A', 'P1', 5, 500], ['B', 'P1', 2, 100], ['C', 'P2', 9, 0], ['D', 'P2', 1, 200]].forEach(r => cA.push(r));
const cU = E.unify([{ id: 'x', label: 'f', headerRow: 0, aoa: cA }], {}), cC0 = E.buildCatalog(cU.fields), cK = l => cC0.find(c => c.label === l).key;
const cDefs = [{ name: 'Pour 1000', formula: '[Établissements] / [habitants] * 1000' }, { name: 'Moy', formula: '[Établissements] / [Nombre de lignes]' }, { name: 'Mauvais', formula: '[Inconnu] + 1' }];
const cB = PCA.buildItems(cDefs, cC0), cCat = cC0.concat(cB.items);
A(cB.items.length === 2 && cB.errors.length === 1 && /Inconnu/.test(cB.errors[0].error), 'champ calculé : formule avec champ inconnu signalée, les autres ajoutées');
const cR = E.compute(cU.rows, cCat, { rows: [cK('Commune')], cols: [], vals: [{ key: 'calc|Pour 1000', agg: 'sum' }, { key: 'calc|Moy', agg: 'sum' }], filters: {}, sort: null });
const cRow = l => cR.rows.find(r => r.labels[0] === l);
A(Math.abs(cRow('A').tot[0] - 10) < 1e-9 && cRow('C').tot[0] === null && Math.abs(cR.grand[0] - 27 / 1800 * 1000) < 1e-9 && cRow('A').tot[1] === 7.5 && cR.specs[0].label === 'Pour 1000' && cR.specs[0].agg === 'calc', 'champ calculé : ratio des sommes (A = 15/1500), total général correct, division par zéro → vide');
const cP = E.compute(cU.rows, cCat, { rows: [cK('Province'), cK('Commune')], cols: [], vals: [{ key: 'calc|Pour 1000', agg: 'sum' }], filters: {}, sort: { col: cR.cols[0].key, k: 0, dir: -1 }, subtotals: true });
A(cP.rows[0].labels[0] === 'P2' && Math.abs(cP.subs[0].get('P1').tot[0] - 17 / 1600 * 1000) < 1e-9, 'champ calculé : tri hiérarchique et sous-total recalculés sur les sommes (P2 en tête : 50 contre 10,6)');
const cCmp = f => { const c = PCA.buildItems([{ name: 'T', formula: f }], cC0); return c.items.length ? 'ok' : c.errors[0].error; };
A(cCmp('SI([Habitants] > 0; [Établissements] / [Habitants]; 0) + ROUND(2,567; 1) + MAX(1; 2) - ABS(-3)') === 'ok' && /Parenthèse/.test(cCmp('([Habitants]')) && /Caractère inattendu/.test(cCmp('[Habitants] # 2')) && /au moins un champ/.test(cCmp('1 + 2')) && /Fonction inconnue/.test(cCmp('EVAL([Habitants])')) && /Écrivez/.test(cCmp('  ')), 'champ calculé : syntaxe (SI, ROUND, MAX, ABS) et messages d\'erreur clairs');
const cV = E.compute(cU.rows, E.buildCatalog(cU.fields).concat(PCA.buildItems([{ name: 'S', formula: 'SI([Habitants] > 600; 1; 0)' }], cC0).items), { rows: [cK('Commune')], cols: [], vals: [{ key: 'calc|S', agg: 'sum' }], filters: {}, sort: null });
A(cV.rows.find(r => r.labels[0] === 'A').tot[0] === 1 && cV.rows.find(r => r.labels[0] === 'B').tot[0] === 0, 'champ calculé : SI(condition ; alors ; sinon) évalué sur les sommes');
const cS = PCA.sanitizeDefs([{ name: ' Ratio ', formula: '[A]/[B]' }, { name: 'ratio', formula: 'dup' }, { name: '__proto__', formula: 'x' }, { name: '', formula: 'x' }, { name: 'Long', formula: 'y'.repeat(900) }, null]);
A(cS.length === 2 && cS[0].name === 'Ratio' && cS[1].formula.length === 500 && PCA.checkName('Établissements', [], cC0) !== '' && PCA.checkName('Neuf', cS, cC0) === '' && PCA.checkName('ratio', cS, cC0) !== '', 'champ calculé : définitions nettoyées, noms uniques, nom de colonne refusé');

// Filtres riches : texte, plage, top / flop (cumulables avec les valeurs exclues)
const fG = (rules, filters, rowsKey) => E.compute(cU.rows, cCat, { rows: rowsKey ? [rowsKey] : [], cols: [], vals: [{ key: cK('Établissements'), agg: 'sum' }], filters: filters || {}, rules, sort: null });
const fTot = r => r.grand[0], kCom = cK('Commune'), kEt = cK('Établissements'), kHab = cK('Habitants'), kPro = cK('Province');
A(fTot(fG({ [kCom]: { text: { op: 'contains', q: 'a; b' } } })) === 17 && fTot(fG({ [kCom]: { text: { op: 'notcontains', q: 'a' } } })) === 12 && fTot(fG({ [kCom]: { text: { op: 'starts', q: 'c' } } })) === 9 && fTot(fG({ [kCom]: { text: { op: 'equals', q: 'd' } } })) === 1, 'filtre texte : contient (plusieurs termes = ou), ne contient pas, commence par, est égal à');
const fV = E.unify([{ id: 'v', label: 'v', headerRow: 0, aoa: [['Ville', 'V'], ['Liège', 5], ['Gand', 7], ['Anvers', 3]] }], {}), fVC = E.buildCatalog(fV.fields);
A(E.compute(fV.rows, fVC, { rows: [], cols: [], vals: [{ key: fVC.find(c => c.label === 'V').key, agg: 'sum' }], filters: {}, rules: { [fVC.find(c => c.label === 'Ville').key]: { text: { op: 'contains', q: 'LIEGE' } } }, sort: null }).grand[0] === 5, 'filtre texte : sans tenir compte de la casse ni des accents');
A(fTot(fG({ [kEt]: { range: { min: 2, max: 9 } } })) === 16 && fG({ [kEt]: { range: { min: 2, max: 9 } } }).nf === 3 && fTot(fG({ [kEt]: { range: { min: 9 } } })) === 19 && fTot(fG({ [kEt]: { range: { max: 1 } } })) === 1, 'filtre plage (nombres) : bornes incluses, minimum seul, maximum seul');
const fD = E.unify([{ id: 'd', label: 'd', headerRow: 0, aoa: [['Jour', 'N'], [new Date(2024, 0, 5, 12), 1], [new Date(2024, 1, 10, 12), 2], [new Date(2024, 2, 31, 12), 4], [new Date(2024, 3, 1, 12), 8]] }], {}), fDC = E.buildCatalog(fD.fields);
const fDk = fDC.find(c => c.label === 'Jour').key, fDn = fDC.find(c => c.label === 'N').key;
A(E.compute(fD.rows, fDC, { rows: [], cols: [], vals: [{ key: fDn, agg: 'sum' }], filters: {}, rules: { [fDk]: { range: { min: '2024-02-01', max: '2024-03-31' } } }, sort: null }).grand[0] === 6, 'filtre plage (dates) : du 01/02 au 31/03 inclus (le 05/01 et le 01/04 sont exclus)');
A(fTot(fG({ [kCom]: { top: { n: 2, mode: 'top', by: kEt, agg: 'sum' } } })) === 24 && fTot(fG({ [kCom]: { top: { n: 1, mode: 'flop', by: kEt, agg: 'sum' } } })) === 1 && fTot(fG({ [kCom]: { top: { n: 1, mode: 'top', by: kHab, agg: 'avg' } } })) === 15 && fTot(fG({ [kCom]: { top: { n: 2, mode: 'top', by: '__rows', agg: 'count' } } })) === 17, 'filtre top / flop : classement par somme, par moyenne, par nombre de lignes (indépendant des champs affichés)');
A(fTot(fG({ [kCom]: { top: { n: 2, mode: 'top', by: kEt, agg: 'sum' } } }, { [kCom]: new Set(['A']) })) === 11 && fTot(fG({ [kCom]: { top: { n: 2, mode: 'top', by: kEt, agg: 'sum' } }, [kPro]: { text: { op: 'equals', q: 'p1' } } })) === 17, 'filtre top : classé après les autres filtres (valeurs exclues, autres règles)');
const fL = { rows: [kPro], cols: [], vals: [{ key: kEt, agg: 'sum' }], filters: {}, rules: { [kCom]: { top: { n: 2, mode: 'top', by: kEt, agg: 'sum' } } }, sort: null };
const fR = E.compute(cU.rows, cCat, fL);
A(fR.rows.find(r => r.labels[0] === 'P1').tot[0] === 15 && fR.rows.find(r => r.labels[0] === 'P2').tot[0] === 9 && E.drill(cU.rows, cCat, fL, ['P1'], null).length === 2 && E.drill(cU.rows, cCat, fL, ['P2'], null).length === 1, 'filtre top : le détail d\'une cellule respecte les règles (P1 → 2 lignes, P2 → 1)');
const fPL = require('../js/layouts.js');
const fClean = fPL.cleanRules({ [kCom]: { text: { op: 'regex', q: 'x' }, range: { min: 'x', max: 5 }, top: { n: 0, by: kEt } }, __proto__x: 5, [kEt]: { text: { op: 'contains', q: ' an ' }, range: { min: 3, max: '2024-01-01' }, top: { n: 5, mode: 'flop', by: kHab, agg: 'median' } }, bad: { text: { op: 'contains', q: 'x'.repeat(300) } } });
A(fClean[kCom] === undefined || (fClean[kCom].text === undefined && fClean[kCom].top === undefined), 'règles : opérateur inconnu et top invalide écartés') ;
A(fClean[kEt].text.q === 'an' && fClean[kEt].range.min === 3 && fClean[kEt].range.max === undefined && fClean[kEt].top.agg === 'sum' && fClean[kEt].top.mode === 'flop' && fClean.bad === undefined, 'règles : nettoyées (texte rogné, min/max de même nature, agrégat inconnu → somme, texte trop long écarté)');
const fRound = fPL.sanitize(fPL.serialize(fL, {}));
const fAp = fPL.apply(fRound, [kPro, kCom, kEt]), fAp2 = fPL.apply(fRound, [kPro, kCom]);
A(fRound.rules[kCom].top.n === 2 && fAp.L.rules[kCom].top.by === kEt && fAp2.L.rules[kCom] === undefined, 'règles : conservées dans les dispositions ; le top est abandonné si son champ de classement a disparu');

// Jointures entre fichiers
const PJN = require('../js/join.js');
const jL = { aoa: [['Code', 'Commune', 'Nb'], ['01001', 'Liège', 10], [2000, 'Anvers', 20], ['3000', 'GAND', 30], [4000, 'Namur', 40], [null, 'Sans code', 50]], headerRow: 0 };
const jR = { aoa: [['NIS', 'Province', 'Commune'], [1001, 'Liège (prov)', 'x'], ['2000', 'Anvers (prov)', 'y'], ['2000', 'Doublon', 'z'], [3000, 'Flandre or.', 'w']], headerRow: 0 };
const jB = (o) => PJN.build(Object.assign({ keys: [['Code', 'NIS']], type: 'left', dup: 'first', cols: null }, o), jL, jR);
const j1 = jB({});
A(j1.aoa[0].join() === 'Code,Commune,Nb,Province,Commune (droite)' && j1.aoa[1].slice(3).join() === 'Liège (prov),x' && j1.aoa[2][3] === 'Anvers (prov)' && j1.aoa[3][3] === 'Flandre or.' && j1.aoa[4][3] === null && j1.aoa[5][3] === null, 'jointure : clés « 01001 » = 1001, « 2000 » = 2000 ; colonne homonyme renommée « (droite) » ; sans correspondance → vide');
A(j1.stats.left === 5 && j1.stats.matched === 3 && j1.stats.unmatched === 2 && j1.stats.dupKeys === 1 && j1.stats.out === 5, 'jointure : statistiques (5 à gauche, 3 avec correspondance, 2 sans, 1 clé en double à droite)');
const j2 = jB({ type: 'inner' }), j3 = jB({ dup: 'all' });
A(j2.aoa.length === 4 && j2.aoa.every((r, i) => i === 0 || r[3] !== null) && j3.stats.out === 6 && j3.aoa.filter(r => r[0] === 2000).length === 2, 'jointure interne : seules les correspondances ; « toutes » multiplie les lignes à doublon (6 au lieu de 5)');
const j4 = PJN.build({ keys: [['Commune', 'Commune']], type: 'left', dup: 'first', cols: ['Province'] }, { aoa: [['Commune'], ['LIÈGE'], ['liege'], ['Namur']], headerRow: 0 }, { aoa: [['Commune', 'Province'], ['Liège', 'Liège']], headerRow: 0 });
A(j4.aoa.map(r => r[1]).join() === 'Province,Liège,Liège,' && PJN.build({ keys: [['Zzz', 'NIS']] }, jL, jR).error.includes('Zzz') && /clés/.test(PJN.build({ keys: [] }, jL, jR).error) && /Aucune colonne/.test(jB({ cols: ['Inconnue'] }).error), 'jointure : clés sans casse ni accents ; erreurs claires (colonne introuvable, pas de clé, aucune colonne à ajouter)');
const j5 = PJN.build({ keys: [['Code', 'NIS'], ['Commune', 'Province']], type: 'inner', dup: 'first', cols: null }, jL, jR);
A(j5.aoa.length === 1 && PJN.keyOf(new Date(2024, 0, 5, 12)) === 'd:2024-01-05' && PJN.keyOf('  ') === null && PJN.keyOf('3,5') === PJN.keyOf(3.5), 'jointure : clés composées (toutes les paires doivent correspondre) ; clés vides et dates');
const jS = PJN.sanitizeDefs([{ id: 'j1', name: 'A', left: 's1', right: 's2', keys: [['a', 'b'], ['x'], ['c', 'd'], ['e', 'f'], ['g', 'h']], type: 'weird', dup: 'all', cols: ['p', 5], use: false }, { id: 'x1', name: 'B', left: 's1', right: 's2', keys: [['a', 'b']] }, { id: 'j2', name: '__proto__', left: 's1', right: 's2', keys: [['a', 'b']] }, { id: 'j1', name: 'dup', left: 's1', right: 's2', keys: [['a', 'b']] }, { id: 'j3', name: 'C', left: 's1', right: 's1x', keys: [['a', 'b']] }, null]);
A(jS.length === 1 && jS[0].keys.length === 3 && jS[0].type === 'left' && jS[0].dup === 'all' && jS[0].cols.join() === 'p' && jS[0].use === false, 'jointure : définitions relues nettoyées (identifiants, clés ≤ 3, type inconnu → gauche, noms dangereux et doublons écartés)');

// Aperçu et contrôle qualité
const PQL = require('../js/quality.js');
const qA = [['Commune', 'Nb', 'Jour', 'Note']];
const qRows = [['Anvers', 10, '01/02/2024', 'x'], ['Anvers', 12, '02/02/2024', 'x'], ['ANVERS', 11, '03/02/2024', 'x'], ['Liège', 9, '04/02/2024', 'x'], ['Liege', 10, '05/02/2024', 'x'], ['Gand', 'n.d.', '06/02/2024', 'x'], ['Gand', 11, 'pas une date', 'x'], ['Mons', 10, '08/02/2024', 'x'], ['Mons', 1000, '09/02/2024', 'x'], ['Boom  Ville', 10, '10/02/2024', 'x'], [null, null, null, 'x']];
qA.push(...qRows, ['Anvers', 10, '01/02/2024', 'x']);
const qU = E.unify([{ id: 'q', label: 'q', headerRow: 0, aoa: qA }], {});
const qP = PQL.profile(qU.rows, qU.fields, { activeSources: 2 });
const qf = l => qP.fields.find(f => f.label === l), qi = re => qP.issues.some(i => re.test(i.text));
A(qP.n === 12 && qf('Nb').type === 'number' && qf('Nb').bad === 1 && qf('Nb').badSamples[0] === 'n.d.' && qf('Nb').max === 1000 && qf('Nb').empty === 1 && qf('Nb').outliers === 1 && Math.abs(qf('Nb').median - 10) < 1e-9, 'qualité : champ numérique — valeur non numérique, vide, médiane, valeur aberrante (1000)');
A(qf('Jour').type === 'date' && qf('Jour').bad === 1 && qf('Jour').min.getDate() === 1 && qf('Jour').max.getDate() === 10 && qf('Note').constant === true && qf('Commune').ws === 1, 'qualité : champ date (min / max, valeur non datée), champ constant, espaces multiples');
A(qf('Commune').variants.length === 2 && qf('Commune').variants[0].includes('Anvers') && qf('Commune').variants[0].includes('ANVERS') && qf('Commune').top[0][0] === 'Anvers' && qf('Commune').top[0][1] === 3, 'qualité : variantes d\'écriture (Anvers / ANVERS, Liège / Liege) et valeurs les plus fréquentes');
A(qP.dupRows === 1 && qi(/identique/) && qi(/non numérique/) && qi(/aberrante/) && qi(/plusieurs façons/) && qi(/espaces multiples/) && qi(/une seule valeur/) && qP.issues[0].sev === 'warn', 'qualité : anomalies listées (doublons de lignes, non numériques, aberrantes, variantes, espaces, constante), « à vérifier » d\'abord');
const qE = PQL.profile([['s', null, 1], ['s', null, 2]], [{ key: '__source', label: 'Source', type: 'text', sources: new Set() }, { key: 'a', label: 'Vide', type: 'text', sources: new Set(['s1']) }, { key: 'b', label: 'N', type: 'number', sources: new Set(['s1', 's2']) }], { activeSources: 2 });
A(qE.issues.some(i => /entièrement vide/.test(i.text)) && PQL.profile([], [{ key: '__source', label: 'Source', type: 'text', sources: new Set() }], {}).issues.length === 0, 'qualité : champ entièrement vide signalé ; données vides sans erreur');

// Localisation hors-ligne (carte à bulles)
const PGEO = require('../js/geo.js'); PGEO.use(require('../vendor/geo/geo-data.js'));
const gl = (l, h) => PGEO.locate(l, h);
A(gl('Anvers').name === 'Antwerpen' && gl('Gand').name === 'Gent' && gl('Bruxelles').name === 'Brussels' && gl('Liège').kind === 'commune' && gl('11001').kind === 'commune (NIS)' && gl('11001').name === 'Aartselaar' && Math.abs(gl('Bruges').lat - 51.21) < 0.05, 'géo : communes belges par nom français ou néerlandais, et par code NIS');
A(gl('Belgique').kind === 'pays' && gl('Germany').name === 'Allemagne' && gl('NL').name === 'Pays-Bas' && gl('FRA').name === 'France' && gl('Luxembourg').kind === 'pays' && gl('Province de Luxembourg').kind === 'province' && gl('Paris').kind === 'ville' && gl('Londres').kind === 'ville', 'géo : pays (noms fr/nl/en/de, codes ISO), « Luxembourg » = pays sauf « Province de … », grandes villes');
A(gl('Liège', 'Province').kind === 'province' && gl('Liège', 'Commune').kind === 'commune' && gl('Hainaut').kind === 'province' && gl('Namur', 'Arrondissement').kind === 'arrondissement' && gl('Wallonie', 'Région').kind === 'région' && gl('Région flamande').kind === 'région' && gl('Arrondissement de Nivelles').kind === 'arrondissement', 'géo : le nom de la dimension tranche les homonymes (Liège commune / province) ; préfixes « Province de », « Région », « Arrondissement de »');
A(gl('Inconnuville') === null && gl('') === null && gl(null) === null, 'géo : lieu inconnu ou vide → non localisé');

// Nouveaux graphiques : anneau, aires, treemap, nuage de points, KPI, jauges, carte
const PCM = require('../js/chart-more.js');
const mkRes2 = (K, labels, cols) => ({ K, specs: Array.from({ length: K }, (_, k) => ({ label: ['Étab.', 'Habitants', 'Latitude (moy.)', 'Longitude (moy.)'][k], agg: 'sum' })), rowDims: Array.isArray(labels[0]) ? ['Région', 'Commune'] : ['Commune'], colDims: cols ? ['Année'] : [], cols: (cols || ['']).map((c, j) => ({ labels: cols ? [c] : [], key: 'c' + j })),
  rows: labels.map((l, i) => ({ labels: Array.isArray(l) ? l : [l], cells: (cols || ['']).flatMap((_, j) => Array.from({ length: K }, (_, k) => (k === 0 ? (i + 1) * 10 + j * 3 : k === 1 ? (i + 1) * 100 + i * i * 7 + j : [50.8, 4.4][k - 2] + i * 0.1))), tot: Array.from({ length: K }, (_, k) => (k === 0 ? (i + 1) * 10 * (cols || ['']).length : k === 1 ? (i + 1) * 100 + i * i * 7 : [50.8, 4.4][k - 2] + i * 0.1)) })),
  bottom: (cols || ['']).flatMap((_, j) => Array.from({ length: K }, (_, k) => 100 + j * 20 + k)), grand: Array.from({ length: K }, (_, k) => 1000 + k) });
const bld = (res, o) => require('../js/chart.js').build(res, Object.assign({ fmt: v => String(Math.round(v * 100) / 100), k: 0 }, o));
const dn = bld(mkRes2(1, ['A', 'B', 'C', 'D']), { type: 'donut' }), pi = bld(mkRes2(1, ['A', 'B', 'C', 'D']), { type: 'pie' });
A(/<path[^>]*fill-rule|<path d="M[\d.]+,[\d.]+ A/.test(dn.svg) && />Total</.test(dn.svg) && (dn.svg.match(/<path /g) || []).length === 4 && !/>Total</.test(pi.svg), 'anneau : 4 secteurs évidés avec le total au centre (le camembert n\'en a pas)');
const ar = bld(mkRes2(1, ['A', 'B', 'C', 'D'], ['2023', '2024']), { type: 'area' }), sa = bld(mkRes2(1, ['A', 'B', 'C', 'D'], ['2023', '2024']), { type: 'sarea' });
A((ar.svg.match(/<polygon /g) || []).length === 2 && (sa.svg.match(/<polygon /g) || []).length === 2 && /<polyline/.test(ar.svg) && /2023/.test(ar.svg), 'aires : une aire par série (superposées) ; aires empilées : un polygone cumulé par série');
const sq = PCM.squarify([{ v: 6 }, { v: 6 }, { v: 4 }, { v: 3 }, { v: 2 }, { v: 2 }, { v: 1 }], 0, 0, 600, 400);
const sqA = sq.reduce((a, r) => a + r.w * r.h, 0);
A(sq.length === 7 && Math.abs(sqA - 240000) < 1 && sq.every(r => Math.abs(r.w * r.h - r.it.v / 24 * 240000) < 1) && sq.every(r => r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6), 'treemap : rectangles dans le cadre, surfaces proportionnelles aux valeurs, recouvrement total');
const tmF = bld(mkRes2(1, ['A', 'B', 'C', 'D', 'E']), { type: 'treemap' }), tmN = bld(mkRes2(1, [['R1', 'A'], ['R1', 'B'], ['R2', 'C'], ['R2', 'D']]), { type: 'treemap' });
A((tmF.svg.match(/<rect /g) || []).length >= 6 && (tmN.svg.match(/<rect /g) || []).length >= 7 && /R1/.test(tmN.svg) && bld(mkRes2(1, ['A']), { type: 'treemap', k: 0 }).svg !== '', 'treemap : une case par ligne ; deux niveaux de lignes → groupes (cadre + titre) et sous-cases');
const sc1 = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'scatter' }), sc2 = bld(mkRes2(2, ['A', 'B', 'C', 'D', 'E', 'F']), { type: 'scatter', k: 0, k2: 1 });
A(sc1.svg === '' && /deuxième valeur/.test(sc1.note) && (sc2.svg.match(/<circle /g) || []).length === 6 && /R² = 0[,.]\d+/.test(sc2.note) && /stroke-dasharray/.test(sc2.svg) && /Habitants selon Étab/.test(sc2.svg), 'nuage de points : exige 2 valeurs (message) ; un point par ligne, droite de tendance et R²');
const kp = bld(mkRes2(2, ['A', 'B'], ['2023', '2024']), { type: 'kpi' }), kp0 = bld(mkRes2(2, ['A', 'B']), { type: 'kpi' });
A((kp.svg.match(/rx="8"/g) || []).length === 2 && /▲/.test(kp.svg) && /vs 2023/.test(kp.svg) && /<polyline/.test(kp.svg) && !/vs /.test(kp0.svg) && /1000/.test(kp0.svg), 'KPI : une carte par valeur (total) ; évolution et mini-courbe avec des colonnes, rien sans');
const ga = bld(mkRes2(2, ['A', 'B']), { type: 'gauge' }), ga2 = bld(mkRes2(2, ['A', 'B']), { type: 'gauge', gmax: 500 });
A((ga.svg.match(/stroke-width="16"/g) || []).length >= 3 && /Maximum automatique/.test(ga.note) && /Maximum fixé à 500/.test(ga2.note) && /dépasse le maximum/.test(ga2.note) && /200 % de 500|200[,.]0 % de 500/.test(ga2.svg.replace(/\s+/g, ' ')), 'jauges : arc de progression par valeur ; maximum automatique ou fixé ; dépassement signalé');
const mpNo = bld(mkRes2(1, ['Anvers', 'Gand']), { type: 'map' }), geoOn = PGEO;
A(mpNo.svg === '' && mpNo.pending === true, 'carte : sans fonds de carte chargés → attente (pending)');
const mpA = bld(mkRes2(1, ['Anvers', 'Gand', 'Liège', 'Bruxelles', 'Inconnuville']), { type: 'map', geo: geoOn });
A((mpA.svg.match(/<circle /g) || []).length === 6 && /4 lieu\(x\) placé\(s\)/.test(mpA.note) && /1 non localisé\(s\) : Inconnuville/.test(mpA.note) && /<path d="M/.test(mpA.svg) && /Natural Earth/.test(mpA.svg), 'carte : 4 lieux belges placés (+ 2 bulles de légende) sur le fond détaillé, 1 non localisé signalé, attribution des données');
const mpW = bld(mkRes2(1, ['Belgique', 'France', 'Japon', 'Brésil']), { type: 'map', geo: geoOn });
A((mpW.svg.match(/<circle /g) || []).length === 6 && (mpW.svg.match(/<path /g) || []).length >= 100, 'carte : pays du monde → fond mondial (plus de 100 pays)');
const mpL = bld(mkRes2(4, ['P1', 'P2', 'P3']), { type: 'map', geo: geoOn, k: 0 });
A((mpL.svg.match(/<circle /g) || []).length === 5 && /3 lieu\(x\) placé\(s\)/.test(mpL.note) && !/non localisé/.test(mpL.note), 'carte : valeurs « Latitude » / « Longitude » → lieux placés par coordonnées, sans nom reconnu');
A(bld(mkRes2(1, ['Zzz', 'Yyy']), { type: 'map', geo: geoOn }).note.includes('Aucun lieu reconnu'), 'carte : aucun lieu reconnu → message d\'aide');

// Graphiques : options (étiquettes, légende, palette…), colonnes 100 %, combiné, pyramide, KPI en cartes
const Axis2 = require('../js/chart-axis.js');
A(Axis2.scaleOf(0, 100, { step: 25 }).tk.includes(25), 'axes : intervalle manuel');
A(Axis2.scaleOf(1, 1000, { scale: 'log' }).tk.includes(10) && Math.abs(Axis2.scaleOf(1, 1000, { scale: 'log' }).ratio(10) - 1/3) < 1e-9, 'axes : logarithme base 10');
A(!!Axis2.scaleOf(0, 100, { scale: 'log' }).invalid, 'axes : logarithme interdit pour zéro');
const Trend = require('../js/chart-trend.js');
A(Trend.movingAverage([1,null,3,4],2).every((v,i)=>i===3?v===3.5:v===null),'tendance : moyenne mobile et valeurs manquantes');
A(Trend.polynomial([{x:0,y:4},{x:1,y:4},{x:2,y:4}],1).r2===null,'tendance : R² non défini pour série constante');
A(Trend.equation(Trend.polynomial([{x:1,y:3},{x:2,y:5},{x:3,y:7}],1)).includes('y ='),'tendance : équation de régression');
A(Number.isNaN(require('../js/chart-axis.js').scaleOf(1,100,{scale:'log'}).ratio(0)),'axe logarithmique : zéro non projetable');
const fitLinear=Trend.polynomial([{x:1,y:3},{x:2,y:5},{x:3,y:7}],1);
A(fitLinear && Math.abs(fitLinear.predict(4)-9)<1e-8 && Math.abs(fitLinear.r2-1)<1e-8,'tendance : régression linéaire exacte');
const fitQuadratic=Trend.polynomial([0,1,2,3].map(x=>({x,y:x*x+2})),2);
A(fitQuadratic && Math.abs(fitQuadratic.predict(4)-18)<1e-7,'tendance : polynôme degré 2');
A(Trend.polynomial([{x:1,y:2},{x:1,y:3}],1)===null,'tendance : abscisses constantes');
A(Trend.movingAverage([1,2,3,4],3).join()===',,2,3','tendance : moyenne mobile');
const PCh = require('../js/chart.js');
const no0 = PCh.normOpts({ lab: 'x', pal: 'constructor', ymin: 'abc', ref: '5', leg: 'right', title: 7, grid: false });
A(no0.lab === 'none' && no0.pal === 'std' && no0.ymin === null && no0.ref === 5 && no0.leg === 'right' && no0.title === '' && no0.grid === false && PCh.normOpts(null).smooth === false && PCh.normOpts({ ymax: '' }).ymax === null, 'graphique : options relues toujours nettoyées (valeurs invalides → défauts)');
const txt = r => r.svg.replace(/<title>[^<]*<\/title>/g, '').replace(/<[^>]+>/g, ' ');
const nRect = r => (r.svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#/g) || []).length;
const s100 = bld(mkRes2(2, ['A', 'B', 'C'], ['2023', '2024']), { type: 'stack100' }), h100 = bld(mkRes2(2, ['A', 'B', 'C'], ['2023', '2024']), { type: 'hstack100', o: { lab: 'pct' } });
A(nRect(s100) === 6 && /100 %/.test(txt(s100)), 'colonnes empilées 100 % : une barre par série et catégorie, axe en %');
A(/100 %/.test(txt(h100)) && nRect(h100) === 6 && /\d,\d %|\d+ %/.test(txt(h100)), 'barres empilées 100 % horizontales : étiquettes en pourcentage');
const hs = bld(mkRes2(2, ['A', 'B', 'C'], ['2023', '2024']), { type: 'hstack' });
A(nRect(hs) === 6 && /2023/.test(hs.svg), 'barres empilées horizontales : légende et segments');
const lv = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { lab: 'value' } }), lp = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { lab: 'pct' } }), lb = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { lab: 'both' } });
A(/font-size="10.5"[^>]*>10</.test(lv.svg) && /font-size="10.5"[^>]*>16,7 %</.test(lp.svg) && /font-size="10.5"[^>]*>30 \(50 %\)</.test(lb.svg) && !/font-size="10.5"/.test(bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar' }).svg), 'étiquettes de données : valeur, pourcentage ou les deux (absentes par défaut)');
const lpie = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'pie', o: { lab: 'pct' } }), ldn = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'donut', o: { lab: 'value' } });
A(/font-size="10.5"[^>]*>50 %</.test(lpie.svg) && /font-size="10.5"[^>]*>30</.test(ldn.svg), 'secteurs / anneau : étiquettes sur les parts');
const lpH = p => bld(mkRes2(1, ['A', 'B', 'C']), { type: p[0], o: { lab: 'value', lpos: p[1] } });
A(/text-anchor="start" font-size="10.5"/.test(lpH(['hbar', 'auto']).svg) && /text-anchor="start" font-size="10.5"/.test(lpH(['hstack', 'auto']).svg) && !/text-anchor="middle" font-size="10.5"/.test(lpH(['hstack', 'auto']).svg), 'étiquettes : une barre empilée à une seule série se comporte comme une barre groupée (même position par défaut)');
A(/text-anchor="middle" font-size="10.5"/.test(lpH(['hbar', 'in']).svg) && !/text-anchor="start" font-size="10.5"/.test(lpH(['hbar', 'in']).svg), 'étiquettes : position « dans la barre » (horizontale)');
const yOf = r => +/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="10.5"[^>]*>30</.exec(r.svg)[1];
A(yOf(lpH(['bar', 'in'])) > yOf(lpH(['bar', 'out'])) && yOf(lpH(['bar', 'top'])) === yOf(lpH(['bar', 'out'])), 'étiquettes : colonnes — dans la barre (plus bas) / à côté = au-dessus');
const yT = r => +/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="10.5"[^>]*>10</.exec(r.svg)[1];
A(yT(lpH(['hbar', 'top'])) < yT(lpH(['hbar', 'out'])) && /text-anchor="start" font-size="10.5"/.test(lpH(['hbar', 'top']).svg), 'étiquettes : barres horizontales — au-dessus de la barre');
const od = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { ord: 'desc' } }), oa = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { ord: 'asc' } });
A(od.svg.indexOf('</title>C</text>') < od.svg.indexOf('</title>A</text>') && oa.svg.indexOf('</title>A</text>') < oa.svg.indexOf('</title>C</text>'), 'graphique : ordre des catégories par valeur (décroissant / croissant)');
// Nulls are always last; ties retain input order even when values are absent.
const sparse = mkRes2(1, ['A','B','C','D']);
sparse.rows[0].tot[0] = null; sparse.rows[0].cells[0] = null;
sparse.rows[2].tot[0] = null; sparse.rows[2].cells[0] = null;
const ascSparse = bld(sparse, { type: 'bar', o: { ord: 'asc' } }).svg;
const descSparse = bld(sparse, { type: 'bar', o: { ord: 'desc' } }).svg;
A(ascSparse.indexOf('</title>B</text>') < ascSparse.indexOf('</title>D</text>') && ascSparse.indexOf('</title>D</text>') < ascSparse.indexOf('</title>A</text>') && ascSparse.indexOf('</title>A</text>') < ascSparse.indexOf('</title>C</text>'), 'graphique : valeurs absentes à la fin en ordre croissant');
A(descSparse.indexOf('</title>D</text>') < descSparse.indexOf('</title>B</text>') && descSparse.indexOf('</title>B</text>') < descSparse.indexOf('</title>A</text>') && descSparse.indexOf('</title>A</text>') < descSparse.indexOf('</title>C</text>'), 'graphique : valeurs absentes à la fin en ordre décroissant');
const g0 = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar' }), g1 = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'bar', o: { grid: false, ref: 15, title: 'Mon titre', pal: 'vif', ymax: 50, ymin: 0 } });
A(/stroke="#d9e1e8"/.test(g0.svg) && !/stroke="#d9e1e8"/.test(g1.svg) && /Repère 15/.test(g1.svg) && /Mon titre/.test(g1.svg) && !/Étab\. par/.test(g1.svg) && /#e6194b/.test(g1.svg) && />50</.test(g1.svg), 'graphique : quadrillage masquable, repère, titre, palette, bornes d\'axe');
const lg0 = bld(mkRes2(1, ['A', 'B'], ['2023', '2024']), { type: 'bar' }), lgN = bld(mkRes2(1, ['A', 'B'], ['2023', '2024']), { type: 'bar', o: { leg: 'none' } }), lgR = bld(mkRes2(1, ['A', 'B'], ['2023', '2024']), { type: 'bar', o: { leg: 'right' } }), lgT = bld(mkRes2(1, ['A', 'B'], ['2023', '2024']), { type: 'bar', o: { leg: 'top' } });
A(/rx="2"/.test(lg0.svg) && !/rx="2"/.test(lgN.svg) && /rx="2"/.test(lgR.svg) && /rx="2"/.test(lgT.svg) && lgN.h < lg0.h, 'graphique : légende en bas / en haut / à droite / masquée');
A(typeof require('../js/chart-cartesian.js').cartesian === 'function', 'graphique : moteur cartésien isolé et chargeable');
const sm = bld(mkRes2(1, ['A', 'B', 'C', 'D']), { type: 'line', o: { smooth: true } });
A(/ C[\d.-]+,[\d.-]+ /.test(sm.svg) && !/<polyline(?![^>]*stroke-dasharray)/.test(sm.svg) && /<polyline(?![^>]*stroke-dasharray)/.test(bld(mkRes2(1, ['A', 'B', 'C', 'D']), { type: 'line' }).svg), 'lignes : lissage optionnel');
const cb = bld(mkRes2(2, ['A', 'B', 'C']), { type: 'combo', o: { lab: 'value' } }), cb1 = bld(mkRes2(1, ['A', 'B', 'C']), { type: 'combo' });
A(cb.svg && (cb.svg.match(/<circle/g) || []).length === 3 && /<path d="M[^"]*" fill="none"/.test(cb.svg) && /Étab\./.test(cb.svg) && /Habitants/.test(cb.svg) && cb1.svg === '' && /2e valeur/.test(cb1.note), 'combiné : colonnes (valeur 1) + ligne sur axe de droite (valeur 2) ; une seule valeur → message');
const py = bld(mkRes2(1, ['0-9', '10-19', '20-29'], ['Hommes', 'Femmes']), { type: 'pyramid', o: { lab: 'value' } }), py1 = bld(mkRes2(1, ['0-9']), { type: 'pyramid' }), py2 = bld(mkRes2(2, ['0-9', '10-19']), { type: 'pyramid' });
A(nRect(py) === 6 && /Hommes/.test(py.svg) && /Femmes/.test(py.svg) && py1.svg === '' && /2 modalités/.test(py1.note) && nRect(py2) === 4, 'pyramide : 2 colonnes (ou 2 valeurs) face à face, une classe par ligne ; 1 seule → message');
const pyY = l => +new RegExp('y="([\\d.]+)"[^>]*><title>' + l + '</title>').exec(py.svg)[1];
A(pyY('0-9') > pyY('20-29'), 'pyramide : la première ligne est en bas');
const kc = bld(mkRes2(1, ['A', 'B'], ['H', 'F']), { type: 'kpi', o: { kpi: 'col' } });
A((kc.svg.match(/letter-spacing/g) || []).length === 2 && /% du total/.test(kc.svg) && /ÉTAB\./.test(kp0.svg) && /letter-spacing/.test(kp0.svg), 'KPI : cartes (libellé en capitales sous la valeur) ; mode une carte par colonne avec part du total');

// Groupes de valeurs : regroupement manuel de valeurs et tranches numériques
const PGr = require('../js/groups.js');
const gA = [['Etat', 'Age', 'Nb']];
[['Single', 17, 1], ['Married', 18, 1], ['Divorced', 24, 1], ['Separated', 25, 1], ['Widowed', 80, 1], ['Single', null, 1], ['Other', 34, 1]].forEach(r => gA.push(r));
const gU = E.unify([{ id: 'x', label: 'f', headerRow: 0, aoa: gA }], {}), gC = E.buildCatalog(gU.fields), gK = l => gC.find(c => c.label === l).key;
A(PGr.parseBreaks('17,24,34,44').join() === '17,24,34,44' && PGr.parseBreaks('1.5, 3').join() === '1.5,3' && PGr.parseBreaks('1,5; 3').join() === '1.5,3' && PGr.rangeLabels([17, 24, 74], null, 'end').join('|') === '≤ 17|18–24|25–74|75+' && PGr.parseBreaks('18, 25; 35  45,5 25').join() === '18,25,35,45.5' && PGr.parseBreaks('abc, ,').length === 0 && PGr.rangeLabels([18, 25, 35]).join('|') === '< 18|18–24|25–34|35+' && PGr.rangeLabels([1.5, 3]).join('|') === '< 1,5|1,5 – < 3|≥ 3' && PGr.rangeLabels([18, 25], ['Jeunes', 'Adultes', 'Aînés']).join() === 'Jeunes,Adultes,Aînés' && PGr.rangeLabels([18, 25], ['x']).length === 3, 'groupes : seuils lus (virgule décimale, doublons) ; libellés par défaut ou personnalisés');
const gSan = PGr.sanitizeDefs([{ name: 'A', src: 'k', kind: 'values', groups: [{ label: 'G', values: ['x', 'x', 'y'] }, { label: '', values: ['z'] }, { label: 'Vide', values: [] }] }, { name: 'a', src: 'k', kind: 'values', groups: [{ label: 'G', values: ['x'] }] }, { name: 'B', src: 'k', kind: 'ranges', breaks: [35, 18, 18, 'x'] }, { name: '__proto__', src: 'k', kind: 'ranges', breaks: [1] }, { name: 'C', src: 'k', kind: 'ranges', breaks: [] }, null, { name: 'D', src: 'k', kind: 'ranges', breaks: [1, 2], labels: ['a', 'b', 'c'], id: 'g9' }]);
A(gSan.length === 3 && gSan[0].groups.length === 1 && gSan[0].groups[0].values.join() === 'x,y' && gSan[1].breaks.join() === '18,35' && gSan[1].labels.length === 0 && gSan[2].labels.join() === 'a,b,c' && gSan[2].id === 'g9' && new Set(gSan.map(d => d.id)).size === 3 && /^g\d+$/.test(gSan[0].id), 'groupes : définitions nettoyées (noms uniques, groupes vides écartés, seuils triés, identifiants stables)');
const gV = PGr.buildItems([{ id: 'g1', name: 'État groupé', src: gK('Etat'), kind: 'values', groups: [{ label: 'Divorcé(e)', values: ['Divorced', 'Separated'] }], rest: 'Autres' }], gC), gV2 = PGr.buildItems([{ id: 'g2', name: 'État 2', src: gK('Etat'), kind: 'values', groups: [{ label: 'Divorcé(e)', values: ['Divorced', 'Separated'] }], rest: '' }], gC);
const gRun = (items, key) => { const r = E.compute(gU.rows, gC.concat(items), { rows: [key], cols: [], vals: [{ key: '__rows', agg: 'sum' }], filters: {}, sort: null }); return r.rows.map(x => x.labels[0] + '=' + x.tot[0]).join('|'); };
A(gV.items[0].key === 'grp|g1' && gV.items[0].group === true && gRun(gV.items, 'grp|g1') === 'Autres=5|Divorcé(e)=2', 'groupes : valeurs regroupées, le reste sous « Autres »');
A(gRun(gV2.items, 'grp|g2') === 'Divorcé(e)=2|Married=1|Other=1|Single=2|Widowed=1', 'groupes : valeurs non regroupées gardées telles quelles');
const gR = PGr.buildItems([{ id: 'g3', name: 'Âge en tranches', src: gK('Age'), kind: 'ranges', breaks: [18, 25, 35], labels: [] }], gC);
A(gRun(gR.items, 'grp|g3') === '< 18=1|18–24=2|25–34=2|35+=1|(vide)=1', 'tranches : 17 → « < 18 », 18 et 24 → « 18–24 », valeur absente → (vide) en dernier');
const gRe = PGr.buildItems([{ id: 'g6', name: 'Âge fin', src: gK('Age'), kind: 'ranges', breaks: [17, 24, 34], edge: 'end', labels: [] }], gC);
A(gRun(gRe.items, 'grp|g6') === '≤ 17=1|18–24=2|25–34=2|35+=1|(vide)=1', 'tranches : seuils « fin incluse » (17, 24, 34 → ≤ 17, 18–24, 25–34, 35+)');
const gBad = PGr.buildItems([{ id: 'g4', name: 'X', src: 'inconnu', kind: 'values', groups: [{ label: 'g', values: ['a'] }], rest: '' }, { id: 'g5', name: 'Y', src: gK('Etat'), kind: 'ranges', breaks: [1], labels: [] }], gC);
A(gBad.items.length === 0 && gBad.errors.length === 2 && /introuvable/.test(gBad.errors[0].error) && /numérique/.test(gBad.errors[1].error), 'groupes : champ source absent ou non numérique signalé (aucun plantage)');
A(PGr.checkName('', [], gC, '') !== '' && PGr.checkName('Etat', [], gC, '') !== '' && PGr.checkName('Nouveau', gSan, gC, '') === '' && PGr.checkName('a', gSan, gC, '') !== '' && PGr.checkName('a', gSan, gC, gSan[0].id) === '', 'groupes : nom vide, déjà pris (champ ou groupe) refusé ; renommer le groupe lui-même autorisé');
const gD = PGr.distinctValues(gU.rows, gC.find(c => c.label === 'Etat')), gAb = PGr.autoBreaks(gU.rows, gC.find(c => c.label === 'Age'), 10);
A(gD.list.find(x => x.v === 'Single').n === 2 && gD.list.length === 6 && gAb.join() === '20,30,40,50,60,70,80' && PGr.autoBreaks(gU.rows, gC.find(c => c.label === 'Age'), 0) === null && PGr.autoBreaks(gU.rows, gC.find(c => c.label === 'Age'), 0.1) === null, 'groupes : valeurs distinctes avec effectifs ; seuils réguliers (« tous les 10 ») ; pas trop fin refusé');

// Graphiques : épaisseur des barres, zoom des secteurs, position du titre ; titre de tableau
const cOp = PCh.normOpts({ bar: '55', zoom: 500, hole: 'x', talign: 'centre', tvert: 'bottom' });
A(cOp.bar === 55 && cOp.zoom === 100 && cOp.hole === 58 && cOp.talign === 'left' && cOp.tvert === 'bottom' && PCh.normOpts({ bar: 5 }).bar === 0 && PCh.normOpts({}).bar === 0 && PCh.normOpts({ zoom: 120, hole: 40 }).zoom === 120, 'graphique : épaisseur, zoom, trou et position du titre bornés (valeurs invalides → défauts)');
const barW = r => +/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="#2f6fb3"/.exec(r.svg)[1], barH = r => +/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="#2f6fb3"/.exec(r.svg)[1];
const rows3 = ['A', 'B', 'C'];
A(barW(bld(mkRes2(1, rows3), { type: 'bar', o: { bar: 100 } })) > barW(bld(mkRes2(1, rows3), { type: 'bar' })) && barW(bld(mkRes2(1, rows3), { type: 'bar', o: { bar: 30 } })) < barW(bld(mkRes2(1, rows3), { type: 'bar' })), 'colonnes : épaisseur réglable (plus fines / plus larges que l\'automatique)');
A(barH(bld(mkRes2(1, rows3), { type: 'hbar', o: { bar: 100 } })) > barH(bld(mkRes2(1, rows3), { type: 'hbar', o: { bar: 40 } })) && barH(bld(mkRes2(1, rows3), { type: 'hstack', o: { bar: 90 } })) > 20, 'barres horizontales : épaisseur réglable');
const z60 = bld(mkRes2(1, rows3), { type: 'pie', o: { zoom: 60 } }), z100 = bld(mkRes2(1, rows3), { type: 'pie' }), z180 = bld(mkRes2(1, rows3), { type: 'pie', o: { zoom: 180 } });
A(z60.h < z100.h && z180.h >= z100.h && bld(mkRes2(1, rows3), { type: 'donut', o: { hole: 30 } }).svg !== bld(mkRes2(1, rows3), { type: 'donut', o: { hole: 80 } }).svg, 'secteurs / anneau : zoom et trou de l\'anneau réglables');
const tt0 = bld(mkRes2(1, rows3), { type: 'bar' }), ttC = bld(mkRes2(1, rows3), { type: 'bar', o: { talign: 'center' } }), ttR = bld(mkRes2(1, rows3), { type: 'bar', o: { talign: 'right' } }), ttB = bld(mkRes2(1, rows3), { type: 'bar', o: { tvert: 'bottom', talign: 'center' } }), ttH = bld(mkRes2(1, rows3), { type: 'bar', o: { tvert: 'hidden' } });
A(/<text x="12" y="16" font-weight="700"/.test(tt0.svg) && /<text x="380" y="16" text-anchor="middle" font-weight="700"/.test(ttC.svg) && /<text x="748" y="16" text-anchor="end" font-weight="700"/.test(ttR.svg) && ttB.h === tt0.h + 28 && new RegExp('<text x="380" y="' + (tt0.h + 18) + '" text-anchor="middle"').test(ttB.svg) && /viewBox="0 0 760 \d+"/.test(ttB.svg) && !/font-weight="700"/.test(ttH.svg), 'graphique : titre à gauche / au centre / à droite, en haut / en bas (hauteur ajustée) / masqué');
A(/text-anchor="middle" font-weight="700"/.test(bld(mkRes2(1, rows3), { type: 'pie', o: { talign: 'center' } }).svg) && /text-anchor="end" font-weight="700"/.test(bld(mkRes2(1, rows3), { type: 'kpi', o: { talign: 'right' } }).svg) && /text-anchor="middle" font-weight="700"/.test(bld(mkRes2(1, ['0-9', '10-19'], ['H', 'F']), { type: 'pyramid', o: { talign: 'center' } }).svg), 'graphique : position du titre valable pour secteurs, KPI, pyramide…');
const capL = fPL.sanitize(fPL.serialize({ rows: [], cols: [], vals: [], filters: {} }, { cap: 'Mon titre', capH: 'center', capV: 'bottom' })).opts, capX = fPL.sanitize(fPL.serialize({ rows: [], cols: [], vals: [], filters: {} }, { cap: 'x'.repeat(300), capH: 'zzz', capV: 'milieu' })).opts;
A(capL.cap === 'Mon titre' && capL.capH === 'center' && capL.capV === 'bottom' && capX.cap.length === 120 && capX.capH === undefined && capX.capV === undefined, 'tableau : titre, alignement et place conservés dans les dispositions (valeurs invalides écartées)');

// Revue des PR 437–441 : tendance par défaut, options du nuage de points, échelle de repli, titre contenant « $& »
const rows5 = ['A', 'B', 'C', 'D', 'E'], dashed = r => /stroke-dasharray="7 4"/.test(r.svg);
A(PCh.normOpts().trend === 'auto' && !dashed(bld(mkRes2(1, rows5), { type: 'line' })) && dashed(bld(mkRes2(1, rows5), { type: 'line', o: { trend: 'linear' } })) && !dashed(bld(mkRes2(1, rows5), { type: 'line', o: { trend: 'none' } })), 'courbes : aucune tendance par défaut (seulement si elle est choisie)');
const scT = o => bld(mkRes2(2, rows5), { type: 'scatter', k: 0, k2: 1, o });
A(/linéaire/.test(scT({}).note) && scT({ trend: 'none' }).note.indexOf('Tendance') < 0 && /polynomiale/.test(scT({ trend: 'poly2' }).note) && /z = /.test(scT({ trend: 'poly2', trendEquation: true }).note) && !/z = /.test(scT({ trend: 'poly2' }).note), 'nuage de points : le choix de tendance du panneau (aucune, polynôme, équation) est bien appliqué');
A(typeof require('../js/chart-axis.js').scaleOf(NaN, NaN, {}).ratio === 'function', 'axes : l\'échelle de repli fournit aussi ratio()');
const dollar = bld(mkRes2(1, rows5), { type: 'bar', o: { title: 'Prix $& total $\' fin', talign: 'center' } }), dollarPie = bld(mkRes2(1, rows5), { type: 'pie', o: { title: 'Part $& du total' } });
// Configuration de graphique d'une vue : nettoyée à l'entrée (session, projet, import) et à l'usage
const ncOk = PCh.normChart({ type: 'donut', k: 1, k2: 0, gmax: 50, pos: 'right', o: { lab: 'pct', hole: 40 } }), ncBad = PCh.normChart({ type: '__proto__', k: -3, k2: 99, gmax: -1, pos: 'x', o: 'zzz' }), ncTs = PCh.normChart({ type: 'toString' });
A(ncOk.type === 'donut' && ncOk.k === 1 && ncOk.k2 === 0 && ncOk.gmax === 50 && ncOk.pos === 'right' && ncOk.o.lab === 'pct' && ncOk.o.hole === 40 && ncBad.type === 'none' && ncBad.k === 0 && ncBad.k2 === -1 && ncBad.gmax === 0 && ncBad.pos === 'top' && ncBad.o.trend === 'auto' && ncTs.type === 'none' && PCh.normChart().type === 'none', 'graphique d\'une vue : normChart (type connu seulement, valeurs bornées, options nettoyées, pas de « __proto__ »)');
const scBad = SSM.sanitizeState({ v: 1, sources: [], views: [{ name: 'A', layout: { v: 1 }, chart: { type: 'Bar<script>', k: 500, k2: -9, gmax: 'x', pos: 'ici', o: { lab: 'value', '__proto__': { x: 1 }, evil: { a: 1 }, title: 'x'.repeat(500), ymax: 12, bar: null } } }, { name: 'B', layout: { v: 1 }, chart: [1] }] }).views;
A(scBad[0].chart.type === 'none' && scBad[0].chart.k === 0 && scBad[0].chart.k2 === -1 && scBad[0].chart.gmax === 0 && scBad[0].chart.pos === 'top' && scBad[0].chart.o.lab === 'value' && scBad[0].chart.o.ymax === 12 && scBad[0].chart.o.bar === null && !('evil' in scBad[0].chart.o) && !('title' in scBad[0].chart.o) && ({}).x === undefined && scBad[1].chart === null, 'session : graphique d\'une vue assaini à l\'entrée (type, bornes, options non scalaires et trop longues écartées)');
// Registre des capacités : table, dépendances, rendu qui ignore les options non applicables, titre personnalisé de tous les types
const CAP = PCh.caps, capTypes = Object.keys(PCh.TYPES).filter(x => x !== 'none');
A(capTypes.every(x => Array.isArray(CAP.CAPS[x])) && CAP.supports('pie', 'zoom') && !CAP.supports('pie', 'bar') && CAP.supports('donut', 'hole') && !CAP.supports('pie', 'hole') && CAP.supports('line', 'trend') && !CAP.supports('bar', 'trend') && !CAP.supports('stack', 'scale') && CAP.supports('combo', 'y2min') && !CAP.supports('line', 'y2min') && CAP.supports('scatter', 'title') && !CAP.supports('inconnu', 'lab') && !CAP.supports('__proto__', 'lab'), 'capacités : chaque type du moteur a sa liste d\'options (zoom/trou seulement radial, échelle log seulement courbe/combiné…)');
A(CAP.visible('line', 'trendWindow', { trend: 'ma' }) && !CAP.visible('line', 'trendWindow', { trend: 'linear' }) && CAP.visible('line', 'trendEquation', { trend: 'poly2' }) && !CAP.visible('line', 'trendEquation', { trend: 'auto' }) && CAP.visible('scatter', 'trendEquation', { trend: 'auto' }) && !CAP.visible('line', 'trendEquation', { trend: 'ma' }) && !CAP.visible('bar', 'trend', { trend: 'linear' }), 'capacités : options dépendantes (fenêtre seulement pour la moyenne mobile, équation seulement pour une droite / un polynôme)');
const capD = PCh.normOpts(), capO = { trend: 'linear', scale: 'log', hole: 40, bar: 40 }, capE = CAP.effective('bar', PCh.normOpts(capO), capD);
A(capE.trend === 'auto' && capE.scale === 'linear' && capE.hole === 58 && capE.bar === 40 && PCh.normOpts(capO).trend === 'linear' && CAP.effective('inconnu', { a: 1 }, capD).a === 1, 'capacités : options non applicables ramenées au défaut au rendu seulement (réglages enregistrés intacts)');
{ const capRes = mkRes2(2, ['A', 'B', 'C', 'D', 'E']), capOpt = { lab: 'both', lpos: 'in', leg: 'top', grid: false, smooth: true, trend: 'poly2', trendWindow: 5, trendEquation: true, ymin: 5, ymax: 500, step: 25, scale: 'log', y2min: 5, y2max: 500, y2step: 25, ref: 40, ord: 'desc', kpi: 'col', bar: 40, zoom: 70, hole: 40 };
  const capBad = [];
  capTypes.filter(x => x !== 'map').forEach(x => { const base = bld(capRes, { type: x, k2: 1 }); Object.keys(capOpt).forEach(k => { if (!CAP.supports(x, k) && bld(capRes, { type: x, k2: 1, o: { [k]: capOpt[k] } }).svg !== base.svg) capBad.push(x + '.' + k); }); });
  A(capBad.length === 0, 'capacités : une option non applicable à un type ne change jamais son rendu' + (capBad.length ? ' (' + capBad.join(', ') + ')' : '')); }
{ const ttRes = mkRes2(2, ['A', 'B', 'C']);
  A(['treemap', 'scatter', 'gauge', 'kpi', 'pie', 'bar'].every(x => bld(ttRes, { type: x, k2: 1, o: { title: 'Mon titre perso' } }).svg.includes('Mon titre perso')) && !bld(ttRes, { type: 'gauge', o: { title: 'Mon titre perso', tvert: 'hidden' } }).svg.includes('Mon titre perso'), 'titre personnalisé : pris en charge aussi par treemap, nuage de points et jauges (et masquable)'); }
// Contexte de rendu : un graphique n'hérite de rien d'un autre (largeur, palette, thème) — même pendant un rendu imbriqué
{ const rxRes = mkRes2(2, ['A', 'B', 'C', 'D', 'E']), rxOther = mkRes2(1, ['X', 'Y', 'Z']), rxPlain = v => String(Math.round(v)), rxBad = [];
  ['bar', 'hbar', 'line', 'pie', 'donut', 'combo', 'pyramid', 'treemap', 'kpi', 'gauge'].forEach(x => {
    const rxOpt = { type: x, k: 0, k2: 1, width: 900, theme: { bg: '#fff', ink: '#123456', muted: '#666', line: '#ddd' }, o: { pal: 'vif', leg: 'top', title: 'T', talign: 'center' } };
    const alone = bld(rxRes, Object.assign({ fmt: rxPlain }, rxOpt)).svg;
    const nested = bld(rxRes, Object.assign({}, rxOpt, { fmt: v => { bld(rxOther, { type: 'bar', width: 420, theme: { bg: '#000', ink: '#abcdef', muted: '#999', line: '#333' }, o: { pal: 'pastel' }, fmt: rxPlain }); return rxPlain(v); } })).svg;
    if (alone !== nested) rxBad.push(x);
  });
  A(rxBad.length === 0, 'rendu : un graphique construit pendant le rendu d\'un autre ne le perturbe pas (largeur, palette, thème isolés)' + (rxBad.length ? ' — corrompus : ' + rxBad.join(', ') : ''));
  const rxA1 = bld(rxRes, { type: 'bar', width: 1200, o: { pal: 'vif' } }).svg; bld(rxRes, { type: 'pie', width: 500, o: { pal: 'pastel' } });
  A(bld(rxRes, { type: 'bar', width: 1200, o: { pal: 'vif' } }).svg === rxA1 && /viewBox="0 0 1200 /.test(rxA1) && /viewBox="0 0 500 /.test(bld(rxRes, { type: 'pie', width: 500 }).svg), 'rendu : deux rendus successifs de largeurs et palettes différentes restent indépendants'); }
// Titre : un seul gabarit pour tous les types ; placeTitle le retrouve toujours (position, masquage, motifs spéciaux)
{ const ttRes = mkRes2(2, ['A', 'B', 'C']), ttBad = [];
  capTypes.filter(x => x !== 'map').forEach(x => {
    const mid = bld(ttRes, { type: x, k2: 1, o: { title: 'Titre <&> $&', talign: 'center' } }).svg, hid = bld(ttRes, { type: x, k2: 1, o: { title: 'Titre <&> $&', tvert: 'hidden' } }).svg, std = bld(ttRes, { type: x, k2: 1 }).svg;
    if (!(mid.includes('text-anchor="middle" font-weight="700" fill="') && mid.includes('Titre &lt;&amp;&gt; $&amp;') && !hid.includes('Titre &lt;') && /<text x="12" y="16" font-weight="700" fill="[^"]*">[^<]+<\/text>/.test(std))) ttBad.push(x);
  });
  A(ttBad.length === 0, 'titre : gabarit unique — déplacé, masqué et échappé pour tous les types' + (ttBad.length ? ' (échec : ' + ttBad.join(', ') + ')' : '')); }
// Colonnes empilées étroites (beaucoup de catégories) : l'étiquette passe à la verticale au lieu de disparaître
{ const stkCats = Array.from({ length: 30 }, (_, i) => 'Commune ' + i), stkRes = Object.assign(mkRes2(1, stkCats, ['T1', 'T2', 'T3', 'T4']), {});
  stkRes.rows.forEach((r, i) => { r.cells = [3000 + i * 400, 2000 + i * 300, 1500 + i * 200, 800 + i * 100]; });
  const stkN = x => { const r = bld(stkRes, { type: x, o: { lab: 'value' }, width: 760 }).svg; return { all: (r.match(/font-size="10.5"/g) || []).length, vert: (r.match(/rotate\(-90/g) || []).length }; };
  A(stkN('stack').all > 0 && stkN('stack').vert > 0 && stkN('stack100').vert > 0 && stkN('stack').vert === stkN('stack').all, 'colonnes empilées étroites : étiquettes verticales quand le texte ne tient pas à l\'horizontale (au lieu de disparaître)');
  const stkWide = bld(mkRes2(1, ['A', 'B', 'C'], ['T1', 'T2']), { type: 'stack', o: { lab: 'value' }, width: 760 }).svg;
  A(!/rotate\(-90/.test(stkWide) && /font-size="10.5"/.test(stkWide), 'colonnes empilées larges : étiquettes à l\'horizontale comme avant'); }
// Secteurs / anneau : position de la légende réglable (auto, à droite, en bas, en haut, masquée)
{ const lgRes = mkRes2(1, ['A', 'B', 'C', 'D']), lgSvg = (x, leg, w) => bld(lgRes, { type: x, width: w, o: { leg } }), swY = r => [...r.svg.matchAll(/<rect x="(\d+)" y="(-?[\d.]+)" width="12" height="12" rx="2"/g)].map(m => [+m[1], +m[2]]), discY = r => +(/<path d="M[\d.]+,([\d.]+) /.exec(r.svg) || [0, 0])[1];
  const aN = lgSvg('pie', 'auto', 560), bN = lgSvg('pie', 'bottom', 560), aW = lgSvg('pie', 'auto', 1000), rW = lgSvg('pie', 'right', 1000), tN = lgSvg('pie', 'top', 560), nN = lgSvg('pie', 'none', 560), rN = lgSvg('pie', 'right', 560), dT = lgSvg('donut', 'top', 560);
  A(aN.svg === bN.svg && aW.svg === rW.svg && PCh.normOpts().leg === 'auto' && PCh.normOpts({ leg: 'zzz' }).leg === 'auto', 'légende des secteurs : « auto » = en bas si étroit, à droite si large (rendu d\'avant inchangé)');
  A(swY(tN).length === 4 && swY(tN)[0][1] < discY(tN) && swY(bN)[0][1] > discY(bN) && swY(nN).length === 0 && swY(rN).length === 4 && swY(rN)[0][0] >= 150 && swY(aW)[0][0] >= 390 && swY(dT).length === 4 && swY(dT)[0][1] < discY(dT) && tN.h > nN.h && PCh.caps.supports('pie', 'leg') && PCh.caps.supports('donut', 'leg') && !PCh.caps.supports('treemap', 'leg'), 'légende des secteurs / anneau : en haut (au-dessus du disque), en bas, à droite (même étroit), masquée — pour secteurs et anneau'); }
// Secteurs, légende à droite dans une tuile étroite : le disque prend la place laissée par la légende réelle (pas 45 % fixes)
{ const rr = (x, w) => { const r = bld(mkRes2(1, ['F', 'M', '(vide)']), { type: x, width: w, minW: 300, fitH: 714, o: { leg: 'right' } }); return +(/ A(\d+),\1 /.exec(r.svg) || [0, 0])[1]; };
  const p375 = rr('pie', 375), d375 = rr('donut', 375);
  const big = (x, w, fit) => { const r = bld(mkRes2(1, ['F', 'M', '(vide)']), Object.assign({ type: x, width: w, o: { leg: 'right' } }, fit ? { minW: 300, fitH: fit } : {})); return +(/ A(\d+),\1 /.exec(r.svg) || [0, 0])[1]; };
  A(big('pie', 1500, 720) > 220 && big('pie', 1500, 720) <= 320 && big('donut', 1500, 720) > 220 && big('pie', 1500, 0) === 220 && big('pie', 1000, 0) === 220 && big('pie', 1500, 720) > big('pie', 1000, 720), 'secteurs / anneau : plafond du rayon relevé (320 px) dans une tuile large et haute, inchangé (220 px) hors tuile, et croissant avec la largeur');
  A(p375 >= 80 && d375 >= 80 && p375 <= 110, 'secteurs / anneau en tuile étroite avec légende à droite : disque agrandi (rayon ' + p375 + ' px, au moins 80) sans déborder'); }
// Sélecteurs d'une vue : assainis à l'entrée (session, projet, import)
{ const sl = SSM.sanitizeSel([{ key: 'a', val: 'x' }, { key: 'a', val: 'y' }, { key: '', val: 'z' }, { key: 5 }, null, { key: 'b' }, { key: 'c', val: 'v'.repeat(300) }, { key: 'd', val: 'ok' }, { key: 'e' }, { key: 'f' }]);
  A(sl.length === 5 && sl[0].key === 'a' && sl[0].val === 'x' && sl[1].key === 'b' && sl[1].val === '' && sl[2].val === '' && SSM.sanitizeSel('x').length === 0 && SSM.sanitizeState({ v: 1, sources: [], views: [{ name: 'A', layout: { v: 1 }, sel: [{ key: 'k', val: 'v' }] }, { name: 'B', layout: { v: 1 } }] }).views.map(v => v.sel.length).join() === '1,0', 'sélecteurs : réglage assaini à l\'entrée (doublons, clés vides, valeurs trop longues, au plus 5)'); }
// Champ supprimé (groupe / mesure) : retiré de la disposition entière (identifiant réattribuable)
{ const dkL = { rows: ['a', 'grp|g1'], cols: ['grp|g1', 'b'], vals: [{ key: 'v', agg: 'sum' }, { key: 'grp|g1', agg: 'count' }], filters: { 'grp|g1': new Set(['x']), a: new Set(['y']) }, rules: { 'grp|g1': { text: 'q' }, a: { text: 'z' } }, rowDir: { 'grp|g1': -1, a: -1 }, sort: { col: 'c0', k: 0, dir: 1 } };
  fPL.dropKey(dkL, 'grp|g1');
  const dkK = { rows: ['a'], cols: [], vals: [{ key: 'v', agg: 'sum' }], filters: {}, sort: { col: 'c0', k: 0, dir: 1 } }; fPL.dropKey(dkK, 'grp|g9');
  A(dkL.rows.join() === 'a' && dkL.cols.join() === 'b' && dkL.vals.length === 1 && !('grp|g1' in dkL.filters) && 'a' in dkL.filters && !('grp|g1' in dkL.rules) && 'a' in dkL.rules && !('grp|g1' in dkL.rowDir) && 'a' in dkL.rowDir && dkL.sort === null && dkK.sort !== null && fPL.dropKey(null, 'x') === null, 'disposition : retirer un champ supprimé (zones, filtres, règles, sens de tri ; tri réinitialisé seulement si une zone change)'); }
// Sélecteurs globaux du tableau de bord : assainis à l'entrée
{ const gd = SSM.sanitizeState({ v: 1, sources: [], dash: { on: true, cols: 2, sel: [{ key: 'k', val: 'v' }, { key: 'k', val: 'dup' }, { key: '' }, 'x'] } }).dash, gd0 = SSM.sanitizeState({ v: 1, sources: [] }).dash;
  A(gd.sel.length === 1 && gd.sel[0].key === 'k' && gd.sel[0].val === 'v' && gd.on === true && gd.cols === 2 && Array.isArray(gd0.sel) && gd0.sel.length === 0, 'sélecteurs globaux : réglage du tableau de bord assaini à l\'entrée (doublons, clés vides) ; absent = liste vide'); }
// Graphique ajusté à la hauteur de la tuile (opt.fitH) : hauteur totale ≈ hauteur voulue ; sans fitH, rendu inchangé
{ const ftRes = (K, n) => Object.assign(mkRes2(K, Array.from({ length: n }, (_, i) => 'Cat ' + i), ['2024', '2025']), {}), ftTargets = [254, 434, 714], ftBad = [];
  ['bar', 'stack', 'line', 'area', 'combo', 'scatter', 'treemap'].forEach(x => { const K = ['combo', 'scatter'].includes(x) ? 2 : 1; ftTargets.forEach(f => { const r = bld(ftRes(K, 8), { type: x, k2: 1, width: 373, minW: 300, fitH: f }); if (!r.svg || Math.abs(r.h - f) > f * 0.04) ftBad.push(x + '@' + f + '=' + r.h); }); });
  [['hstack', 1], ['pyramid', 2]].forEach(([x, K]) => { const r = bld(ftRes(K, 8), { type: x, k2: 1, width: 373, minW: 300, fitH: 434 }); if (!r.svg || Math.abs(r.h - 434) > 434 * 0.04) ftBad.push(x + '@434=' + r.h); });
  A(ftBad.length === 0, 'tuile : la hauteur totale du graphique épouse la hauteur voulue (colonnes, empilées, lignes, aires, combiné, nuage, treemap ±4 % ; barres horizontales et pyramide dans leurs limites)' + (ftBad.length ? ' — écarts : ' + ftBad.join(', ') : ''));
  const ftA = bld(ftRes(1, 8), { type: 'bar', width: 700, plotH: 300 }), ftB = bld(ftRes(1, 8), { type: 'bar', width: 700, plotH: 300, fitH: 0 });
  A(ftA.svg === ftB.svg && /viewBox="0 0 300 /.test(bld(ftRes(1, 4), { type: 'bar', width: 300, minW: 300, fitH: 300 }).svg) && /viewBox="0 0 420 /.test(bld(ftRes(1, 4), { type: 'bar', width: 300 }).svg), 'tuile : sans hauteur voulue rien ne change ; largeur minimale réglable (300 px pour les tuiles, 420 px sinon)');
  const ftSmall = bld(ftRes(1, 25), { type: 'hbar', width: 373, minW: 300, fitH: 254 }), ftFew = bld(ftRes(1, 3), { type: 'hbar', width: 373, minW: 300, fitH: 714 });
  A(ftSmall.h > 254 && ftFew.h < 714, 'tuile : épaisseur des barres horizontales bornée (beaucoup de catégories → ascenseur, peu de catégories → barres non démesurées)'); }
// Zoom des secteurs / anneau : agrandit AU-DELÀ de 100 % (zone du disque élargie) et reste effectif dans une tuile (hauteur voulue)
{ const zmRes = mkRes2(1, ['A', 'B', 'C', 'D', 'E', 'F', 'G']), zmRad = (x, w, zoom, fit, leg) => { const m = /A(\d+(?:\.\d+)?),\d+(?:\.\d+)? 0 [01] 1/.exec(bld(zmRes, { type: x, width: w, minW: 300, fitH: fit || undefined, o: { zoom, leg: leg || 'auto' } }).svg); return m ? +m[1] : 0; }, zmBad = [];
  [['pie', 760, 0, 'auto'], ['donut', 1000, 0, 'auto'], ['pie', 373, 434, 'auto'], ['donut', 700, 434, 'none'], ['pie', 700, 0, 'bottom']].forEach(([x, w, fit, leg]) => {
    const r = [50, 75, 100, 125, 150].map(z => zmRad(x, w, z, fit, leg));
    if (!(r[0] < r[1] && r[1] < r[2] && r[2] < r[3])) zmBad.push(x + ' ' + w + (fit ? ' tuile' : '') + ' ' + leg + ' : ' + r.join('/'));
  });
  A(zmBad.length === 0, 'secteurs / anneau : le zoom agrandit au-delà de 100 % et reste effectif dans une tuile (rayon strictement croissant de 50 à 125 %)' + (zmBad.length ? ' — ' + zmBad.join(' ; ') : ''));
  A(zmRad('pie', 760, 100) === 175 && zmRad('pie', 560, 100) === 150 && zmRad('pie', 760, 70) === 123 && zmRad('pie', 373, 200) <= Math.floor((373 - 24) / 2), 'secteurs / anneau : taille à 100 % inchangée ; le disque ne dépasse jamais la largeur du graphique'); }
// Jalons de version : numérotation rétroactive, dernière entrée = PIVOT_VERSION, ordre strictement décroissant
{ const cl = fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8'), vs = [...cl.matchAll(/^- \*\*Pivot (\d+)\.(\d+)\.(\d+)\*\* \(/gm)].map(m => m.slice(1).map(Number)), cur = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8').match(/PIVOT_VERSION = '([\d.]+)'/)[1];
  A(vs.length >= 9 && vs[0].join('.') === cur && vs[vs.length - 1].join('.') === '0.1.0' && vs.every((v, k) => !k || vs[k - 1][0] > v[0] || (vs[k - 1][0] === v[0] && (vs[k - 1][1] > v[1] || (vs[k - 1][1] === v[1] && vs[k - 1][2] > v[2])))), 'versions : jalons 0.1.0 → ' + cur + ' du CHANGELOG en ordre décroissant, le plus récent = PIVOT_VERSION'); }
A(dollar.svg.includes('Prix $&amp; total $&#39; fin') && dollarPie.svg.includes('Part $&amp; du total'), 'titre : les motifs spéciaux « $& » / « $\' » sont conservés tels quels');

// Mesures : indicateurs nommés avec condition
const PMs = require('../js/measures.js');
const mDefs = PMs.sanitizeDefs([
  { name: 'Nb célibataires et mariés', kind: 'count', conds: [{ key: gK('Etat'), op: 'in', v: 'single; married' }] },
  { name: '% 25 ans et plus', kind: 'pct', conds: [{ key: gK('Age'), op: 'gte', v: '25' }] },
  { name: 'Âge des célibataires', kind: 'value', src: gK('Age'), agg: 'avg', conds: [{ key: gK('Etat'), op: 'in', v: 'Single' }] },
  { name: 'Divorcés', kind: 'count', conds: [{ key: gK('Etat'), op: 'contains', v: 'ivorc' }, { key: 'x', op: 'bidon', v: '1' }, { key: gK('Etat'), op: 'in', v: '' }] },
  { name: 'Hors célibataires', kind: 'count', conds: [{ key: gK('Etat'), op: 'notin', v: 'Single' }] },
  { name: 'hors célibataires', kind: 'count' }, { name: 'X', kind: 'inconnu' }, { name: 'V', kind: 'value' }, null
]);
A(mDefs.length === 5 && mDefs[3].conds.length === 1 && mDefs[2].agg === 'avg' && mDefs[1].agg === 'avg' && mDefs[0].agg === 'sum' && new Set(mDefs.map(d => d.id)).size === 5 && mDefs.every(d => /^m\d+$/.test(d.id)), 'mesures : définitions nettoyées (noms uniques, types connus, critères invalides écartés, identifiants stables)');
const mB = PMs.buildItems(mDefs, gC), mCat = gC.concat(mB.items), mGrand = k => E.compute(gU.rows, mCat, { rows: [], cols: [], vals: [{ key: k, agg: mB.items.find(i => i.key === k).agg0 }], filters: {}, sort: null });
A(mB.errors.length === 0 && mB.items.length === 5 && mB.items.every(i => i.measure && i.valueOnly && i.type === 'number') && mGrand('mes|' + mDefs[0].id).grand[0] === 3 && Math.abs(mGrand('mes|' + mDefs[1].id).grand[0] - 300 / 7) < 1e-9 && mGrand('mes|' + mDefs[2].id).grand[0] === 17 && mGrand('mes|' + mDefs[3].id).grand[0] === 1 && mGrand('mes|' + mDefs[4].id).grand[0] === 5, 'mesures : nombre, % et valeur avec condition (est l\'une de, ≥, contient, n\'est aucune de) calculés par cellule');
A(mGrand('mes|' + mDefs[0].id).specs[0].label === 'Nb célibataires et mariés' && E.compute(gU.rows, mCat, { rows: [gK('Etat')], cols: [], vals: [{ key: 'mes|' + mDefs[0].id, agg: 'sum' }], filters: {}, sort: null }).rows.find(r => r.labels[0] === 'Single').tot[0] === 2, 'mesures : libellé de la mesure comme titre de colonne ; ventilation par ligne');
// Mesures texte : résultat mémorisé par valeur distincte — mêmes résultats (casse, accents, « dans la liste » / « contient » / négations), y compris au-delà du plafond du cache
{ const mmA = [['Etat', 'N']]; for (let i = 0; i < 60000; i++) mmA.push([i % 3 === 0 ? 'Divorcé ' + i : i % 3 === 1 ? 'DIVORCE ' + i : 'Autre ' + i, 1]); mmA.push(['Divorcé 0', 1], ['divorce 1', 1]);
  const mmU = E.unify([{ id: 'x', label: 'f', headerRow: 0, aoa: mmA }], {}), mmC = E.buildCatalog(mmU.fields), mmK = mmC.find(c => c.label === 'Etat').key;
  const mmB = PMs.buildItems(PMs.sanitizeDefs([{ name: 'Div', kind: 'count', conds: [{ key: mmK, op: 'contains', v: 'divorce' }] }, { name: 'PasDiv', kind: 'count', conds: [{ key: mmK, op: 'notcontains', v: 'DIVORCÉ' }] }, { name: 'Liste', kind: 'count', conds: [{ key: mmK, op: 'in', v: 'divorce 0; autre 2' }] }]), mmC);
  const mmG = k => E.compute(mmU.rows, mmC.concat(mmB.items), { rows: [], cols: [], vals: [{ key: k.key, agg: k.agg0 }], filters: {}, sort: null }).grand[0];
  A(mmB.errors.length === 0 && mmG(mmB.items[0]) === 40002 && mmG(mmB.items[1]) === 20000 && mmG(mmB.items[2]) === 3, 'mesures texte : résultats identiques avec le cache par valeur (casse / accents / négations / plus de 50 000 valeurs distinctes)'); }
const mCalc = PCA.buildItems([{ name: 'Part', formula: '[Nb célibataires et mariés] / [Nombre de lignes] * 100' }], mCat);
A(mCalc.errors.length === 0 && Math.abs(E.compute(gU.rows, mCat.concat(mCalc.items), { rows: [], cols: [], vals: [{ key: 'calc|Part', agg: 'sum' }], filters: {}, sort: null }).grand[0] - 300 / 7) < 1e-9, 'mesures : utilisables dans une formule de champ calculé');
const mBad = PMs.buildItems(PMs.sanitizeDefs([{ name: 'A', kind: 'count', conds: [{ key: 'inconnu', op: 'in', v: 'x' }] }, { name: 'B', kind: 'count', conds: [{ key: gK('Age'), op: 'gt', v: 'abc' }] }, { name: 'C', kind: 'value', src: gK('Etat') }]), gC);
A(mBad.items.length === 0 && mBad.errors.length === 3 && /introuvable/.test(mBad.errors[0].error) && /invalide/.test(mBad.errors[1].error) && /numérique/.test(mBad.errors[2].error), 'mesures : champ absent, nombre invalide, source non numérique signalés');
A(PMs.checkName('', [], gC, '') !== '' && PMs.checkName('Etat', [], gC, '') !== '' && PMs.checkName('divorcés', mDefs, gC, '') !== '' && PMs.checkName('divorcés', mDefs, gC, mDefs[3].id) === '', 'mesures : nom vide ou déjà pris refusé');

// Liste des données : lignes filtrées, colonnes / tri mémorisés dans les dispositions
const lfRows = E.filterRows(cU.rows, cCat, { rows: [], cols: [], vals: [], filters: { [kCom]: new Set(['A']) }, rules: { [kEt]: { range: { min: 2 } } } });
A(lfRows.length === 2 && lfRows.every(r => r[cU.fields.findIndex(f => f.key === kCom)] !== 'A'), 'liste : filterRows applique valeurs exclues et règles (sans A, ≥ 2 : B et C)') ;
const lyL = fPL.sanitize(fPL.serialize({ rows: [], cols: [], vals: [], filters: {} }, { mode: 'list', listCols: [kCom, 'x'.repeat(300), kEt], listSort: { key: kEt, dir: -1 } }));
A(lyL.opts.mode === 'list' && lyL.opts.listCols.join() === kCom + ',' + kEt && lyL.opts.listSort.key === kEt && lyL.opts.listSort.dir === -1 && fPL.sanitize(fPL.serialize({ rows: [], cols: [], vals: [], filters: {} }, { mode: 'bidon' })).opts.mode === undefined, 'liste : mode, colonnes et tri conservés dans les dispositions (valeurs invalides écartées)');

// Graphiques : SVG pur généré depuis un résultat de tableau croisé
const AX = require('../js/chart-axis.js');
A(AX.ticks(0,97).join() === '0,20,40,60,80,100', 'axes : graduations existantes');
A(AX.scaleOf(0,100,{ymin:20,ymax:80}).span === 60, 'axes : bornes explicites');
A(AX.scaleOf(0,100,{ymin:90,ymax:20}).span > 0, 'axes : bornes inversées');
A(AX.ticks(NaN,20).length === 0 && AX.scaleOf(NaN,20,{}).span === 1, 'axes : données invalides');
const PCH = require('../js/chart.js');
const fakeRes = (nr, nc) => ({ K: 1, specs: [{ label: 'Total <b>', agg: 'sum' }], rowDims: ['Commune'], colDims: nc ? ['Année'] : [], cols: Array.from({ length: nc || 1 }, (_, j) => ({ labels: nc ? ['20' + (20 + j)] : [], key: 'c' + j })), rows: Array.from({ length: nr }, (_, i) => ({ labels: ['Ville <' + i + '>'], cells: Array.from({ length: nc || 1 }, (_, j) => (i === 2 && j === 0 ? null : (i + 1) * 10 - j * 3)), tot: [(i + 1) * 10] })), bottom: [], grand: [0] });
const chFmt = v => String(v);
const chOk = ['bar', 'hbar', 'stack', 'line', 'pie'].every(t => [fakeRes(5, 0), fakeRes(5, 3)].every(r => { const o = PCH.build(r, { type: t, k: 0, fmt: chFmt }); return /^<svg [^>]*viewBox/.test(o.svg) && o.svg.endsWith('</svg>') && o.h > 100; }));
A(chOk, 'graphique : les 5 types produisent un SVG (avec ou sans colonnes)');
const chX = PCH.build(fakeRes(3, 2), { type: 'bar', k: 0, fmt: chFmt }).svg;
A(!/<b>|<0>/.test(chX) && /&lt;b&gt;/.test(chX) && /Ville &lt;0&gt;/.test(chX), 'graphique : libellés échappés (pas d\'injection HTML)');
A(/30 premières lignes sur 45/.test(PCH.build(fakeRes(45, 0), { type: 'bar', k: 0, fmt: chFmt }).note) && PCH.build(fakeRes(5, 0), { type: 'none', k: 0, fmt: chFmt }).svg === '' && PCH.build({ empty: true }, { type: 'bar', fmt: chFmt }).svg === '', 'graphique : limite de 30 catégories signalée ; « aucun » → vide');
const pieNeg = PCH.build({ K: 1, specs: [{ label: 'v' }], rowDims: ['x'], colDims: [], cols: [{ labels: [], key: '' }], rows: [{ labels: ['a'], cells: [-5], tot: [-5] }, { labels: ['b'], cells: [0], tot: [0] }], bottom: [], grand: [0] }, { type: 'pie', fmt: chFmt });
A(pieNeg.svg === '' && /Rien à représenter/.test(pieNeg.note), 'graphique : secteurs sans valeur positive → message');
const pieN = PCH.build(fakeRes(5, 0), { type: 'pie', k: 0, fmt: chFmt, width: 480 }), pieW = PCH.build(fakeRes(5, 0), { type: 'pie', k: 0, fmt: chFmt, width: 1000 });
A(/<rect x="12" /.test(pieN.svg) && pieN.h > 400 && !/<rect x="12" /.test(pieW.svg) && pieW.w === 1000, 'graphique : secteurs étroits (tuile) → légende sous le disque ; larges → légende à droite');
const chW = (w, ph) => { const o = PCH.build(fakeRes(5, 3), { type: 'bar', k: 0, fmt: chFmt, width: w, plotH: ph }); return o; };
A(chW(1400, 500).w === 1400 && chW(1400, 500).h > chW(1400, 250).h && chW(100, 300).w === 420 && chW(9999, 300).w === 1800 && /viewBox="0 0 1400 /.test(chW(1400, 300).svg) && PCH.build(fakeRes(5, 0), { type: 'pie', k: 0, fmt: chFmt, width: 1200 }).w === 1200, 'graphique : largeur et hauteur du tracé adaptables (bornées)');
A(PCH.ticks(0, 97).join() === '0,20,40,60,80,100' && PCH.ticks(-30, 50)[0] <= -30 && PCH.ticks(5, 5).length >= 2, 'graphique : graduations de l\'axe');
const ssState = SSM.sanitizeState({ v: 1, savedAt: 5, sources: [{ id: 's1', headerRow: 2, use: false }, { id: 'x', headerRow: 0 }, { id: 's2', headerRow: -3 }, null], over: { 's1|0': 'Commune', 'bad': 'x', '__proto__': 'y', 's1|1': 5, 's2|3': '' }, layout: { v: 1 } });
A(ssState && ssState.sources.length === 2 && ssState.sources[0].use === false && ssState.sources[0].headerRow === 2 && ssState.sources[1].headerRow === 0 && ssState.sources[1].use === true && Object.keys(ssState.over).sort().join() === 's1|0,s2|3' && ({}).y === undefined, 'session : état relu nettoyé (identifiants, lignes d\'en-tête, renommages ; clés dangereuses écartées)');
const ssV = SSM.sanitizeState({ v: 1, sources: [], views: [{ name: 'A', layout: { v: 1 }, chart: { type: 'bar' } }, { name: 'x'.repeat(100), layout: { v: 1 } }, { name: 'B', layout: 'pas un objet' }, null, { name: 'C', layout: { v: 1 }, chart: 5 }], cur: 9 });
A(ssV.views.length === 2 && ssV.views[0].name === 'A' && ssV.views[1].name === 'C' && ssV.views[1].chart === null && ssV.cur === 0 && SSM.sanitizeState({ v: 1, sources: [], views: new Array(30).fill({ name: 'n', layout: {} }), cur: 3 }).views.length === SSM.MAX_VIEWS, 'session : vues relues nettoyées (nom, disposition, graphique), nombre borné');
const ssD = SSM.sanitizeState({ v: 1, sources: [], views: [{ name: 'A', layout: {}, tile: 'chart' }, { name: 'B', layout: {}, tile: 'pirate' }], dash: { on: true, cols: 2 } });
A(ssD.views[0].tile === 'chart' && ssD.views[1].tile === 'auto' && ssD.dash.on === true && ssD.dash.cols === 2 && SSM.sanitizeState({ v: 1, sources: [], dash: { on: 'oui', cols: 9 } }).dash.cols === 0 && SSM.sanitizeState({ v: 1, sources: [], dash: { on: 'oui', cols: 9 } }).dash.on === false, 'session : tableau de bord relu nettoyé (tuiles, colonnes)');
const ssI = SSM.sanitizeIndex({ v: 1, cur: 'p9', n: 2, list: [{ id: 'p1', name: 'A', updated: 5, files: 2, rows: 10 }, { id: 'zz', name: 'X' }, { id: 'p1', name: 'dup' }, { id: 'p3', name: 'x'.repeat(100) }, { id: 'p4', name: 'B', rows: -4 }, null] });
A(ssI.list.length === 2 && ssI.list[1].id === 'p4' && ssI.list[1].rows === 0 && ssI.cur === 'p1' && ssI.n === 4 && SSM.sanitizeIndex({ v: 2, list: [] }) === null && SSM.sanitizeIndex({ v: 1, list: [{ id: 'bad' }] }) === null && SSM.sanitizeIndex(null) === null, 'projets : index relu nettoyé (identifiants, noms, nombres, projet courant par défaut)');
const ssFake = { kind: 'file', getFile: () => null };
const ssH = SSM.assemble({ v: 1, sources: { s1: { file: 'a', sheet: 'S', label: 'a', aoa: [['A'], [1]], handle: ssFake, mtime: 5 }, s2: { file: 'b', sheet: 'S', label: 'b', aoa: [['A'], [1]], handle: { kind: 'dir' }, mtime: 'x' } } }, SSM.sanitizeState({ v: 1, sources: [{ id: 's1', headerRow: 0 }, { id: 's2', headerRow: 0 }] }));
A(ssH[0].handle === ssFake && ssH[0].mtime === 5 && ssH[1].handle === undefined && ssH[1].mtime === undefined, 'session : lien vers le fichier d\'origine repris seulement s\'il a la bonne forme');
A(SSM.sanitizeState(null) === null && SSM.sanitizeState({ v: 2, sources: [] }) === null && SSM.sanitizeState({ v: 1 }) === null, 'session : état absent ou de version inconnue → ignoré');
const ssData = { v: 1, sources: { s1: { file: 'a.xlsx', sheet: 'S', label: 'a.xlsx', aoa: [['A'], [1]] }, s2: { file: 'b.xlsx', sheet: 'S', label: 'b.xlsx', aoa: 'pas un tableau' }, __proto__x: {} } };
const ssSrc = SSM.assemble(ssData, SSM.sanitizeState({ v: 1, sources: [{ id: 's1', headerRow: 9, use: true }, { id: 's2', headerRow: 0, use: true }, { id: 's3', headerRow: 0, use: true }] }));
A(ssSrc.length === 1 && ssSrc[0].id === 's1' && ssSrc[0].headerRow === 1 && ssSrc[0].aoa.length === 2 && SSM.assemble(null, ssState).length === 0, 'session : sources sans données valides écartées, ligne d\'en-tête bornée');

// Dispositions enregistrées : sérialisation, validation, application, stockage
const PL = require('../js/layouts.js');
const ly_memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; };
const ly_L0 = { rows: ['f:commune', 'f:province'], cols: ['f:trimestre'], vals: [{ key: 'f:n', agg: 'avg', fmt: 'eur' }, { key: '__rows', agg: 'sum' }], filters: { 'f:commune': new Set(['Anvers', 'Boom']), 'f:vide': new Set() }, rowDir: { 'f:commune': -1 }, sort: { col: '__tot', k: 0, dir: -1 } };
const ly_O0 = { rowTot: true, colTot: false, subTot: true, freeze: false, wrap: true, style: 'statbel', density: 'compact', colw: 'l', cf: 'rule', cfOp: '>=', cfVal: '12,5', dec: '2' };
const ly_lay0 = PL.sanitize(JSON.parse(JSON.stringify(PL.serialize(ly_L0, ly_O0))));
A(ly_lay0 && ly_lay0.rows.join() === 'f:commune,f:province' && ly_lay0.vals[0].fmt === 'eur' && ly_lay0.vals[1].fmt === 'auto' && ly_lay0.filters['f:commune'].join() === 'Anvers,Boom' && !('f:vide' in ly_lay0.filters) && ly_lay0.opts.style === 'statbel' && ly_lay0.opts.subTot === true && ly_lay0.opts.cfVal === '12,5' && ly_lay0.sort.col === '__tot', 'disposition : sérialisation → JSON → validation sans perte (filtres vides écartés)');
const ly_evil = PL.sanitize(JSON.parse('{"v":1,"rows":["__proto__","ok",5],"cols":[],"vals":[{"key":"f:x","agg":"ly_evil","fmt":"zzz"},{"key":"__proto__","agg":"sum"}],"filters":{"__proto__":["a"],"f:x":["a",5,"b"]},"rowDir":{"__proto__":-1,"f:x":-1,"f:y":1},"sort":{"col":"a","k":99,"dir":2},"opts":{"style":"hack","rowTot":"yes","cfVal":"' + 'x'.repeat(100) + '","cf":"bars"}}'));
A(ly_evil && ly_evil.rows.join() === 'ok' && ly_evil.vals.length === 1 && ly_evil.vals[0].agg === 'sum' && ly_evil.vals[0].fmt === 'auto' && Object.keys(ly_evil.filters).join() === 'f:x' && ly_evil.filters['f:x'].join() === 'a,b' && Object.keys(ly_evil.rowDir).join() === 'f:x' && ly_evil.sort === null && !('style' in ly_evil.opts) && !('rowTot' in ly_evil.opts) && !('cfVal' in ly_evil.opts) && ly_evil.opts.cf === 'bars' && ({}).a === undefined, 'fichier hostile : clés dangereuses, agrégat/format/réglages inconnus, valeurs trop longues → écartés ; aucune pollution de prototype');
A(PL.sanitize(null) === null && PL.sanitize({ v: 2 }) === null && PL.sanitize('x') === null && PL.sanitize({ v: 1, sort: { col: '', k: 0, dir: 1 } }).sort.col === '', 'disposition invalide → null ; tri sans colonne (clé vide) conservé');
const ly_ap = PL.apply(PL.sanitize({ v: 1, rows: ['f:a', 'f:gone', 'f:b'], cols: ['f:a', 'f:c'], vals: [{ key: 'f:n', agg: 'sum', fmt: 'auto' }, { key: 'f:gone2', agg: 'sum' }], filters: { 'f:a': ['x'], 'f:gone3': ['y'] }, rowDir: { 'f:a': -1 } }), ['f:a', 'f:b', 'f:c', 'f:n']);
A(ly_ap.L.rows.join() === 'f:a,f:b' && ly_ap.L.cols.join() === 'f:c' && ly_ap.L.vals.length === 1 && ly_ap.L.vals[0].fmt === undefined && ly_ap.L.filters['f:a'] instanceof Set && ly_ap.missing.sort().join() === 'f:gone,f:gone2,f:gone3' && ly_ap.L.rowDir['f:a'] === -1, 'application : champs absents ignorés et listés, champ en lignes ET colonnes dédoublonné, filtres → Set');
const ly_ms = ly_memStore();
const ly_s1 = PL.save(ly_ms, '  Ma vue \n', PL.serialize(ly_L0, ly_O0)), ly_s2 = PL.save(ly_ms, 'Ma vue', PL.serialize(ly_L0, ly_O0));
A(ly_s1.ok && !ly_s1.replaced && ly_s1.name === 'Ma vue' && ly_s2.ok && ly_s2.replaced && Object.keys(PL.loadAll(ly_ms)).join() === 'Ma vue', 'stockage : nom nettoyé, enregistrement puis remplacement');
A(!PL.save(ly_ms, '   ', PL.serialize(ly_L0, ly_O0)).ok && !PL.save(ly_ms, '__proto__', PL.serialize(ly_L0, ly_O0)).ok && !PL.save(ly_ms, 'x', { v: 3 }).ok, 'stockage : nom vide, nom dangereux, disposition invalide → refusés');
A(PL.remove(ly_ms, 'Ma vue') && !PL.remove(ly_ms, 'Ma vue') && Object.keys(PL.loadAll(ly_ms)).length === 0, 'stockage : suppression');
const ly_full = ly_memStore(); for (let i = 0; i < PL.MAX_LAYOUTS; i++) PL.save(ly_full, 'v' + i, PL.serialize(ly_L0, ly_O0));
A(!PL.save(ly_full, 'de trop', PL.serialize(ly_L0, ly_O0)).ok && PL.save(ly_full, 'v0', PL.serialize(ly_L0, ly_O0)).ok, 'stockage : limite de ' + PL.MAX_LAYOUTS + ' dispositions (le remplacement reste possible)');
const ly_bad = ly_memStore(); ly_bad.setItem(PL.STORE, '{ pas du json');
const ly_broken = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('plein'); } };
A(Object.keys(PL.loadAll(ly_bad)).length === 0 && Object.keys(PL.loadAll(ly_broken)).length === 0 && PL.save(ly_broken, 'x', PL.serialize(ly_L0, ly_O0)).ok === false, 'stockage corrompu / indisponible / plein : pas d\'exception');

// Export XLSX mis en forme (classeur OOXML écrit à la main)
const PXL = require('../js/xlsx.js');
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
const xa = [['Région', 'Commune', 'Trim', 'N'], ['<A&B>', 'x', '2024 T1', 10], ['<A&B>', 'y', '2024 T1', 20], ['=cmd()', 'z', '2024 T1', 30], ['=cmd()', 'w', '2024 T2', 5]];
const xu = E.unify([{ id: 'x', label: 'f', headerRow: 0, aoa: xa }], {}), xcat = E.buildCatalog(xu.fields), xk = l => xcat.find(c => c.label === l).key;
const mkRes = (vals, extra) => E.compute(xu.rows, xcat, Object.assign({ rows: [xk('Région'), xk('Commune')], cols: [xk('Trim')], vals, filters: {}, sort: null, subtotals: true }, extra));
const xres = mkRes([{ key: xk('N'), agg: 'sum' }]);
const xb = PXL.build(xres, { style: 'statbel', rowTot: true, colTot: true, subTot: true, cf: 'none' });
const xz = unzipStore(xb);
A(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'].every(n => xz[n]) && Object.values(xz).every(wellFormed), 'XLSX mis en forme : archive valide, 6 parties XML bien formées');
const xwb = XLSX.read(Buffer.from(xb), { type: 'buffer', cellNF: true }), xws = xwb.Sheets[xwb.SheetNames[0]];
const xrows = XLSX.utils.sheet_to_json(xws, { header: 1, raw: true });
A(xwb.SheetNames[0] === 'Tableau croisé' && xrows[xrows.length - 1][0] === 'Total' && xrows[xrows.length - 1].includes(65), 'relecture SheetJS : feuille « Tableau croisé », total général 65 (' + xrows[xrows.length - 1] + ')');
A((xws['!merges'] || []).length >= 3 && xrows.some(r => String(r[0]).startsWith('Total ') || String(r[1]).startsWith('Total ')), 'cellules fusionnées et lignes de sous-total présentes (' + (xws['!merges'] || []).length + ' fusions)');
A(xz['xl/worksheets/sheet1.xml'].includes('&lt;A&amp;B&gt;') && !xz['xl/worksheets/sheet1.xml'].includes('<f>') && xz['xl/worksheets/sheet1.xml'].includes('>=cmd()<'), 'texte échappé ; « =cmd() » reste du texte (aucune formule <f>)');
A(xz['xl/styles.xml'].includes('FF1565C0') && !unzipStore(PXL.build(xres, { style: 'standard' }))['xl/styles.xml'].includes('FF1565C0'), 'style Statbel → en-têtes bleus ; style standard → pas de bleu');
A(/<pane xSplit="2" ySplit="2" topLeftCell="C3"[^>]*state="frozen"/.test(xz['xl/worksheets/sheet1.xml']), 'volets figés : libellés + en-têtes');
const cfOf = o => unzipStore(PXL.build(mkRes([{ key: xk('N'), agg: 'sum' }]), Object.assign({ rowTot: true, colTot: true }, o)))['xl/worksheets/sheet1.xml'];
A(!cfOf({ cf: 'none' }).includes('conditionalFormatting') && cfOf({ cf: 'scale3' }).includes('colorScale') && cfOf({ cf: 'bars' }).includes('<dataBar>') && (cfOf({ cf: 'top' }).match(/type="top10"/g) || []).length >= 2 && cfOf({ cf: 'heat' }).includes('colorScale'), 'mise en forme conditionnelle native : none / heat / scale3 / bars / top');
A(/<cfRule type="cellIs"[^>]*operator="greaterThan"[^>]*><formula>15<\/formula>/.test(cfOf({ cf: 'rule', cfOp: '>', cfVal: '15' })) && !cfOf({ cf: 'rule', cfVal: 'abc' }).includes('cellIs'), 'règle valeur > 15 → cellIs/greaterThan ; seuil invalide ignoré');
const pres = mkRes([{ key: xk('N'), agg: 'pctgrand' }]);
const pz = unzipStore(PXL.build(pres, { rowTot: true, colTot: true, cf: 'rule', cfOp: '>', cfVal: '25' }));
A(pz['xl/styles.xml'].includes('formatCode="0.0%"') && pz['xl/worksheets/sheet1.xml'].includes('<formula>0.25</formula>'), '% du total : format 0,0 % + seuil converti (25 → 0,25)');
const fz = unzipStore(PXL.build(mkRes([{ key: xk('N'), agg: 'sum', fmt: 'eur' }, { key: xk('N'), agg: 'avg', fmt: 'k' }]), { rowTot: true }))['xl/styles.xml'];
A(fz.includes('#,##0.00 &quot;€&quot;') && fz.includes('#,##0.0,&quot;k&quot;'), 'formats par valeur : euro et milliers → formats Excel');
A(unzipStore(PXL.build(xres, { rowTot: true }))['xl/styles.xml'].includes('formatCode="#,##0"') && unzipStore(PXL.build(mkRes([{ key: xk('N'), agg: 'avg' }]), { rowTot: true }))['xl/styles.xml'].includes('formatCode="#,##0.00"'), 'format automatique : entiers → #,##0 ; décimaux → #,##0.00');

// Tri par valeur en conservant la hiérarchie (Province > Commune)
const sh = { id: 'h', label: 'fh', headerRow: 0, aoa: [['Province', 'Commune', 'N'], ['A', 'a1', 5], ['A', 'a2', 50], ['B', 'b1', 100], ['B', 'b2', 1], ['C', 'c1', 20]] };
const uh = E.unify([sh], {}), ch = E.buildCatalog(uh.fields), kh = l => ch.find(c => c.label === l).key;
const rh = E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'sum' }], filters: {}, sort: { col: '', k: 0, dir: -1 } });
A(rh.rows.map(r => r.labels[1]).join() === 'b1,b2,a2,a1,c1', 'tri par valeur ↓ hiérarchique : B(101) > A(55) > C(20), puis valeurs dans le groupe (got ' + rh.rows.map(r => r.labels[1]) + ')');
const rh2 = E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'sum' }], filters: {}, sort: { col: '', k: 0, dir: 1 } });
A(rh2.rows.map(r => r.labels[1]).join() === 'c1,a1,a2,b2,b1', 'tri par valeur ↑ hiérarchique (got ' + rh2.rows.map(r => r.labels[1]) + ')');

// Tri des moyennes : pondérer par les observations, pas par les sous-groupes.
const sw = { id: 'w', label: 'weighted', headerRow: 0, aoa: [
  ['Province', 'Commune', 'N'], ['A', 'a1', 100], ['A', 'a2', 0], ['A', 'a2', 0],
  ['A', 'a2', 0], ['A', 'a2', 0], ['B', 'b1', 30], ['B', 'b2', 30]
] };
const uw = E.unify([sw], {}), cw = E.buildCatalog(uw.fields), kw = l => cw.find(c => c.label === l).key;
const rw = E.compute(uw.rows, cw, { rows: [kw('Province'), kw('Commune')], cols: [],
  vals: [{ key: kw('N'), agg: 'avg' }], filters: {}, sort: { col: '', k: 0, dir: -1 } });
A(rw.rows[0].labels[0] === 'B' && rw.rows[0].tot[0] === 30,
  'tri moyenne pondérée : B(30) avant A(20), malgré moyenne non pondérée A(50)');

// Sous-totaux par niveau (Province > Commune)
const rs = E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'sum' }], filters: {}, sort: null, subtotals: true });
const subA = E.subtotalsAfter(rs, 1), subC = E.subtotalsAfter(rs, 4);
A(subA.length === 1 && subA[0].labels.join() === 'A' && subA[0].cells[0] === 55 && E.subtotalsAfter(rs, 0).length === 0, 'sous-total A = 55 après la dernière commune de A, pas avant');
A(subC.length === 1 && subC[0].cells[0] === 20, 'sous-total C = 20 (dernier groupe)');
const mx = E.flatMatrix(rs, { rowTot: true, colTot: true, subTot: true });
A(mx.filter(r => /^Total /.test(r[0])).map(r => r[2]).join() === '55,101,20' && mx.length === 1 + 5 + 3 + 1, 'export à plat : 3 lignes de sous-total + total général (' + mx.length + ' lignes)');
const ravg = E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'avg' }], filters: {}, sort: null, subtotals: true });
A(E.subtotalsAfter(ravg, 1)[0].cells[0] === 27.5, 'sous-total d\'une moyenne = moyenne du groupe (27,5), pas somme des moyennes');
A(E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'sum' }], filters: {}, sort: null }).subs.length === 0, 'sous-totaux désactivés par défaut');

// Tri des libellés de la première colonne (Z→A)
const rz = E.compute(uh.rows, ch, { rows: [kh('Province'), kh('Commune')], cols: [], vals: [{ key: kh('N'), agg: 'sum' }], filters: {}, sort: null, rowDir: { [kh('Province')]: -1 } });
A(rz.rows.map(r => r.labels.join('')).join() === 'Cc1,Bb1,Bb2,Aa1,Aa2', 'libellés Z→A sur la 1re colonne, 2e niveau resté A→Z (got ' + rz.rows.map(r => r.labels.join('')) + ')');

// Dérivations de dates (dd/mm/yyyy) et de périodes texte (« 2024 T1 »)
const sd = { id: 'd', label: 'fd', headerRow: 0, aoa: [['Date', 'Trimestre', 'Val'], ['15/03/2024', '2024 T1', 1], ['01/11/2024', '2024 T4', 2], ['20/05/2025', 'T2 2025', 3], ['04/07/2025', '4ème trimestre 2025', 4]] };
const ud = E.unify([sd], {});
const fd = ud.fields.find(f => f.label === 'Date'), ft = ud.fields.find(f => f.label === 'Trimestre');
A(fd.type === 'date' && ft.period === true, 'dd/mm/yyyy → date ; « 2024 T1 » → période (' + fd.type + '/' + ft.period + ')');
const cd = E.buildCatalog(ud.fields), dimOf = (label, i) => cd.find(c => c.label === label).dim(ud.rows[i]);
A(dimOf('Date (année)', 0) === '2024' && dimOf('Date (trimestre T1–T4)', 1) === 'T4' && dimOf('Date (mois)', 0) === '03 mars', 'date → année, T1–T4, mois');
A(dimOf('Date (jour de la semaine)', 0) === '5 vendredi' && dimOf('Date (année-trimestre)', 2) === '2025-T2', 'date → jour de la semaine (15/03/2024 = vendredi), année-trimestre');
A(dimOf('Trimestre (année)', 0) === '2024' && dimOf('Trimestre (trimestre T1–T4)', 0) === 'T1' && dimOf('Trimestre (année)', 2) === '2025' && dimOf('Trimestre (trimestre T1–T4)', 3) === 'T4', '« 2024 T1 » / « T2 2025 » / « 4ème trimestre 2025 » → année + T1–T4');

// Détection des conflits de fusion : aucun écrasement silencieux de données divergentes.
const conflictSource = { id: 'conf', label: 'conflit.xlsx', headerRow: 0, aoa: [['A', 'B'], [125, 130], [7, 7]] };
const conflictResult = E.unify([conflictSource], { 'conf|1': 'A' });
A(conflictResult.conflicts.length === 1 && conflictResult.conflicts[0].row === 2 && conflictResult.rows[0][1] === 125, 'fusion conflictuelle détectée et signalée');

const ambiguous = E.unify([{ id: 'amb', label: 'amb', headerRow: 0, aoa: [['Montant'], ['1.234'], ['2.345']] }], {});
A(ambiguous.ambiguities.length === 1 && ambiguous.ambiguities[0].count === 2 && ambiguous.rows[0][1] === 1234, 'formats numériques ambigus signalés (un exemple par champ, avec effectif)');

const large = E.unify([{ id: 'large', label: 'large', headerRow: 0, aoa: [['Groupe', 'N'], ...Array.from({length:100000}, (_, i) => ['G'+(i%200), 1])] }], {});
const largeCat = E.buildCatalog(large.fields);
const largeRes = E.compute(large.rows, largeCat, {rows:[largeCat.find(x=>x.label==='Groupe').key],cols:[],vals:[{key:largeCat.find(x=>x.label==='N').key,agg:'sum'}],filters:{},sort:null});
A(largeRes.rows.length===200 && largeRes.grand[0]===100000,'charge 100k lignes et 200 groupes');

// Import CSV : encodages UTF-8, Windows-1252 et UTF-16 avec BOM.
const PI = require('../js/import.js');
const utf16 = Buffer.from([0xff, 0xfe, ...Buffer.from('A;B\n1;2', 'utf16le')]);
A(PI.decodeText(utf16.buffer.slice(utf16.byteOffset, utf16.byteOffset + utf16.byteLength)).includes('A;B'), 'import UTF-16 LE BOM');
// Sécurité CSV : aucune formule ne doit être exécutable lors de l'ouverture.
const PX = require('../js/export.js');
const csvSafe = PX.toCSV([['Libellé', 'Valeur'], ['danger', '=1+1'], ['signe', '+SUM(A1)'], ['espace', '  @cmd'], ['texte', 'a;b"c']]);
A(csvSafe.startsWith('\ufeff') && csvSafe.includes("'=1+1") && csvSafe.includes("'+SUM(A1)") && csvSafe.includes("'  @cmd") && csvSafe.includes('"a;b""c"'), 'export CSV : formules neutralisées et champs échappés');
A(PX.toTSV([['A', 'B'], ['x\ny', 1.5]]).includes('x y\t1,5'), 'presse-papiers : tabulation et décimales belges');
const tsvSafe = PX.toTSV([['=HYPERLINK("x")', '+1', '  @cmd', 'normal', -5]]);
A(tsvSafe === "'=HYPERLINK(\"x\")\t'+1\t'  @cmd\tnormal\t-5", 'presse-papiers : formules neutralisées, nombres négatifs intacts (' + JSON.stringify(tsvSafe) + ')');
// Conflits : compteur exact, échantillon plafonné ; ambiguïtés : tous les champs signalés
const bigAoa = [['A', 'B']]; for (let i = 0; i < 5000; i++) bigAoa.push(['x' + i, 'y' + i]);
const bigConf = E.unify([{ id: 's', label: 'f', headerRow: 0, aoa: bigAoa }], { 's|1': 'A' });
A(bigConf.conflictCount === 5000 && bigConf.conflicts.length === 100, 'conflits : 5000 comptés, échantillon plafonné à 100 (' + bigConf.conflictCount + '/' + bigConf.conflicts.length + ')');
const ambAoa = [['Val', 'Autre']]; for (let i = 0; i < 300; i++) ambAoa.push(['1.234', '2,345']);
const ambMulti = E.unify([{ id: 's', label: 'f', headerRow: 0, aoa: ambAoa }], {});
A(ambMulti.ambiguities.length === 2 && ambMulti.ambiguities.every(a => a.count === 300), 'ambiguïtés : chaque champ signalé une fois, avec son effectif');
// Les accumulateurs de tri sont temporaires : éviter de retenir les Map de cellules en mémoire.
const cleanResult = E.compute(large.rows, largeCat, { rows: [largeCat.find(x => x.label === 'Groupe').key], cols: [], vals: [{ key: largeCat.find(x => x.label === 'N').key, agg: 'sum' }], filters: {}, sort: { col: '__tot', k: 0, dir: -1 } });
A(cleanResult.rows.every(r => !Object.hasOwn(r, '_acc') && !Object.hasOwn(r, '_cellAcc')), 'calcul : accumulateurs libérés après tri');
console.log(fails ? fails + ' échec(s)' : 'OK');
process.exit(fails ? 1 : 0);

