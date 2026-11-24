import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable, PassThrough} from 'node:stream';
import {runMenu, search} from '../src/console.mjs';
import {baseInput} from '../test-data/search-fixtures.mjs';

test('assumeTrue: Moscow time zone is available before checking the clock', t => {
  let supported;
  try {
    supported = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Moscow'}).resolvedOptions().timeZone === 'Europe/Moscow';
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    supported = false;
  }
  if (!supported) return t.skip('The runtime has no Europe/Moscow time zone');
  const input = baseInput();
  input.now = '2026-11-25T05:00:00Z';
  assert.deepEqual(search(input).slots.map(slot => slot.start), ['08:30', '09:00']);
});

test('assumeFalse: an opt-out can disable the console stream scenario', async t => {
  if (process.env.MTPO_SKIP_CONSOLE_STREAM === '1') return t.skip('Console stream scenario is disabled');
  const output = new PassThrough();
  let transcript = '';
  output.on('data', chunk => { transcript += chunk; });

  // Spy: preserve the real write method and inspect how the menu used it.
  const write = t.mock.method(output, 'write');
  await runMenu(Readable.from(['6\n', '0\n']), output);
  assert.ok(write.mock.calls.some(({arguments: args}) => args[0].includes('Коды видов спорта')));
  assert.match(transcript, /СПРАВКА|Справка/);
  assert.doesNotMatch(transcript, /Ошибка:/);
});
