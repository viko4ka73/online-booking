import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availableSlots,bookingLockKeys,lockBookingDays,incompatibleNeighborBookings} from '../src/booking.ts';
import {pool} from '../src/db.ts';
const NOW=new Date('2026-11-24T12:00:00+03:00');
const tomorrow='2026-11-25';
const interval=(start,end)=>({start_minute:start,end_minute:end});

function database(t,{hours=[{opens_at:480,closes_at:600}],bookings=[],blocks=[],neighbors=[],links=[]}={}){
 const query=t.mock.fn(async(sql,params)=>{
  if(sql.includes('FROM opening_hours'))return {rows:hours};
  if(sql.includes('FROM courts c JOIN court_adjacency'))return {rows:neighbors};
  if(sql.includes('FROM court_reservations WHERE'))return {rows:bookings};
  if(sql.includes('FROM court_time_blocks'))return {rows:blocks};
  if(sql.includes('SELECT court_a,court_b FROM court_adjacency'))return {rows:links};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  throw new Error(`Unexpected database query: ${sql}`);
 });
 return {query};
}
const cases=[
 ['AV01','hours absent',{hours:[]},tomorrow,60,[]],
 ['AV02','working window shorter than duration',{hours:[{opens_at:480,closes_at:540}]},tomorrow,120,[]],
 ['AV03','past and exactly current starts skipped',{hours:[{opens_at:690,closes_at:810}]},'2026-11-24',60,[{start:'12:30',end:'13:30'}]],
 ['AV04','overlap rejected, touching end allowed',{hours:[{opens_at:840,closes_at:960}],bookings:[interval(840,900)]},tomorrow,60,[{start:'15:00',end:'16:00'}]],
 ['AV05','thirty minute gap after booking',{hours:[{opens_at:930,closes_at:990}],bookings:[interval(840,900)]},tomorrow,60,[]],
 ['AV06','thirty minute gap before booking',{hours:[{opens_at:750,closes_at:810}],bookings:[interval(840,900)]},tomorrow,60,[]],
 ['AV07','incompatible neighbor overlaps',{hours:[{opens_at:840,closes_at:960}],neighbors:[interval(840,900)]},tomorrow,60,[{start:'15:00',end:'16:00'}]],
 ['AV08','technical block overlaps',{hours:[{opens_at:840,closes_at:960}],blocks:[interval(840,900)]},tomorrow,60,[{start:'15:00',end:'16:00'}]],
 ['AV09','free day',{hours:[{opens_at:480,closes_at:600}]},tomorrow,60,[{start:'08:00',end:'09:00'},{start:'08:30',end:'09:30'},{start:'09:00',end:'10:00'}]],
 ['AV10','touching before existing booking',{hours:[{opens_at:780,closes_at:840}],bookings:[interval(840,900)]},tomorrow,60,[{start:'13:00',end:'14:00'}]],
 ['BV-OPEN-BEFORE','before opening unavailable',{hours:[{opens_at:480,closes_at:1380}]},tomorrow,60,null,'07:30',false],
 ['BV-OPEN-AT','exact opening available',{hours:[{opens_at:480,closes_at:1380}]},tomorrow,60,null,'08:00',true],
 ['BV-CLOSE-AT','exact closing available',{hours:[{opens_at:480,closes_at:1380}]},tomorrow,60,null,'22:00',true],
 ['BV-CLOSE-AFTER','after closing unavailable',{hours:[{opens_at:480,closes_at:1380}]},tomorrow,60,null,'22:30',false],
 ...[['12:00',true],['12:30',false],['13:00',true],['13:30',false],['14:30',false],['15:00',true],['15:30',false],['16:00',true]].map(([start,exists],i)=>[`BV-GAP${i+1}`,'booking gap boundary',{hours:[{opens_at:480,closes_at:1380}],bookings:[interval(840,900)]},tomorrow,60,null,start,exists]),
 ['SQL-EMPTY-BOOKINGS','empty reservation query result; SQL filtering is outside this unit test',{},tomorrow,60,[{start:'08:00',end:'09:00'},{start:'08:30',end:'09:30'},{start:'09:00',end:'10:00'}]],
 ['SQL-EMPTY-NEIGHBORS','empty incompatible neighbor query result; compatibility SQL is outside this unit test',{},tomorrow,60,[{start:'08:00',end:'09:00'},{start:'08:30',end:'09:30'},{start:'09:00',end:'10:00'}]],
];
for(const [id,label,setup,date,duration,expected,start,exists] of cases){
 test(`${id} ${label}`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:NOW});
  const db=database(t,setup);
  const actual=await availableSlots(1,date,duration,db,null,'badminton');
  if(expected!==null)assert.deepEqual(actual,expected);
  else assert.equal(actual.some(slot=>slot.start===start),exists);
  assert.ok(db.query.mock.callCount()>=1);
 });
}
test('BV-TIME-SECOND future noon is available one second before noon',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-24T11:59:59+03:00')});
 const db=database(t,{hours:[{opens_at:720,closes_at:780}]});
 assert.deepEqual(await availableSlots(1,'2026-11-24',60,db),[{start:'12:00',end:'13:00'}]);
});
test('SQL receives the booking to exclude and chosen sport as parameters',async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});
 const db=database(t);
 const id='00000000-0000-4000-8000-000000000001';
 await availableSlots(7,tomorrow,60,db,id,'tennis');
 const own=db.query.mock.calls.find(call=>call.arguments[0].includes('FROM court_reservations WHERE'));
 const neighbor=db.query.mock.calls.find(call=>call.arguments[0].includes('FROM courts c JOIN court_adjacency'));
 assert.deepEqual(own.arguments[1],[7,tomorrow,id]);
 assert.deepEqual(neighbor.arguments[1],[[7],tomorrow,'tennis',id]);
 assert.match(own.arguments[0],/status = 'active'/);
 assert.match(neighbor.arguments[0],/NOT EXISTS/);
});
test('database rejection is propagated, not reported as free time',async t=>{
 const db={query:t.mock.fn(async()=>{throw new Error('database unavailable');})};
 await assert.rejects(availableSlots(1,tomorrow,60,db),/database unavailable/);
 assert.equal(db.query.mock.callCount(),1);
});
test('default pool is replaceable and cannot accidentally access a real database',async t=>{
 t.mock.method(pool,'query',async()=>({rows:[]}));
 assert.deepEqual(await availableSlots(1,tomorrow,60),[]);
 assert.equal(pool.query.mock.callCount(),1);
});
test('pool boundary fails closed without an explicit test double',async()=>{
 await assert.rejects(pool.query('SELECT 1'),/real PostgreSQL is disabled/);
});
test('lock keys are sorted, duplicate free and include both sides of adjacency',async t=>{
 const db=database(t,{links:[{court_a:6,court_b:7}]});
 assert.deepEqual(await bookingLockKeys(db,[{courtId:6,date:tomorrow},{courtId:7,date:tomorrow},{courtId:6,date:tomorrow}]),[
  `!adjacent-6-7|${tomorrow}`,`6|${tomorrow}`,`7|${tomorrow}`,
 ]);
});
test('unrelated links are not added to a target and empty target set is allowed',async t=>{
 const db=database(t,{links:[{court_a:6,court_b:7},{court_a:10,court_b:11}]});
 assert.deepEqual(await bookingLockKeys(db,[{courtId:1,date:tomorrow}]),[`1|${tomorrow}`]);
 assert.deepEqual(await bookingLockKeys(db,[]),[]);
});
test('locking takes shared configuration lock first then sorted day keys',async t=>{
 const db=database(t,{links:[{court_a:6,court_b:7}]});
 await lockBookingDays(db,[{courtId:7,date:tomorrow}]);
 const calls=db.query.mock.calls.map(call=>call.arguments);
 assert.match(calls[0][0],/pg_advisory_xact_lock_shared/);
 assert.deepEqual(calls.filter(([sql])=>sql.includes('pg_advisory_xact_lock(hash')).map(([,p])=>p[0]),[`!adjacent-6-7|${tomorrow}`,`7|${tomorrow}`]);
});
test('empty target set still coordinates configuration and takes no day locks',async t=>{
 const db=database(t);await lockBookingDays(db,[]);
 assert.equal(db.query.mock.callCount(),2);
});
test('neighbor query supports default sport and exclusion parameters',async t=>{
 const rows=[interval(840,900)];const db=database(t,{neighbors:rows});
 assert.deepEqual(await incompatibleNeighborBookings(db,[6],tomorrow),rows);
 assert.deepEqual(db.query.mock.calls[0].arguments[1],[[6],tomorrow,null,null]);
});
