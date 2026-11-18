# Données géographiques hors-ligne (carte à bulles de l'outil pivot)

`geo-data.js` est **généré** par `node tools/gen-geo-data.js <dossier-avec-node_modules>` (voir l'en-tête du script pour
les paquets npm à installer hors du dépôt) ; il n'est chargé par `outils/statbel_pivot.html` que lorsqu'on choisit
« Carte à bulles ». Contenu : contours des pays (monde 110 m + détail Europe du Nord-Ouest 10 m simplifié), pays avec noms
fr/nl/en/de, communes belges (nom + code NIS), provinces / régions / arrondissements belges (centroïdes), grandes villes du monde.

| Données | Source | Licence |
|---|---|---|
| Contours des pays | Natural Earth via `world-atlas` | domaine public (Natural Earth) / ISC |
| Noms de pays, codes ISO | `i18n-iso-countries` | MIT |
| Lieux (communes belges, villes ≥ 150 000 hab.) | GeoNames via `all-the-cities` | CC BY 4.0 — attribution « Lieux : GeoNames » affichée sur la carte |
