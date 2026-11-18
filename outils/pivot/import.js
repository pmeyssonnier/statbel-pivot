/* Lecture locale des fichiers CSV et classeurs pour Statbel Pivot.
 * Aucune requête réseau, aucune persistance des données. */
(function (root) {
  'use strict';
  function decodeText(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
      return new TextDecoder('utf-16le').decode(buf);
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
      return new TextDecoder('utf-16be').decode(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  async function readFile(file, engine, xlsx) {
    const buf = await file.arrayBuffer();
    if (/\.(csv|txt|tsv)$/i.test(file.name))
      return [{ name: 'CSV', aoa: engine.parseCSV(decodeText(buf)) }];
    const wb = xlsx.read(buf, { type: 'array', cellDates: true });
    return wb.SheetNames.map(name => ({
      name, aoa: xlsx.utils.sheet_to_json(wb.Sheets[name], {
        header: 1, raw: true, defval: null, blankrows: false
      })
    }));
  }
  root.PivotImport = { decodeText, readFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PivotImport;
})(typeof globalThis !== 'undefined' ? globalThis : window);
