// Lint « prudent » (bugs uniquement) des tests Node. Les callbacks p.evaluate(() => …) s'exécutent DANS le navigateur et
// référencent les globales de l'outil : no-undef y serait du bruit, on le coupe ; on garde la détection d'inutilisés.
// Les scripts de l'outil (js/**) sont des scripts classiques à globales partagées : non lintés.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/**', '**/*.min.js', 'node_modules/**', 'dist-pivot/**', 'eslint.config.mjs'] },
  js.configs.recommended,
  {
    files: ['tests/**/*.js', 'tools/**/*.js', 'build-pivot-site.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  }
];
