import {spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const file = 'src/slot-search.mjs';
const report = JSON.parse(readFileSync('reports/mutation/before.json', 'utf8'));
const {source, mutants} = report.files[file];
assert.equal(readFileSync(file, 'utf8'), source);
const line = source.split('\n').findIndex(text => text.startsWith('const overlap=')) + 1;
const selected = mutants.filter(mutant => mutant.location.start.line === line);
assert.ok(selected.length > 0);
const directory = mkdtempSync(join(tmpdir(), 'igraem-mutation-'));
try {
  for (const path of ['src', 'test-data', 'tests', 'package.json']) cpSync(path, join(directory, path), {recursive: true});
  const run = () => spawnSync(process.execPath, [
    '--test', '--test-name-pattern=^scan: TOUCH-BEFORE$', 'tests/algorithms.test.mjs',
  ], {cwd: directory, encoding: 'utf8', timeout: 5000});
  const baseline = run();
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.match(baseline.stdout, /tests 1\b/);
  const results = selected.map(({id, location, mutatorName, replacement}) => {
    assert.equal(location.end.line, line);
    const lines = source.split('\n');
    const original = lines[line - 1].slice(location.start.column - 1, location.end.column - 1);
    lines[line - 1] = lines[line - 1].slice(0, location.start.column - 1) + replacement + lines[line - 1].slice(location.end.column - 1);
    writeFileSync(join(directory, file), lines.join('\n'));
    const test = run();
    assert.ok(!test.error, test.error?.message);
    const status = test.status === 0 ? 'Survived' : /ERR_ASSERTION/.test(test.stdout) ? 'Killed' : 'Error';
    return {id, mutatorName, original, replacement, status};
  });
  writeFileSync('reports/mutation/overlap-single-test.json', JSON.stringify({test: 'scan: TOUCH-BEFORE', line, results}, null, 2) + '\n');
  console.log(results);
} finally {
  rmSync(directory, {recursive: true, force: true});
}
