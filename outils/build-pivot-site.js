#!/usr/bin/env node
/*
 * outils/build-pivot-site.js — assemble le SITE AUTONOME de l'outil « Tableaux croisés » (outils/statbel_pivot.html).
 *
 * Pourquoi : l'outil ouvre des fichiers Excel / CSV quelconques. Servi sur la même adresse que les PWA, son code est de la même
 * ORIGINE qu'Interviews (même localStorage / IndexedDB, donc les contacts). Un second projet Vercel, sur une autre adresse, l'isole.
 *
 * Sortie : dist-pivot/ (ou --out <dossier>), avec la MÊME arborescence relative que le dépôt (la page lit `../vendor/…`) :
 *   index.html (redirige vers la page), robots.txt (aucune indexation), outils/statbel_pivot.html, outils/pivot/*.js,
 *   vendor/xlsx/xlsx.full.min.js, vendor/geo/geo-data.js.   Aucun service worker, aucun fichier des applications.
 *
 * Usage :  node outils/build-pivot-site.js [--out <dossier>]      (Vercel : Build Command, Output Directory = dist-pivot)
 * Le script vit dans outils/ (pas tools/) : .vercelignore supprime tools/ avant le build Vercel.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const i = process.argv.indexOf('--out');
const OUT = path.resolve(i > 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(ROOT, 'dist-pivot'));

const FICHIERS = ['outils/statbel_pivot.html', 'vendor/xlsx/xlsx.full.min.js', 'vendor/geo/geo-data.js'];
const DOSSIERS = [['outils/pivot', f => f.endsWith('.js')]];   // modules du pivot (la README reste dans le dépôt)

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
DOSSIERS.forEach(([dir, garde]) => fs.readdirSync(path.join(ROOT, dir)).filter(garde).sort().forEach(f => { octets += copier(dir + '/' + f); n++; }));

fs.writeFileSync(path.join(OUT, 'index.html'),
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
  '<meta http-equiv="refresh" content="0; url=outils/statbel_pivot.html"><title>Tableaux croisés</title></head>' +
  '<body><p><a href="outils/statbel_pivot.html">Tableaux croisés</a></p></body></html>\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

console.log('✓ Site du pivot : ' + (n + 2) + ' fichiers, ' + Math.round(octets / 1024) + ' Ko → ' + path.relative(ROOT, OUT));
