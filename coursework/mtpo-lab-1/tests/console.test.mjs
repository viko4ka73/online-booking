import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {search, loadSchedule, saveResult} from '../src/console.mjs';
import {baseInput, row} from '../test-data/search-fixtures.mjs';

test('occupied preferred time returns the nearest free slot', () => {
  const input = baseInput();
  input.bookings = [row(480, 540)];
  const result = search(input, 'both', '08:00');
  assert.equal(result.algorithmsAgree, true);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.alternatives, [{courtId: 1, start: '09:00', end: '10:00', offsetMinutes: 60}]);
});

test('exact matches take priority and an invalid preferred time is rejected', () => {
  const result = search(baseInput(), 'scan', '08:30');
  assert.equal(result.algorithmsAgree, null);
  assert.deepEqual(result.matches, [{courtId: 1, start: '08:30', end: '09:30'}]);
  assert.deepEqual(result.alternatives, []);
  assert.throws(() => search(baseInput(), 'masks', '08:15'), /ЧЧ:ММ/);
});

test('nearest alternatives include up to three distinct times with all eligible courts', () => {
  const input = baseInput();
  input.openingHours.closesAt = 780;
  input.courts.push({id: 2, sports: ['badminton']});
  input.bookings.push(row(570, 630), {...row(570, 630), courtId: 2});
  const result = search(input, 'masks', '10:00');
  assert.deepEqual(result.alternatives.map(slot => [slot.start, slot.courtId]), [
    ['10:30', 1], ['10:30', 2], ['08:30', 1], ['08:30', 2], ['11:30', 1], ['11:30', 2],
  ]);
});

test('JSON round trip, malformed data and protection from overwriting', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'igraem-console-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const input = join(dir, 'input.json');
  const output = join(dir, 'output.json');
  await writeFile(input, '\uFEFF' + JSON.stringify(baseInput()));
  const result = search(await loadSchedule(input), 'both');
  await saveResult(output, result);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), result);
  await assert.rejects(saveResult(output, {}), {code: 'EEXIST'});
  await assert.rejects(loadSchedule(join(dir, 'missing.json')), {code: 'ENOENT'});
  await writeFile(input, '{oops');
  await assert.rejects(loadSchedule(input), /Некорректный JSON/);
});

test('interactive flow survives missing input and supports manual entry, search and save', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'igraem-console-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const output = join(dir, 'manual.json');
  const result = spawnSync(process.execPath, ['src/console.mjs'], {
    encoding: 'utf8',
    input: ['1', join(dir, 'missing.json'), '2', '2026-11-24T12:00:00+03:00', '2026-11-25',
      'badminton', '60', '08:00', '10:00', '08:30', '1:badminton', '', '', '', '',
      '4', '5', output, '0', ''].join('\n'),
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Ошибка:/);
  assert.match(result.stdout, /Результаты алгоритмов совпали/);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).matches[0].start, '08:30');
});

test('interactive JSON import runs both algorithms and handles EOF', () => {
  const result = spawnSync(process.execPath, ['src/console.mjs'], {
    encoding: 'utf8', input: '1\nexamples/input/03-shared-halls.json\n4\n', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /7.*14:00–15:00/);
});

test('algorithm selection invalidates the old result and changes the next search', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'igraem-console-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const output = join(dir, 'masks.json');
  const run = spawnSync(process.execPath, ['src/console.mjs'], {
    encoding: 'utf8',
    input: ['1', 'examples/input/05-preferred-time.json', '4', '3', '2', '5', '4',
      '5', output, '0', ''].join('\n'),
    timeout: 5000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Сначала выполните поиск/);
  assert.match(run.stdout, /Ближайшие варианты на эту дату/);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).algorithm, 'masks');
});
