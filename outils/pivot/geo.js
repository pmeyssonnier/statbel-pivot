/* Localisation hors-ligne pour la carte à bulles : retrouve les coordonnées d'un lieu à partir de son nom
 * (pays en fr/nl/en/de ou code ISO, province / région / arrondissement belges, commune belge — nom fr/nl ou code NIS —,
 * grandes villes du monde). Les données (vendor/geo/geo-data.js, ~280 Ko) ne sont chargées que si on demande une carte.
 * Exposé : globalThis.PivotGeo / module.exports. */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PivotEngine;
  const norm = E.normName;
  // groupes de noms équivalents (français / néerlandais / anglais) pour les communes belges : un seul doit exister dans les données
  const SAME = [
    ['Brussels', 'Bruxelles', 'Brussel', 'Bruxelles-Ville', 'Ville de Bruxelles', 'Brussel-Stad'], ['Antwerpen', 'Anvers', 'Antwerp'], ['Gent', 'Gand', 'Ghent'], ['Brugge', 'Bruges'], ['Leuven', 'Louvain'],
    ['Mechelen', 'Malines'], ['Oostende', 'Ostende'], ['Kortrijk', 'Courtrai'], ['Aalst', 'Alost'], ['Dendermonde', 'Termonde'], ['Oudenaarde', 'Audenarde'], ['Tienen', 'Tirlemont'], ['Halle', 'Hal'],
    ['Ieper', 'Ypres'], ['Veurne', 'Furnes'], ['Diksmuide', 'Dixmude'], ['Roeselare', 'Roulers'], ['Ronse', 'Renaix'], ['Geraardsbergen', 'Grammont'], ['Sint-Truiden', 'Saint-Trond'], ['Tongeren', 'Tongres'],
    ['Lier', 'Lierre'], ['Vilvoorde', 'Vilvorde'], ['Liège', 'Luik', 'Lüttich'], ['Mons', 'Bergen'], ['Tournai', 'Doornik'], ['Namur', 'Namen'], ['Arlon', 'Aarlen'], ['Mouscron', 'Moeskroen'],
    ['Bastogne', 'Bastenaken'], ['Huy', 'Hoei'], ['Waremme', 'Borgworm'], ['Jodoigne', 'Geldenaken'], ['Braine-l\'Alleud', 'Eigenbrakel'], ['Soignies', 'Zinnik'], ['Ath', 'Aat'], ['Enghien', 'Edingen'],
    ['Lessines', 'Lessen'], ['Genappe', 'Genepiën'], ['Tubize', 'Tubeke'], ['Nivelles', 'Nijvel'], ['Wavre', 'Waver'], ['Ixelles', 'Elsene'], ['Schaerbeek', 'Schaarbeek'],
    ['Woluwe-Saint-Lambert', 'Sint-Lambrechts-Woluwe'], ['Woluwe-Saint-Pierre', 'Sint-Pieters-Woluwe'], ['Saint-Gilles', 'Sint-Gillis'], ['Forest', 'Vorst'], ['Uccle', 'Ukkel'],
    ['Molenbeek-Saint-Jean', 'Sint-Jans-Molenbeek'], ['Auderghem', 'Oudergem'], ['Watermael-Boitsfort', 'Watermaal-Bosvoorde'], ['Saint-Josse-ten-Noode', 'Sint-Joost-ten-Node'],
    ['Berchem-Sainte-Agathe', 'Sint-Agatha-Berchem'], ['Rhode-Saint-Genèse', 'Sint-Genesius-Rode'], ['La Hulpe', 'Terhulpen'], ['Saint-Vith', 'Sankt Vith'], ['La Calamine', 'Kelmis']
  ];
  const CITY_SAME = [['New York City', 'New York'], ['London', 'Londres'], ['Moscow', 'Moscou'], ['Beijing', 'Pékin'], ['Cologne', 'Köln'], ['Munich', 'München'], ['Lisbon', 'Lisbonne'], ['Prague', 'Praha'], ['Vienna', 'Vienne', 'Wien'], ['Geneva', 'Genève'],
    ['Milan', 'Milano'], ['Naples', 'Napoli'], ['Turin', 'Torino'], ['Florence', 'Firenze'], ['Venice', 'Venise'], ['Seville', 'Séville'], ['Copenhagen', 'Copenhague'], ['Warsaw', 'Varsovie'], ['Athens', 'Athènes'], ['Cairo', 'Le Caire'], ['Algiers', 'Alger'],
    ['Kyiv', 'Kiev'], ['Saint Petersburg', 'Saint-Pétersbourg'], ['Hanover', 'Hannover'], ['The Hague', 'La Haye', 'Den Haag'], ['Rome', 'Roma'], ['Brasília', 'Brasilia'], ['Mumbai', 'Bombay'], ['Edinburgh', 'Édimbourg'], ['Bucharest', 'Bucarest'], ['Belgrade', 'Beograd']];
  const KIND = { arrondissement: 'arr', province: 'prov', provincie: 'prov', region: 'reg', regio: 'reg', commune: 'commune', gemeente: 'commune', ville: 'commune', stad: 'commune' };
  const PREFIX = /^(arrondissement|province|provincie|region|regio|commune|gemeente|ville|stad)(?: (?:administratif|de|du|d|van|of|des|la|le))* (.+)$/;
  const KIND_LABEL = { commune: 'commune', nis: 'commune (NIS)', arr: 'arrondissement', prov: 'province', reg: 'région', country: 'pays', city: 'ville' };

  let data = null, idx = null;
  const better = (m, k, p) => { const o = m.get(k); if (!o || (p.pop || 0) > (o.pop || 0)) m.set(k, p); };

  function build(d) {
    const ix = { commune: new Map(), nis: new Map(), arr: new Map(), prov: new Map(), reg: new Map(), country: new Map(), city: new Map() };
    d.places.forEach(([name, cc, lat, lon, pop, nis]) => {
      const p = { name, lat, lon, pop };
      if (cc === 'BE') { better(ix.commune, norm(name), p); if (nis) better(ix.nis, String(nis), p); } else better(ix.city, norm(name), p);
    });
    CITY_SAME.forEach(g => { const have = g.map(n => ix.city.get(norm(n))).find(Boolean); if (have) g.forEach(n => { if (!ix.city.has(norm(n))) ix.city.set(norm(n), have); }); });
    SAME.forEach(g => {   // noms français / néerlandais d'une même commune belge
      const have = g.map(n => ix.commune.get(norm(n))).find(Boolean);
      if (have) g.forEach(n => { if (!ix.commune.has(norm(n))) ix.commune.set(norm(n), have); });
    });
    const addNames = (map, list, kind) => list.forEach(([, names, lat, lon]) => names.split('|').forEach(n => {
      const p = { name: names.split('|')[0], lat, lon, pop: 0 }, k = norm(n), m = PREFIX.exec(k);
      map.set(k, p); if (m) map.set(m[2], p);
    }));
    addNames(ix.arr, d.belgium.arr); addNames(ix.prov, d.belgium.prov); addNames(ix.reg, d.belgium.reg);
    d.countries.forEach(([a2, a3, en, fr, nl, de, lat, lon]) => {
      const p = { name: fr || en, lat, lon, pop: 0 };
      [en, fr, nl, de].forEach(n => { if (n) ix.country.set(norm(n), p); });
      ix.country.set(norm(a2), p); ix.country.set(norm(a3), p);
    });
    return ix;
  }

  function use(d) { data = d; idx = d ? build(d) : null; return api; }
  const ready = () => !!idx;
  function load(cb) {
    if (ready()) { cb(api); return; }
    if (root.PIVOT_GEO_DATA) { use(root.PIVOT_GEO_DATA); cb(api); return; }
    if (typeof document === 'undefined') { cb(null); return; }
    const s = document.createElement('script');
    s.src = '../vendor/geo/geo-data.js';
    s.onload = () => { if (root.PIVOT_GEO_DATA) { use(root.PIVOT_GEO_DATA); cb(api); } else cb(null); };
    s.onerror = () => cb(null);
    document.head.appendChild(s);
  }

  // label : nom du lieu ; hint : nom de la dimension (« Province », « Pays », « Commune »…) pour trancher les homonymes
  function locate(label, hint) {
    if (!idx) return null;
    const raw = String(label == null ? '' : label).trim();
    if (!raw) return null;
    if (/^\d{5}$/.test(raw)) { const p = idx.nis.get(raw); if (p) return { lat: p.lat, lon: p.lon, kind: KIND_LABEL.nis, name: p.name }; }
    let n = norm(raw), pref = null;
    const m = PREFIX.exec(n);
    if (m) { pref = KIND[m[1]]; n = m[2]; }
    const h = norm(hint || '');
    if (!pref) pref = /arrond/.test(h) ? 'arr' : /provinc/.test(h) ? 'prov' : /(^| )(region|regio|gewest)/.test(h) ? 'reg' : /(^| )(pays|country|land|nation)/.test(h) ? 'country' : /(commune|gemeente|ville|city|stad|localit|municip)/.test(h) ? 'commune' : null;
    let order = ['commune', 'arr', 'prov', 'reg', 'country', 'city'];
    if (!pref && n === 'luxembourg') order = ['country', 'prov'];   // le plus probable sans indication
    if (pref) order = [pref].concat(order.filter(k => k !== pref));
    for (const k of order) {
      const p = idx[k].get(n);
      if (p) return { lat: p.lat, lon: p.lon, kind: KIND_LABEL[k], name: p.name };
    }
    return null;
  }

  const api = { use, load, ready, locate, get data() { return data; } };
  root.PivotGeo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
