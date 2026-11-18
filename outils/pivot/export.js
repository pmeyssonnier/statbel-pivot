/* Exports du tableau croisé : sérialisation pure, utilisable dans Node et le navigateur. */
(function (root) {
  'use strict';
  // Neutralise les formules dans les tableurs (=, +, -, @), même précédées d'espaces ou de caractères de contrôle.
  const FORMULA = /^[\s\u0000-\u001f]*[=+\-@]/;
  const safeText = s => (FORMULA.test(s) ? "'" + s : s);
  function csvCell(value) {
    if (value == null) return '';
    let s = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
    if (typeof value === 'string') s = safeText(s);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(matrix) {
    return '\ufeff' + matrix.map(row => row.map(csvCell).join(';')).join('\r\n');
  }
  function toTSV(matrix) {
    return matrix.map(row => row.map(value =>
      value == null ? '' : typeof value === 'number'
        ? String(value).replace('.', ',')
        : safeText(String(value).replace(/[\t\r\n]+/g, ' '))
    ).join('\t')).join('\n');
  }
  function writeXLSX(matrix, filename, sheetName, xlsx) {
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(matrix), sheetName);
    xlsx.writeFile(wb, filename);
  }
  const api = { csvCell, safeText, toCSV, toTSV, writeXLSX };
  root.PivotExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
