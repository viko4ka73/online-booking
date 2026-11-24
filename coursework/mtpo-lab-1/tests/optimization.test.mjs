import {test} from 'node:test';
import assert from 'node:assert/strict';
import {originalCases} from '../test-data/schedule-cases.mjs';
import {caseKey,mergeCases} from '../test-data/merge-cases.mjs';
test('merging preserves every test ID, expected result and technique',()=>{
 const merged=mergeCases(originalCases);
 assert.ok(merged.length<originalCases.length);
 assert.deepEqual(merged.flatMap(c=>c.ids).sort(),originalCases.map(c=>c[0]).sort());
 for(const [id,technique,date,duration,expected] of originalCases){
  const target=merged.find(c=>c.ids.includes(id));
  assert.ok(target.techniques.includes(technique));assert.equal(caseKey(target.date,target.duration),caseKey(date,duration));assert.equal(target.expected,expected);
 }
});
test('type-aware keys do not merge null, undefined, string, NaN and infinities',()=>{
 const values=[null,undefined,'120',120,NaN,Infinity,-Infinity,0,-0];
 assert.equal(new Set(values.map(v=>caseKey('2026-11-25',v))).size,values.length);
});
test('contradictory expectations are rejected',()=>{
 assert.throws(()=>mergeCases([['A','statement','2026-11-25',60,null],['B','branch','2026-11-25',60,'error']]),/Conflicting/);
});
