import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAvailableScan,findAvailableMasks} from '../src/slot-search.mjs';
import {baseInput,row} from '../test-data/search-fixtures.mjs';
// Added after the recorded TDD cycle, as a separate coverage-driven refinement.
for(const [name,find] of [['scan',findAvailableScan],['masks',findAvailableMasks]]){
 for(const date of [20261125,'25.11.2026','2026-11-31'])test(`${name}: reject malformed stored date ${date}`,()=>{
  const input=baseInput();input.bookings=[{...row(480,540),date}];
  assert.throws(()=>find(input),{name:'TypeError'});
 });
}
