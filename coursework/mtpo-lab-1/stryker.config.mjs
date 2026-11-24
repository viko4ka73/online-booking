const baseline = process.env.MTPO_MUTATION_BASELINE === '1';
const tests = ['tests/algorithms.test.mjs', 'tests/search-validation.test.mjs'];
if (!baseline) tests.push('tests/mutation-regressions.test.mjs');

export default {
  mutate: ['src/slot-search.mjs'],
  testRunner: 'command',
  commandRunner: {
    command: 'node --test ' + tests.join(' '),
  },
  coverageAnalysis: 'off',
  concurrency: 4,
  timeoutMS: 3000,
  reporters: ['progress', 'json', 'html'],
  jsonReporter: {fileName: baseline ? 'reports/mutation/before.json' : 'reports/mutation/raw.json'},
  htmlReporter: {fileName: baseline ? 'reports/mutation/before.html' : 'reports/mutation/index.html'},
};
