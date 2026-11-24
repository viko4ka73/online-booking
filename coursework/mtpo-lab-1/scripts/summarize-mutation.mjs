import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';

const directory = 'reports/mutation';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(`${directory}/before.json`);
const final = read(`${directory}/raw.json`);
const file = 'src/slot-search.mjs';

const percentage = (numerator, denominator) => denominator ? 100 * numerator / denominator : null;
const key = mutant => JSON.stringify([mutant.mutatorName, mutant.location, mutant.replacement]);
assert.equal(baseline.files[file].source, final.files[file].source, 'Both runs must mutate the same source');
assert.deepEqual(
  baseline.files[file].mutants.map(key).sort(),
  final.files[file].mutants.map(key).sort(),
  'Both runs must have the same set of mutants',
);


function summarize(report, phase) {
  const coverage = read(`${directory}/coverage-${phase}/results.json`).coverage.files
    .find(entry => entry.path.endsWith('/' + file));
  const mutants = report.files[file].mutants;
  const counts = {};
  const operators = {};
  for (const mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
    operators[mutant.mutatorName] ??= {};
    const statuses = operators[mutant.mutatorName];
    statuses[mutant.status] = (statuses[mutant.status] ?? 0) + 1;
  }
  const valid = mutants.filter(m => ['Killed', 'Survived', 'Timeout', 'NoCoverage'].includes(m.status));
  const coveredLines = new Set(coverage.lines.filter(line => line.count > 0).map(line => line.line));
  const covered = valid.filter(m => coveredLines.has(m.location.start.line));
  return {
    total: mutants.length,
    counts,
    operators,
    msi: percentage(counts.Killed ?? 0, valid.length),
    mccByLine: percentage(covered.length, valid.length),
    coveredCodeMsiByLine: percentage(covered.filter(m => m.status === 'Killed').length, covered.length),
    lcc: coverage.coveredLinePercent,
    survivors: mutants.filter(m => m.status === 'Survived').map(({id, mutatorName, location, replacement}) =>
      ({id, mutatorName, location, replacement})),
  };
}

const before = summarize(baseline, 'before');
const after = summarize(final, 'after');
const finalMutants = new Map(final.files[file].mutants.map(m => [key(m), m]));
const improved = baseline.files[file].mutants.filter(m => m.status === 'Survived' && finalMutants.get(key(m))?.status === 'Killed')
  .map(({id, mutatorName, location, replacement}) => ({id, mutatorName, location, replacement}));
const summary = {file, before, after, improved, note: 'MSI counts only killed mutants. MCC and CoveredCodeMSI use independent V8 line coverage for each corresponding test suite, not per-mutant coverage from Stryker.'};
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log({before: before.counts, after: after.counts, newlyKilled: improved.length, msi: after.msi});
