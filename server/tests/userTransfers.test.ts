import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('users move their bookings only within the original sport while retaining ownership, availability and the 48-hour rule',async()=>{
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
  const core={courtId:1,sportId:'badminton',date,start:'10:00',duration:60,players:2,equipment:[{id:'racket',quantity:1}]};
  const q=await api('/api/courts/1/quote','POST',core);assert.equal(q.status,200);
  const created=await api('/api/admin/reservations','POST',{...core,requestKey:randomUUID(),expectedTotal:q.data.pricing.totalAmount,customer:{mode:'account',email}});assert.equal(created.status,201);
  const booking=created.data.booking,path='/api/reservations/'+booking.id;
  assert.equal((await api(path+'/courts','GET',undefined,null)).status,401);
  assert.equal((await api(path+'/courts','GET',undefined,adminId)).status,404);
  const candidates=await api(path+'/courts','GET',undefined,userId);assert.equal(candidates.status,200,JSON.stringify(candidates.data));
  const allowed=(await pool.query("SELECT court_id FROM court_sport_options WHERE sport_id='badminton'")).rows.map(r=>r.court_id);
  assert.deepEqual(candidates.data.courts.map((c:any)=>c.id).sort((a:number,b:number)=>a-b),allowed.sort((a:number,b:number)=>a-b));
  const other=candidates.data.courts.find((c:any)=>c.id!==1).id;
  const table=(await pool.query("SELECT court_id FROM court_sport_options WHERE sport_id='table-tennis' LIMIT 1")).rows[0].court_id;
  const move={courtId:other,date,start:'10:00',duration:60,version:1,expectedTotal:q.data.pricing.totalAmount};
  const unchanged=async()=>assert.equal((await pool.query('SELECT court_id FROM court_reservations WHERE id=$1',[booking.id])).rows[0].court_id,1);
  assert.equal((await api(path+'/availability?date='+date+'&duration=60&courtId='+table,'GET',undefined,userId)).status,409);
  assert.equal((await api(path+'/quote','POST',{...move,courtId:table},userId)).status,409);
  assert.equal((await api(path+'/reschedule','PATCH',{...move,courtId:table,sportId:'table-tennis'},userId)).status,409);
  await unchanged();
  const block=await api('/api/admin/blocks','POST',{courtId:other,date,start:'10:00',end:'11:00',reason:'Test repair',requestKey:randomUUID()});assert.equal(block.status,201);
  assert.equal((await api(path+'/availability?date='+date+'&duration=60&courtId='+other,'GET',undefined,userId)).data.slots.some((s:any)=>s.start==='10:00'),false);
  assert.equal((await api(path+'/reschedule','PATCH',move,userId)).status,409);await unchanged();
  await api('/api/admin/blocks/'+block.data.block.id+'/release','POST',{version:1});
  const quote=await api(path+'/quote','POST',move,userId);assert.equal(quote.status,200);
  const moved=await api(path+'/reschedule','PATCH',{...move,expectedTotal:quote.data.pricing.totalAmount},userId);assert.equal(moved.status,200,JSON.stringify(moved.data));
  assert.equal(moved.data.booking.courtId,other);assert.equal(moved.data.booking.sport,'Бадминтон');assert.equal(moved.data.booking.id,booking.id);assert.equal(moved.data.booking.players,2);assert.equal(moved.data.booking.equipment[0].quantity,1);
  assert.ok((await api('/api/courts/1/availability?date='+date+'&duration=60')).data.slots.some((s:any)=>s.start==='10:00'));
  const notification=(await pool.query("SELECT payload FROM email_notifications WHERE reservation_id=$1 AND kind='rescheduled'",[booking.id])).rows[0].payload;assert.equal(notification.booking.courtId,other);assert.equal(notification.previous.courtId,1);
  assert.equal((await api(path+'/reschedule','PATCH',move,userId)).status,409);

  // A universal hall supports multiple sports, but a move preserves the booked one.
  const halls=(await pool.query("SELECT court_id FROM court_sport_options WHERE sport_id='football' ORDER BY court_id LIMIT 2")).rows;
  const footballCore={courtId:halls[0].court_id,sportId:'football',date,start:'14:00',duration:60,players:10,equipment:[]};
  const footballQuote=await api('/api/courts/'+footballCore.courtId+'/quote','POST',footballCore);assert.equal(footballQuote.status,200);
  const football=await api('/api/admin/reservations','POST',{...footballCore,requestKey:randomUUID(),expectedTotal:footballQuote.data.pricing.totalAmount,customer:{mode:'account',email}});assert.equal(football.status,201);
  const footballPath='/api/reservations/'+football.data.booking.id;
  const footballTarget={courtId:halls[1].court_id,date,start:'14:00',duration:60};
  const footballMoveQuote=await api(footballPath+'/quote','POST',footballTarget,userId);assert.equal(footballMoveQuote.status,200);
  const movedFootball=await api(footballPath+'/reschedule','PATCH',{...footballTarget,sportId:'tennis',version:1,expectedTotal:footballMoveQuote.data.pricing.totalAmount},userId);assert.equal(movedFootball.status,200);assert.equal(movedFootball.data.booking.sport,'Футбол');

  // Under 48 hours every transfer endpoint remains unavailable.
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const nearDate=tomorrow.toISOString().slice(0,10);
  const nearCore={...core,date:nearDate,start:'12:00'};
  const nearQuote=await api('/api/courts/1/quote','POST',nearCore);assert.equal(nearQuote.status,200);
  const near=await api('/api/admin/reservations','POST',{...nearCore,requestKey:randomUUID(),expectedTotal:nearQuote.data.pricing.totalAmount,customer:{mode:'account',email}});assert.equal(near.status,201);
  const nearPath='/api/reservations/'+near.data.booking.id;
  assert.equal((await api(nearPath+'/courts','GET',undefined,userId)).status,403);
  assert.equal((await api(nearPath+'/availability?date='+date+'&duration=60&courtId='+other,'GET',undefined,userId)).status,403);
  assert.equal((await api(nearPath+'/quote','POST',move,userId)).status,403);
  assert.equal((await api(nearPath+'/reschedule','PATCH',move,userId)).status,403);
  assert.equal((await api(nearPath+'/reschedule','PATCH',move,adminId)).status,404);
 }finally{
  if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
  await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
 }
});
