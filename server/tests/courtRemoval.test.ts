import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('court removal shows paginated bookings and blocks and allows processing them before safe deletion',async()=>{
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

  const apiPath='/api/admin/courts/1/deletion-review';
  assert.equal((await api(apiPath,'GET',undefined,null)).status,401);
  assert.equal((await api(apiPath,'GET',undefined,userId)).status,403);
  assert.equal((await api(apiPath+'?page=0')).status,400);
  assert.equal((await api(apiPath+'?page=1.5')).status,400);
  assert.equal((await api(apiPath+'?blockPage=-1')).status,400);
  assert.equal((await api('/api/admin/courts/999999/deletion-review')).status,404);
  const bookings:any[]=[];
  for(const start of ['09:00','10:00','11:00','12:00']){
   const core={courtId:1,sportId:'badminton',date,start,duration:60,players:2,equipment:[]};
   const q=await api('/api/courts/1/quote','POST',core);assert.equal(q.status,200);
   const created=await api('/api/admin/reservations','POST',{...core,requestKey:randomUUID(),expectedTotal:q.data.pricing.totalAmount,customer:{mode:'account',email}});assert.equal(created.status,201,JSON.stringify(created.data));bookings.push(created.data.booking);
  }
  const block=await api('/api/admin/blocks','POST',{courtId:1,date,start:'16:00',end:'17:00',reason:'Обслуживание покрытия',requestKey:randomUUID()});assert.equal(block.status,201);
  const review=await api(apiPath);assert.equal(review.status,200);assert.equal(review.data.total,4);assert.equal(review.data.bookings.length,3);assert.equal(review.data.totalPages,2);assert.equal(review.data.blockTotal,1);assert.equal(review.data.bookings[0].customer.email,email);assert.equal(review.data.bookings[0].canModify,true);assert.equal(review.data.court.id,1);
  const second=await api(apiPath+'?page=2');assert.equal(second.data.bookings.length,1);assert.equal(second.data.bookings[0].start,'12:00');assert.equal((await api(apiPath+'?page=999')).data.page,2);
  const remove=()=>api('/api/admin/courts/1','DELETE',{version:review.data.court.version});assert.equal((await remove()).status,409);
  const path='/api/admin/reservations/'+bookings[0].id;
  const candidates=await api(path+'/courts');assert.equal(candidates.status,200);const target=candidates.data.courts.find((c:any)=>c.id!==1);assert.ok(target);
  const move={courtId:target.id,date,start:'09:00',duration:60,version:1};const mq=await api(path+'/quote','POST',move);assert.equal(mq.status,200);
  const moved=await api(path+'/reschedule','PATCH',{...move,expectedTotal:mq.data.pricing.totalAmount});assert.equal(moved.status,200);assert.equal(moved.data.booking.courtId,target.id);
  assert.equal((await api(apiPath+'?page=2')).data.total,3);assert.equal((await api(apiPath+'?page=2')).data.page,1);
  for(const booking of bookings.slice(1))assert.equal((await api('/api/admin/reservations/'+booking.id+'/cancel','POST',{version:booking.version})).status,200);
  const onlyBlock=await api(apiPath);assert.equal(onlyBlock.data.total,0);assert.equal(onlyBlock.data.blockTotal,1);assert.equal((await remove()).status,409);
  assert.equal((await api('/api/admin/blocks/'+block.data.block.id+'/release','POST',{version:1})).status,200);
  const clear=await api(apiPath);assert.equal(clear.data.total,0);assert.equal(clear.data.blockTotal,0);
  // A booking arriving after the review must still prevent deletion.
  const core={courtId:1,sportId:'badminton',date,start:'14:00',duration:60,players:2,equipment:[]};const q=await api('/api/courts/1/quote','POST',core);
  const late=await api('/api/admin/reservations','POST',{...core,requestKey:randomUUID(),expectedTotal:q.data.pricing.totalAmount,customer:{mode:'account',email}});assert.equal(late.status,201);assert.equal((await remove()).status,409);
  assert.equal((await api('/api/admin/reservations/'+late.data.booking.id+'/cancel','POST',{version:1})).status,200);
  assert.equal((await remove()).status,200);assert.equal((await api(apiPath)).status,404);
  assert.equal((await pool.query('SELECT court_id,status FROM court_reservations WHERE id=$1',[bookings[0].id])).rows[0].court_id,target.id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM court_reservations WHERE id=ANY($1::uuid[])',[bookings.slice(1).map(b=>b.id)])).rows[0].n,3);
  const messages=(await pool.query("SELECT kind FROM email_notifications WHERE reservation_id=ANY($1::uuid[]) AND kind IN ('cancelled','rescheduled')",[bookings.map(b=>b.id)])).rows;assert.equal(messages.length,4);
  const {localDate}=await import('../src/booking');const today=localDate.format(new Date()),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number),minute=clock[0]*60+clock[1];
  await pool.query("INSERT INTO court_reservations(court_id,play_date,start_minute,end_minute,sport_id,players,guest_name) VALUES($1,$2,$3,$4,'badminton',2,'Текущая игра')",[target.id,today,Math.max(0,Math.floor(minute/30)*30-30),Math.min(1440,Math.floor(minute/30)*30+30)]);
  const ongoing=await api('/api/admin/courts/'+target.id+'/deletion-review');assert.ok(ongoing.data.bookings.some((b:any)=>b.date===today&&b.canModify===false));
 }finally{
  if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
  await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
 }
});
