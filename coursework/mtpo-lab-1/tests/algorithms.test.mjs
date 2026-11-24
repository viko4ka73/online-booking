import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAvailableScan,findAvailableMasks} from '../src/slot-search.mjs';
import {baseInput,makeCase,searchCases,generatedInput,fixedNow} from '../test-data/search-fixtures.mjs';
import {availableSlots} from '../src/booking.ts';
for(const [name,find] of [['scan',findAvailableScan],['masks',findAvailableMasks]]){
 for(const [id,input,expected] of searchCases)test(`${name}: ${id}`,()=>{
  const before=structuredClone(input);const result=find(input);
  assert.deepEqual(result,expected);assert.deepEqual(input,before,'input must not be changed');
 });
 const invalid=[
  ['INVALID-DATE',x=>x.request.date='2026-11-31'],['PAST-DATE',x=>x.request.date='2026-11-23'],['HORIZON',x=>x.request.date='2027-01-04'],
  ['SHORT',x=>x.request.duration=30],['LONG',x=>x.request.duration=330],['FRACTION',x=>x.request.duration=90.5],['STEP',x=>x.request.duration=75],['TYPE',x=>x.request.duration='120'],
  ['BAD-CLOCK',x=>x.now='yesterday'],['CLOCK-ZONE-MISSING',x=>x.now='2026-11-24T12:00:00'],['BAD-HOURS',x=>x.openingHours.closesAt=470],['HOURS-STEP',x=>x.openingHours.opensAt=481],
  ['DUPLICATE-ID',x=>x.courts.push(x.courts[0])],['UNKNOWN-RESOURCE',x=>x.bookings.push({courtId:999,date:'2026-11-25',startMinute:480,endMinute:540,sportId:'tennis',status:'active'})],
  ['BAD-INTERVAL',x=>x.blocks.push({courtId:1,date:'2026-11-25',startMinute:500,endMinute:540,status:'active'})],['BAD-STATUS',x=>x.bookings.push({courtId:1,date:'2026-11-25',startMinute:480,endMinute:540,sportId:'tennis',status:'oops'})],
  ['SELF-ADJACENCY',x=>x.adjacency.push({courtA:1,courtB:1,allowedPairs:[]})],['UNKNOWN-NEIGHBOR',x=>x.adjacency.push({courtA:1,courtB:999,allowedPairs:[]})],
 ];
 for(const [id,change] of invalid)test(`${name}: reject ${id}`,()=>assert.throws(()=>find(makeCase(change)),{name:'TypeError'}));
 test(`${name}: reject null input`,()=>assert.throws(()=>find(null),{name:'TypeError'}));
}
test('two algorithms agree on 200 deterministic generated schedules',()=>{
 for(let seed=1;seed<=200;seed++)assert.deepEqual(findAvailableMasks(generatedInput(seed)),findAvailableScan(generatedInput(seed)),`seed=${seed}`);
});
test('both algorithms agree with the diploma module on 30 prepared schedules',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(fixedNow)});
 for(let seed=1;seed<=30;seed++){
  const input=generatedInput(seed);
  // Independent integration boundary: SQL results are prepared here from the graph.
  const expected=[];
  for(const court of input.courts.filter(c=>c.sports.includes(input.request.sportId)).sort((a,b)=>a.id-b.id)){
   const bookings=input.bookings.filter(b=>b.status==='active'&&b.date===input.request.date);
   const neighbors=bookings.filter(b=>input.adjacency.some(link=>{
    if(link.courtA===court.id&&link.courtB===b.courtId)return !link.allowedPairs.some(([a,z])=>a===input.request.sportId&&z===b.sportId);
    if(link.courtB===court.id&&link.courtA===b.courtId)return !link.allowedPairs.some(([a,z])=>a===b.sportId&&z===input.request.sportId);
    return false;
   }));
   const db={async query(sql){
    if(sql.includes('opening_hours'))return {rows:[{opens_at:input.openingHours.opensAt,closes_at:input.openingHours.closesAt}]};
    const rows=sql.includes('FROM courts c JOIN court_adjacency')?neighbors:sql.includes('court_time_blocks')?input.blocks.filter(b=>b.courtId===court.id&&b.status==='active'&&b.date===input.request.date):bookings.filter(b=>b.courtId===court.id);
    return {rows:rows.map(b=>({start_minute:b.startMinute,end_minute:b.endMinute}))};
   }};
   expected.push(...(await availableSlots(court.id,input.request.date,input.request.duration,db,null,input.request.sportId)).map(s=>({courtId:court.id,...s})));
  }
  assert.deepEqual(findAvailableScan(input),expected,`scan seed=${seed}`);assert.deepEqual(findAvailableMasks(input),expected,`masks seed=${seed}`);
 }
});
