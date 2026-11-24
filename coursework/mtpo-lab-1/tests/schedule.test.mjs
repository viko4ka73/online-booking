import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleError,formatTime,MAX_BOOKING_MINUTES} from '../src/booking.ts';

import {NOW,DATE_ERROR,originalCases} from '../test-data/schedule-cases.mjs';
import {mergeCases} from '../test-data/merge-cases.mjs';
const profile=process.env.LAB_CASE_PROFILE??'optimized';
if(!['original','optimized','equivalence','boundary','branch','statement'].includes(profile))throw new Error('Unknown test profile: '+profile);
const selectedCases=profile==='original'?originalCases:profile==='optimized'?mergeCases(originalCases).map(c=>[c.ids.join('+'),c.techniques.join(','),c.date,c.duration,c.expected]):originalCases.filter(c=>c[1]===profile);
for(const [id,technique,date,duration,expected] of selectedCases){
 test(`${id} [${technique}] date=${String(date)} duration=${String(duration)}`,()=>{
  let actual;
  assert.doesNotThrow(()=>{actual=scheduleError(date,duration,NOW);});
  assert.equal(actual,expected);
  if(expected!==null)assert.match(actual,/Выберите|Запись доступна/);
 });
}
if(profile==='original'||profile==='optimized'){
test('default current date is controlled by the test clock',t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});
 assert.equal(scheduleError('2026-11-24',60),null);
 assert.equal(scheduleError('2026-11-23',60),DATE_ERROR);
});
test('all supported duration choices are accepted',()=>{
 assert.equal(MAX_BOOKING_MINUTES,300);
 for(let minutes=60;minutes<=300;minutes+=30)assert.equal(scheduleError('2026-11-25',minutes,NOW),null);
});
test('formatTime preserves hours, leading zeroes and half hours',()=>{
 assert.deepEqual([0,30,480,570,1380,1440].map(formatTime),['00:00','00:30','08:00','09:30','23:00','24:00']);
});
}
