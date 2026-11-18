# Tableaux croisés dynamiques — carte des modules

Outil mainteneur `outils/statbel_pivot.html` : 100 % local, ouvrable en double-clic (`file://`). Les modules sont des **scripts classiques**
(globales `window.Pivot…`, parties pures testables sous Node via `module.exports`), chargés dans l'ordre ci-dessous par un chargeur inline
(`?v=Date.now()` : jamais de vieux fichier en cache). **Le test lit cette liste dans la page** : un nouveau module = l'ajouter au chargeur, rien d'autre.

## Ordre de chargement et responsabilités

| Module | Rôle |
|---|---|
| `engine.js` | Moteur pur : unification des colonnes, catalogue de champs, calcul du tableau croisé (agrégats, filtres, tris, sous-totaux, Top N), analyse CSV / dates / nombres belges |
| `format.js` | Formats de nombres, styles, mise en forme conditionnelle |
| `import.js` · `export.js` · `xlsx.js` | Lecture de fichiers (BOM / UTF-16) · CSV, TSV, presse-papiers · XLSX mis en forme (OOXML écrit à la main) |
| `chart-axis.js` · `chart-trend.js` | Graduation et échelles (linéaire / logarithmique) · tendances (droite, polynôme, moyenne mobile) |
| `chart-cartesian.js` | Rendu des barres, colonnes, lignes et aires (reçoit un contexte du graphique) |
| `chart-capabilities.js` | **Registre** : quelles options ont un effet sur quel type de graphique (source unique pour l'interface et le moteur) |
| `chart.js` | `PivotChart.build()` : normalisation des options (`normOpts`, `normChart`), types, secteurs / combiné / pyramide, titre, légende ; contexte de rendu `CX` créé à chaque appel (aucun état partagé) |
| `chart-more.js` | Types enregistrés par `PivotChart.register` : treemap, nuage de points, KPI, jauges, carte à bulles |
| `hier.js` | **Hiérarchies** du projet (`st.hier`) : `sanitize`, `detect` (géographie / temps), `uppers`, `allowed`, `fix` — listes de filtres en cascade ; fonctions pures |
| `chart-editor.js` | **Définitions des contrôles d'options** (`DEFS`) : génère le panneau du Pivot et la fenêtre d'édition d'une tuile ; boîte « Sélecteurs » |
| `geo.js` | Fonds de carte hors-ligne (`vendor/geo/`) |
| `calc.js` · `groups.js` · `measures.js` | Champs calculés · groupes de valeurs (`grp|<id>`) · mesures avec condition (`mes|<id>`) |
| `join.js` · `quality.js` | Jointures entre fichiers · aperçu et contrôle qualité |
| `cube.js` | Fenêtre de configuration du cube de données (champ du graphique par défaut, champs de filtrage) |
| `layouts.js` · `session.js` | Dispositions enregistrées (nettoyage, `dropKey`) · session / projets (IndexedDB, **assainissement de tout ce qui est relu**) |
| `app.js` | Interface — **cœur** : `PIVOT_VERSION`, état `st`, utilitaires, lecture et actualisation des fichiers |
| `app-donnees.js` · `app-navigation.js` · `app-vues.js` | Jointures, aperçu qualité, reconstruction · mobile, menu « Données », champs, zones, grand écran · vues (onglets), tableau de bord, sélecteurs |
| `app-assistant.js` · `app-filtres.js` · `app-graphique.js` | Assistant « Projet » + session · barre de pastilles et dialogue de filtre · graphique actif `ch`, panneaux ⚙ |
| `app-tableau.js` · `app-derives.js` · `app-dialogues.js` · `app-evenements.js` · `app-projets.js` | Tableau croisé, liste des données, détail · champs calculés, groupes, mesures · exports, colonnes / fusion, dispositions · événements · projets |
| `app-init-donnees.js` → `app-init-projets.js` (5 fichiers) | **Démarrage** : toutes les instructions exécutées au chargement (état `st`, câblage des boutons…), **dans l'ordre exact de l'ancien `app.js`**, chargées en dernier |

**Interface (`app*.js`) = un seul « programme » en scripts classiques** : les déclarations sont globales et **partagées** entre les fichiers (pas d'IIFE). Règle : les fichiers `app.js` → `app-projets.js` ne contiennent que des **fonctions** et des **déclarations sans effet au chargement** (littéraux, fonctions fléchées…) ; tout ce qui s'exécute au chargement (appel de fonction, `addEventListener`, `const x = f()`) va dans un fichier `app-init-*` (le plus proche de sa section). Une fonction peut être appelée d'un fichier à l'autre sans souci d'ordre (tout est défini avant le démarrage) ; un nouveau nom global ne doit pas en masquer un autre : pas de doublon d'un fichier à l'autre.

## Navigation (écran à deux niveaux)

- **Menu « Données »** (`#rail`, colonne d'icônes à gauche, ▸ pour l'élargir ; tiroir « ☰ Données » sur téléphone) : Ajouter des fichiers, Actualiser, Colonnes & fusion, Aperçu, Jointures, Cube, Réinitialiser. Les identifiants des boutons (`#btnAdd`, `#btnMap`…) n'ont pas changé.
- **Niveau 1 = tableau de bord** (`st.dash.on`, tuiles + tuile « Nouvelle vue »), **niveau 2 = une vue ouverte**. `#viewTabs` est un **fil d'Ariane** (`renderViews`) : `← Tableau de bord › Vue ▾ ⋯` ; ▾ = menu `#vmenu` (liste des vues + « Nouvelle vue »), ⋯ = menu `#amenu` (renommer, dupliquer, déplacer, supprimer). Tous les gestes gardent `data-view` / `data-vact` (une seule gestion des clics). « ✎ Ouvrir » d'une tuile = `switchView` + `setDash(false)`.
- **Menus** (`.menu`, `toggleMenu` / `closeMenus`) : un seul ouvert, fermés par clic extérieur ou Échap, **toujours rabattus dans l'écran**. Menu **Exporter** (`#xmenu`) : Copier, CSV, XLSX, PNG, SVG.
- **Panneau « ⚙ Graphique »** (`#chOpts`, tiroir à droite / feuille sur téléphone, `body.cp-open`, `setPanel`) : fermé par défaut, ouvert par `#btnChOpts` ; réglages appliqués en direct ; **sections repliables** (Données, Affichage, Axes, Tendance) générées par `PivotChartEditor.html` (`SEC_OF`) et filtrées par type dans `refreshVisibility` (une section sans réglage utile est masquée, nombre de réglages affiché). La fenêtre d'édition d'une tuile utilise les mêmes sections. **Pour ajouter une option : la ranger dans `SEC_OF`** (en plus de `DEFS` / `PANEL_ID` / registre des capacités).
- **Menu Données** : infobulles riches (`data-d` = description, `#railTip`) au survol / clavier (pas sur écran tactile) ; Champs calculés, Groupes, Mesures (`#btnCalc`, `#btnGrp`, `#btnMes`) ouvrent leur section dans la colonne de gauche d'une vue (`gotoSection`).
- Tests : les entrées de menus fermés se déclenchent par `vact` / `vview` / `xclick` (helpers en tête de chaque `tests/pivot-tool-*.test.js`) ; les vrais clics sont couverts par les blocs « navigation : … ».

## Flux de données

`fichiers → import → engine.unify → catalogue (+ groupes, mesures, calculs) → engine.compute(disposition) → résultat → PivotChart.build → SVG`
**Navigation entre tuiles** (3.8.0) : clic sur le corps d'une tuile du tableau de bord (`#dash`, hors `button, select, input, label, a, .th, .tsel`) → `switchView` + `setDash(false)` ; flèches `data-vact="prev|next"` dans le fil d'Ariane (`renderViews`), circulaires.

**Liste des champs** (3.6.0, `renderFields`) : rubriques `.fgrp` « Dimensions » / « Mesures » ; mesure = `valueOnly` / `measure` / `calc` ou type nombre hors niveau de hiérarchie (`st.hier`).

**Disposition PC d'une tuile ouverte** (3.5.0) : grille `rail | aside (champs + `#cfgDerived` : calculés, groupes, mesures, dispositions) | colonne droite` ; `#cfgZones` (4 zones) en ligne 1 de la colonne droite, `#tview` en ligne 2. Mobile : écrans « Configurer » / « Tableau » inchangés.

**Panneau « ⚙ Tableau »** (3.5.0, `#tbOpts`, `setTPanel`) : tiroir frère de `#chOpts` (`body.tp-open` / `body.cp-open`, un seul ouvert) qui héberge les réglages du tableau croisé / de la table — totaux et décimales, Top N, mise en forme (mêmes identifiants `#opt*` qu'avant) ; bouton `#btnTbOpts`, masqué en mode « liste des données » ; sur une tuile « tableau », `data-tact="tbl"` ouvre la tuile avec le panneau.

**Assistant « Projet »** (3.3.0, `#dlgWiz`, `openWizard(étape)` dans `app-assistant.js`) : 1 Sources (héberge `#sources`, `#wzAdd`, `#wzMap`), 2 Jointures (`#wzJoin`, liste `#wzJoins`), 3 Champs et hiérarchies (3.7.0 : héberge les formulaires `#detCalc` / `#detGrp` / `#detMes`, éditeur `#wzHier`). Cascade : `cascadeCtx(v)` (sélecteurs globaux hors vue ⊘ + ceux de la vue), `selOpts(…, ctx)` filtre les valeurs proposées, `cascadeAll()` remet à « Toutes » les valeurs devenues incohérentes ; `state.hier` est mémorisé (`session.js` : `sanitizeHier`).

**Barre de pastilles** (3.2.0) : `fbarHtml(ctx, v)` génère la barre `.fbar` (`#selBar` dans une vue, `.dash-bar` au tableau de bord) — pastilles globales (`select[data-gsel]`, retrait `[data-gx]`) et de vue (`select[data-sel]`, retrait `[data-vx]`), bouton `.fadd` + menu `.fmenu` (`[data-fadd=clé]`, portée `[data-fscope=view|global]`). Un seul gestionnaire de clic au niveau du document.

Pour une vue : `effLayout(v, L)` ajoute à sa disposition, avant le calcul, les choix des **sélecteurs de la vue** (`v.sel`) et des **sélecteurs globaux** du tableau de bord (`st.dash.sel`) sous forme d'exclusions supplémentaires. Les exclusions couvrent **toutes** les valeurs du champ (`allOf`, sans plafond) ; une valeur absente est ignorée ; le sélecteur global l'emporte sur celui d'une tuile du même champ (`selActive`). Une vue avec `v.ng` (bouton 🌐 / ⊘ de la tuile) ignore les sélecteurs globaux ; `ng` est persisté (`snapshot`, `session.js`).

Graphique d'une **tuile** : `PivotChart.build(res, { width: largeur mesurée, minW: 300, fitH: hauteur voulue })` — `fitH` ajuste la hauteur totale (recherche du tracé par essais successifs, `fitBuild`) ; sans `fitH`, rendu inchangé. Contenu d'une tuile (`v.tile`, `tileKind`) : **un seul contenu** : graphique OU tableau (bouton ⇄ : mêmes lignes, colonnes et valeurs), ou masquée. L'ancien mode `both` (graphique + tableau) est migré en deux tuiles à la lecture de l'état (`session.js` : `splitBoth`). **Cube** (`st.cube = { chart, filters }`, bouton « Cube… », `cube.js`, persisté dans `state.cube`) : `chart` = champ du graphique par défaut (`dimOf` : réglage de la vue `cdim`, `'-'` = comme le tableau, sinon le cube) ; `filters` = champs ajoutés aux sélecteurs globaux (`setCube`). **Champ du graphique** : les options `cdim` / `cdim2` (dans `o`, donc persistées partout) font calculer au graphique un résultat dédié (`chartRes` : lignes = `cdim`, colonnes = `cdim2`, mêmes valeurs et filtres + sélecteurs) ; le tableau reste inchangé, les autres champs ne servent qu'à filtrer. Vide = résultat du tableau. La largeur d'une tuile est **mesurée après mise en page** (`dashMeasured`), jamais estimée.

## Où vit la configuration d'un graphique (3 lieux)

1. Mémoire : `ch` (vue **active**) et `v.ch` (instantané). **Toujours passer par `chartOf(v)` / `setChartOf(v, patch)`** (jamais lire `v.ch` d'une vue active).
2. `localStorage` `statbel_pivot_chart` : graphique de la vue active (valeur de repli au démarrage).
3. `snapshot().state.views[]` (`chart`, `sel`) : session, projets, export / import `.json`, **assainis par `session.js`**.
Les dispositions enregistrées (`layouts.js`) **ne contiennent pas** de graphique.

## Recettes

- **Ajouter une option de graphique** : `normOpts` (valeur, borne, défaut) → `DEFS` dans `chart-editor.js` (+ `PANEL_ID` si le panneau doit la porter) → la déclarer dans `chart-capabilities.js` pour les types concernés → la lire dans le moteur (`O.x`). Panneau et fenêtre de tuile sont générés : **rien d'autre à écrire**. Les tests « une option non applicable ne change jamais le rendu » valident le registre.
- **Ajouter un type de graphique** : l'ajouter à `TYPES` (`chart.js`) et le construire (`PivotChart.register` dans `chart-more.js`, ou rendu dédié), titre via `c.title(texte_par_défaut)`, puis l'ajouter au registre des capacités.
- **Ajouter un module** : fichier dans `outils/pivot/`, nom ajouté au chargeur de `statbel_pivot.html` (avant `app.js` ; l'interface `app*.js` et ses fichiers de démarrage `app-init-*` se chargent en dernier), partie pure exportée via `module.exports` pour les tests.
- **Persister un nouveau réglage de vue** : `captureView` / `snapshot` / restauration (`app-projets.js`) **et** son assainissement dans `session.js` (`sanitizeState`).

## Vérifier

```bash
node tools/run-tests.js "tests/pivot-tool-*.test.js"   # suites du pivot, en parallèle (moteur pur + 3 suites Playwright headless)
npx eslint js tests --max-warnings 0                 # lint
npx --yes jscpd@5.4.2 outils/pivot --min-tokens 40 --min-lines 4   # duplication (seuil du dépôt : 2 %)
node tools/gen-code-map.js                           # régénère docs/carte-du-code.html
```

Version : `PIVOT_VERSION` (`app.js`, cœur) + ligne « Pivot x.y.z » du `CHANGELOG.md` (testée) ; numérotation par jalons majeurs, tags `pivot-vX.Y.Z`.

## Publication (dépôt autonome, projet Vercel `statbel-pivot`)

L'outil ouvre des fichiers Excel / CSV quelconques : il est publié sur **sa propre origine** (https://statbel-pivot.vercel.app/outils/statbel_pivot.html), distincte de celle des PWA d'enquête (`localStorage` / IndexedDB non partagés).

- `node outils/build-pivot-site.js` assemble `dist-pivot/` (même arborescence relative que le dépôt : la page lit `../vendor/…`) : `index.html` (redirige vers la page), `robots.txt` (aucune indexation), la page, `outils/pivot/*.js`, `vendor/xlsx/xlsx.full.min.js`, `vendor/geo/geo-data.js`. Aucun service worker. Test : `tests/pivot-tool-site.test.js`.
- Réglages Vercel : Root Directory `.` · Framework *Other* · **Install Command** `true` · **Build Command** `node outils/build-pivot-site.js` · **Output Directory** `dist-pivot` · production sur `main`.
- Le script de build vit dans `outils/` et non `tools/` : `.vercelignore` supprime `tools/` avant le build.
- La page reste aussi ouvrable en double-clic depuis le dépôt (`file://`).
- Ancien emplacement : `statbel-app` redirige `/outils/statbel_pivot.html`, `/outils/pivot/*` et `/vendor/geo/*` vers cette adresse.
