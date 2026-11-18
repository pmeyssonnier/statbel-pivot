/*
 * Petit serveur de fichiers statiques pour les tests headless.
 *
 * Les suites chargent la page par http, au plus proche des conditions réelles (Vercel) :
 * ce serveur sert la racine du dépôt (ou un autre dossier) sur un port éphémère.
 *
 * Usage :
 *   const { serve } = require('./_serve');
 *   const srv = await serve();               // { url, close } — racine du dépôt
 *   const srv2 = await serve('/chemin/dist'); // ou un autre dossier
 *   await page.goto(srv.url + '/index.html');
 *   ...
 *   await srv.close();
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEPOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serve(racine) {
  const ROOT = racine ? path.resolve(racine) : DEPOT;   // racine du dépôt par défaut ; un dossier (ex. le site du pivot) sinon
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' ) rel = '/index.html';
    // empêche toute sortie de la racine (../)
    const abs = path.normalize(path.join(ROOT, rel));
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: 'http://127.0.0.1:' + port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { serve };
