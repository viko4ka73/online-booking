import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('adjoining halls enforce symmetric sport compatibility, moves, waitlists and concurrent requests',async()=>{
 const bootstrap=new Pool({connectionString:process.env.DATABASE_URL});
 const schema='admin_booking_test_'+randomUUID().replaceAll('-','');await bootstrap.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
 const {pool,initializeDatabase}=await import('../src/db');let server:Server|undefined;
 try{
  await initializeDatabase();await initializeDatabase();
  const [{default:admin},{default:reservations},{default:schedule}]=await Promise.all([import('../src/routes/admin'),import('../src/routes/reservations'),import('../src/routes/schedule')]);
  const adminId=randomUUID(),userId=randomUUID(),email=userId+'@example.invalid';
  await pool.query("INSERT INTO app_users(id,name,email,password_hash,role,phone) VALUES($1,'Администратор',$2,'test-only','admin',NULL),($3,'Зарегистрированный игрок',$4,'test-only','user','+79998887766')",[adminId,adminId+'@example.invalid',userId,email]);
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/admin',admin);app.use('/api/reservations',reservations);app.use('/api/courts',schedule);
  server=await new Promise<Server>(done=>{const instance=app.listen(0,'127.0.0.1',()=>done(instance));});const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const api=async(path:string,method='GET',body?:unknown,id:string|null=adminId)=>{
   const cookie=id?'sport_booking_session='+jwt.sign({},process.env.JWT_SECRET!,{subject:id,expiresIn:'5m',issuer:'sport-booking-api',audience:'sport-booking-client'}):'';
   const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};
  };

  const future=new Date();future.setUTCDate(future.getUTCDate()+7);const date=future.toISOString().slice(0,10);

  const {availableSlots}=await import('../src/booking');
  const {waitlistOccupancy,isWaitlistOccupied}=await import('../src/waitlist');
  const halls=(await pool.query("SELECT id,resource_number FROM courts WHERE kind='whole' AND resource_number IN (5,6,7) ORDER BY resource_number")).rows;
  const id=(n:number)=>halls.find(h=>h.resource_number===n).id;
  const has=async(n:number,sport:string,start='10:00',day=date,exclude:string|null=null)=>(await availableSlots(id(n),day,60,pool,exclude,sport)).some(s=>s.start===start);
  const create=async(n:number,sport:string,start='10:00',day=date,asUser=false)=>{
   const core={courtId:id(n),sportId:sport,date:day,start,duration:60,players:sport==='tennis'?2:10,equipment:[]};
   const quote=await api('/api/courts/'+id(n)+'/quote','POST',core);assert.equal(quote.status,200,JSON.stringify(quote.data));
   return api(asUser?'/api/reservations':'/api/admin/reservations','POST',{...core,requestKey:randomUUID(),expectedTotal:quote.data.pricing.totalAmount,...(!asUser?{customer:{mode:'account',email}}:{})},asUser?userId:adminId);
  };
  const clear=()=>pool.query("TRUNCATE court_reservations CASCADE");
  const tennis=await create(6,'tennis');assert.equal(tennis.status,201,JSON.stringify(tennis.data));
  assert.equal(await has(7,'football'),false);assert.equal(await has(7,'tennis'),true);assert.equal(await has(5,'football'),true);
  assert.equal(await has(7,'football','09:00'),true);assert.equal(await has(7,'football','11:00'),true);assert.equal(await has(7,'football','09:30'),false);
  assert.equal((await api('/api/courts/'+id(7)+'/availability?date='+date+'&duration=60&sport=football')).data.slots.some((s:any)=>s.start==='10:00'),false);
  const busy=await waitlistOccupancy(pool,[id(7)],date,'football');assert.equal(isWaitlistOccupied([id(7)],busy,600,60),true);
  assert.equal(isWaitlistOccupied([id(7)],await waitlistOccupancy(pool,[id(7)],date,'tennis'),600,60),false);
  assert.equal((await create(7,'football')).status,409);assert.equal((await create(7,'tennis', '10:00',date,true)).status,201);
  await clear();
  const football=await create(7,'football');assert.equal(football.status,201);
  assert.equal(await has(6,'tennis'),false);assert.equal(await has(6,'football'),true);
  assert.equal((await create(6,'tennis','10:00',date,true)).status,409);assert.equal((await create(6,'football')).status,201);
  await clear();
  assert.equal((await create(6,'football')).status,201);assert.equal((await create(7,'basketball')).status,201);
  await clear();
  // Moving between the two halls excludes the original booking from both calendars.
  const own=await create(6,'tennis','10:00',date,true);assert.equal(own.status,201);
  const path='/api/reservations/'+own.data.booking.id;
  const move={courtId:id(7),date,start:'10:00',duration:60,version:1};
  assert.equal((await api(path+'/availability?date='+date+'&duration=60&courtId='+id(7),'GET',undefined,userId)).data.slots.some((s:any)=>s.start==='10:00'),true);
  const q=await api(path+'/quote','POST',move,userId);assert.equal(q.status,200);
  assert.equal((await api(path+'/reschedule','PATCH',{...move,expectedTotal:q.data.pricing.totalAmount},userId)).status,200);
  assert.equal((await api(path+'/cancel','POST',{version:2},userId)).status,200);
  assert.equal(await has(6,'football'),true);
  // A conflicting neighbor also prevents moving an existing booking into that interval.
  const original=await create(6,'tennis','14:00',date,true);assert.equal(original.status,201);
  assert.equal((await create(7,'football','10:00')).status,201);
  const movePath='/api/reservations/'+original.data.booking.id;
  const blockedMove={courtId:id(6),date,start:'10:00',duration:60,version:1};
  const mq=await api(movePath+'/quote','POST',blockedMove,userId);assert.equal(mq.status,200);
  assert.equal((await api(movePath+'/reschedule','PATCH',{...blockedMove,expectedTotal:mq.data.pricing.totalAmount},userId)).status,409);
  await clear();
  // Both create endpoints and the editor persist configurable symmetric relations.
  const directory=async()=>(await api('/api/admin/courts')).data;
  const patch=async(courtId:number,adjacency:unknown)=>{
   const c=(await directory()).courts.find((c:any)=>c.id===courtId);
   return api('/api/admin/courts/'+courtId,'PATCH',{name:c.name,sportId:c.sportId,hallId:c.hallId,kind:c.kind,image:c.image,capacity:c.capacity,description:c.description,dimensions:c.dimensions,surface:c.surface,equipmentDescription:c.equipmentDescription,version:c.version,adjacency});
  };
  const initial=(await directory()).courts.find((c:any)=>c.id===id(6));
  assert.equal(initial.adjacency[0].courtId,id(7));
  assert.equal((await patch(id(6),[{courtId:id(6),allowedPairs:[]}])).status,400);
  assert.equal((await patch(id(6),[{courtId:id(7),allowedPairs:[['unknown','tennis']]}])).status,400);
  assert.equal((await patch(id(6),[{courtId:999999,allowedPairs:[]}])).status,400);
  assert.equal((await patch(id(6),[{courtId:id(7),allowedPairs:[]},{courtId:id(7),allowedPairs:[]}])).status,400);
  const saved=await patch(id(6),[{courtId:id(7),allowedPairs:[['tennis','football']]}]);assert.equal(saved.status,200,JSON.stringify(saved.data));
  const reverse=(await directory()).courts.find((c:any)=>c.id===id(7));assert.deepEqual(reverse.adjacency[0].allowedPairs,[['football','tennis']]);
  assert.equal((await create(6,'tennis')).status,201);assert.equal(await has(7,'football'),true);assert.equal(await has(7,'tennis'),false);
  assert.equal((await create(7,'football')).status,201);
  const tightening=await patch(id(6),[{courtId:id(7),allowedPairs:[]}]);assert.equal(tightening.status,400);assert.match(tightening.data.error,/конфликт/);
  // Turning off from the other end removes the relation for both objects.
  assert.equal((await patch(id(7),[])).status,200);assert.deepEqual((await directory()).courts.find((c:any)=>c.id===id(6)).adjacency,[]);
  await clear();
  const {courtDraftTemplate}=await import('../../client/src/lib/courtTemplates');
  for(const sportId of ['badminton','football']){
   const d=await directory(),draft=courtDraftTemplate(d,sportId);
   const core={name:draft.name,image:draft.image,capacity:draft.capacity,description:draft.description,dimensions:draft.dimensions,surface:draft.surface,equipmentDescription:draft.equipmentDescription,requestKey:randomUUID(),resourceNumber:draft.resourceNumber,adjacency:[{courtId:id(7),allowedPairs:[[sportId,'tennis']]}]};
   const body=draft.kind==='whole'?{...core,rentalMode:'whole',sportIds:draft.sportIds}:{...core,kind:draft.kind,sportId,hallId:draft.hallId,vip:draft.vip};
   const endpoint=draft.kind==='whole'?'/api/admin/halls':'/api/admin/courts';
   const result=await api(endpoint,'POST',body);assert.equal(result.status,201,JSON.stringify(result.data));assert.deepEqual(result.data.court.adjacency[0].allowedPairs,[[sportId,'tennis']]);
   assert.equal((await api(endpoint,'POST',body)).status,200);
   assert.equal((await create(7,'tennis')).status,201);
   assert.ok((await availableSlots(result.data.court.id,date,60,pool,null,sportId)).some(slot=>slot.start==='10:00'));
   await clear();
  }
  assert.equal((await patch(id(6),initial.adjacency)).status,200);
  const raced=await Promise.all([create(6,'tennis'),create(7,'football','10:00',date,true)]);
  assert.deepEqual(raced.map(r=>r.status).sort(),[201,409]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM court_reservations WHERE status='active'")).rows[0].n,1);
 }finally{
  if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
  await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
 }
});
