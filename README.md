# statbel-pivot

Tableaux croisés dynamiques **100 % locaux** sur fichiers Excel / CSV variés (SheetJS vendorisé, aucune donnée ne quitte l'appareil, ouvrable en double-clic `file://`). Extrait de `statbel-app` pour être publié sur **sa propre origine** : l'outil ouvre des fichiers quelconques, il ne doit pas partager `localStorage` / IndexedDB avec les PWA d'enquête.

- En ligne : https://statbel-pivot.vercel.app/
- Carte des modules, flux de données, recettes (ajouter une option / un type de graphique / un module) : [`pivot/README.md`](pivot/README.md)

## Développement

```sh
npm ci
npm run lint     # ESLint « prudent » (tests + scripts Node)
npm test         # 5 suites headless (Chromium via Playwright), ~1 min 15 s en local
npm run build    # assemble dist-pivot/ (ce que publie Vercel)
```

## Déploiement (Vercel)

Projet `statbel-pivot` connecté à ce dépôt : Root Directory `.` · Framework *Other* · **Install Command** `true` · **Build Command** `node build-pivot-site.js` · **Output Directory** `dist-pivot` · production sur `main`. Le script de build vit dans `outils/` (et non `tools/`) car `.vercelignore` supprime `tools/` avant le build.

## Historique

Le code vient de `statbel-app` (dossiers `outils/pivot/` et `vendor/geo`). L'historique git antérieur à l'extraction reste dans ce dépôt-là ; les jalons de version sont repris dans [`CHANGELOG.md`](CHANGELOG.md).
