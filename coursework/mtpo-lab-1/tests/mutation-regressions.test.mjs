import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAvailableScan, findAvailableMasks} from '../src/slot-search.mjs';
import {baseInput, row} from '../test-data/search-fixtures.mjs';

const invalidInputs = [
  ['missing request', input => { delete input.request; }, /request must be objects/],
  ['blank sport', input => { input.request.sportId = ' '; }, /sportId is required/],
  ['missing bookings array', input => { delete input.bookings; }, /bookings must be an array/],
  ['closing before midnight boundary is exceeded', input => { input.openingHours.closesAt = 1470; }, /Invalid opening hours/],
  ['zero-length workday', input => { input.openingHours.closesAt = input.openingHours.opensAt; }, /Invalid opening hours/],
  ['zero court ID', input => { input.courts[0].id = 0; }, /Court IDs/],
  ['invalid court type', input => { input.courts[0] = null; }, /Court IDs/],
  ['empty sports', input => { input.courts[0].sports = []; }, /Invalid court sports/],
  ['duplicate sports', input => { input.courts[0].sports.push('badminton'); }, /Invalid court sports/],
  ['whitespace sport in catalog', input => { input.courts[0].sports.push(' '); }, /Invalid court sports/],
  ['booking without sport', input => { input.bookings.push({...row(480, 540), sportId: ''}); }, /Booking sportId/],
  ['short booking', input => { input.bookings.push(row(480, 510)); }, /Invalid booking interval/],
  ['negative interval start', input => { input.bookings.push(row(-30, 60)); }, /Invalid booking interval/],
  ['empty technical block', input => { input.blocks.push(row(480, 480)); }, /Invalid block interval/],
  ['invalid block status', input => { input.blocks.push({...row(480, 510), status: 'cancelled'}); }, /Invalid block status/],
  ['duplicate adjacency in reverse order', input => {
    input.courts.push({id: 2, sports: ['badminton']});
    input.adjacency.push(
      {courtA: 1, courtB: 2, allowedPairs: []},
      {courtA: 2, courtB: 1, allowedPairs: []},
    );
  }, /Duplicate adjacency/],
  ['wrong pair length', input => {
    input.courts.push({id: 2, sports: ['badminton']});
    input.adjacency.push({courtA: 1, courtB: 2, allowedPairs: [['badminton']]});
  }, /Invalid allowed sport pairs/],
];

for (const [name, find] of [['scan', findAvailableScan], ['masks', findAvailableMasks]]) {
  for (const [label, change, message] of invalidInputs) {
    test(`${name}: rejects ${label}`, () => {
      const input = baseInput();
      change(input);
      assert.throws(() => find(input), error => error instanceof TypeError && message.test(error.message));
    });
  }

  test(`${name}: a 30-minute technical block is valid and affects only its date`, () => {
    const input = baseInput();
    input.blocks = [row(480, 510), {...row(540, 600), date: '2026-11-26'}];
    assert.deepEqual(find(input), [
      {courtId: 1, start: '08:30', end: '09:30'},
      {courtId: 1, start: '09:00', end: '10:00'},
    ]);
  });
}

for (const [name, find] of [['scan', findAvailableScan], ['masks', findAvailableMasks]]) {
  test(`${name}: tomorrow can start at midnight`, () => {
    const input = baseInput();
    input.openingHours = {opensAt: 0, closesAt: 60};
    assert.deepEqual(find(input), [{courtId: 1, start: '00:00', end: '01:00'}]);
  });
}
