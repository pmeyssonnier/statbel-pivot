# CLAUDE.md — statbel-pivot

Outil **statique, 100 % hors-ligne** de tableaux croisés dynamiques (Excel/CSV), publié par **Vercel** sur sa propre origine. Aucune donnée personnelle versionnée ni envoyée ; ouvrable en `file://`.

> Les conventions transversales (identité, ton, rigueur, données perso, environnement machine) vivent dans le `~/.claude/CLAUDE.md` **global**.

## Architecture
- `index.html` : page unique ; JS en **scripts classiques** `pivot/*.js` (globales partagées, ordre d'exécution préservé par le chargeur inline de la page). `engine.js` = moteur pur ; `app.js` = cœur UI ; `app-*.js` par thème ; `app-init-*.js` démarrage.
- **Libs vendorisées, jamais de CDN** : `vendor/xlsx` (SheetJS), `vendor/geo` (généré par `tools/gen-geo-data.js`). CSP en `<meta>` dans la page.
- `build-pivot-site.js` → `dist-pivot/` (même arborescence relative : la page lit `vendor/…`). Doit rester hors de `tools/` (supprimé par `.vercelignore` avant le build Vercel).
- Détail des modules et recettes : `pivot/README.md`.

## Invariants
- **Version** : `PIVOT_VERSION` (`pivot/app.js`) + ligne « Pivot x.y.z » du `CHANGELOG.md` (testé). Jalons majeurs ; mineur = nouveau jalon, patch = correctif ; ne pas numéroter chaque PR ; tag `pivot-vX.Y.Z` sur les merges.
- Nombres belges : « 1.234 » = 1234. i18n : fr/nl/en/de via les chaînes de la page.
- `.gitignore` : aucun fichier Excel/CSV versionné.

## Tests et CI
- `npm test` : 5 suites (`tests/pivot-tool-*.test.js`), ~1 min 15 s local, ~1 min 40 s au CI. `npm run lint` avant tout push (0 erreur, 0 avertissement).
- Tests sensibles à la date : épingler l'horloge (`context.clock.setFixedTime`).
- Chaque push sur `main` déclenche un déploiement Vercel (`vercel.json` : les autres branches non ; `ignoreCommand` saute les changements hors-ligne `*.md`, `tests/`, `tools/`, `.github/`). Grouper les merges.

## Flux git
Branche de travail → PR → merge par le mainteneur. Pas de push direct sur `main`.
