#!/usr/bin/env node
/*
 * build.js — assemble le SITE AUTONOME de l'outil « Tableaux croisés » (index.html à la racine).
 *
 * Pourquoi : l'outil ouvre des fichiers Excel / CSV quelconques. Servi sur la même adresse que les PWA, son code est de la même
 * ORIGINE qu'Interviews (même localStorage / IndexedDB, donc les contacts). Un second projet Vercel, sur une autre adresse, l'isole.
 *
 * Sortie : dist/ (ou --out <dossier>), avec la MÊME arborescence relative que le dépôt (la page lit `vendor/…`, `css/…` et `js/…`) :
 *   index.html (la page de l'outil, seul point d'entrée), robots.txt (aucune indexation), css/*.css, les .js de js/ (sous-dossiers compris),
 *   vendor/xlsx/xlsx.full.min.js, vendor/geo/geo-data.js.   Aucun service worker, aucun fichier des applications.
 *
 * Usage :  node build.js [--out <dossier>]      (Vercel : Build Command, Output Directory = dist)
 * Le script vit à la racine (pas dans tools/) : .vercelignore supprime tools/ avant le build Vercel.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const i = process.argv.indexOf('--out');
const OUT = path.resolve(i > 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(ROOT, 'dist'));

const FICHIERS = ['index.html', 'vendor/xlsx/xlsx.full.min.js', 'vendor/geo/geo-data.js'];
const DOSSIERS = [['css', f => f.endsWith('.css')], ['js', f => f.endsWith('.js')]];   // feuille de style et modules de l'outil (sous-dossiers compris)

function copier(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) throw new Error('fichier manquant : ' + rel);
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return fs.statSync(dst).size;
}

if (!OUT.startsWith(ROOT + path.sep) && !process.argv.includes('--out')) throw new Error('sortie hors du dépôt');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let n = 0, octets = 0;
FICHIERS.forEach(f => { octets += copier(f); n++; });
DOSSIERS.forEach(([dir, garde]) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(f => f.split(path.sep).join('/')).filter(garde).sort().forEach(f => { octets += copier(dir + '/' + f); n++; }));

fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

console.log('✓ Site du pivot : ' + (n + 1) + ' fichiers, ' + Math.round(octets / 1024) + ' Ko → ' + path.relative(ROOT, OUT));
