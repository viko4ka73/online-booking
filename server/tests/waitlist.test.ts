import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('waitlist subscriptions notify once on real availability and protect ownership, sport, cancellation and fulfillment',async()=>{
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

  const {default:waitlistRouter}=await import('../src/routes/waitlist');
  app.use('/api/waitlist',waitlistRouter);
  const {refreshWaitlist,deliverWaitlistJob}=await import('../src/waitlist');
  const day=new Date();day.setUTCDate(day.getUTCDate()+7);const date=day.toISOString().slice(0,10);
  const guest={mode:'guest',name:'Waitlist fixture',phone:'+79991234567'};
  async function makeBooking(courtId=1,start='10:00',owner:string|null=null){
   const core={courtId,sportId:'badminton',date,start,duration:60,players:2,equipment:[]};
   const quote=await api('/api/courts/'+courtId+'/quote','POST',core);assert.equal(quote.status,200,JSON.stringify(quote.data));
   const response=await api(owner?'/api/reservations':'/api/admin/reservations','POST',{...core,requestKey:randomUUID(),expectedTotal:quote.data.pricing.totalAmount,...(owner?{}:{customer:guest})},owner??adminId);assert.equal(response.status,201,JSON.stringify(response.data));return response.data.booking;
  }
  async function cancelBooking(booking:any){const result=await api('/api/admin/reservations/'+booking.id+'/cancel','POST',{version:booking.version});assert.equal(result.status,200,JSON.stringify(result.data));}
  const core={courtId:1,sportId:'badminton',date,start:'10:00',duration:60,scope:'court'};
  const signup=(body=core,id:string|null=userId)=>api('/api/waitlist','POST',body,id);
  const busy=await makeBooking();
  assert.equal((await signup(core,null)).status,401);
  assert.equal((await api('/api/waitlist/mine','GET',undefined,null)).status,401);
  const options=await api('/api/waitlist/options?courtId=1&sport=badminton&date='+date+'&duration=60&scope=court','GET',undefined,userId);
  assert.equal(options.status,200);assert.deepEqual(options.data.slots.map((s:any)=>s.start),['09:30','10:00','10:30']);
  assert.equal((await signup({...core,start:'11:30'})).status,400);
  assert.equal((await signup({...core,start:'10:15'})).status,400);
  assert.equal((await signup({...core,duration:330})).status,400);
  assert.equal((await signup({...core,sportId:'table-tennis'})).status,404);
  assert.equal((await signup({...core,start:'09:00'})).status,409);
  assert.equal((await signup({...core,scope:'sport'})).status,409);
  const added=await signup();assert.equal(added.status,201,JSON.stringify(added.data));const entry=added.data.entry;
  const duplicate=await Promise.all([signup(),signup()]);assert.ok(duplicate.every(r=>r.status===200&&r.data.entry.id===entry.id));
  assert.equal((await api('/api/waitlist/'+entry.id+'/cancel','POST',{version:1},adminId)).status,404);
  assert.equal((await api('/api/waitlist/mine','GET',undefined,adminId)).data.total,0);
  await refreshWaitlist();assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notifications')).rows[0].n,0);
  await cancelBooking(busy);await refreshWaitlist();
  const freedOptions=await api('/api/waitlist/options?courtId=1&sport=badminton&date='+date+'&duration=60&scope=court','GET',undefined,userId);assert.deepEqual(freedOptions.data.slots,[]);
  const job=(await pool.query('SELECT * FROM waitlist_notifications WHERE waitlist_id=$1',[entry.id])).rows[0];assert.equal(job.status,'pending');
  const againBusy=await makeBooking();
  const sent:any[]=[];const send=async(message:any)=>{sent.push(message);};
  await deliverWaitlistJob(job.id,send);assert.equal(sent.length,0);assert.equal((await pool.query('SELECT status FROM waitlist_notifications WHERE id=$1',[job.id])).rows[0].status,'skipped');
  await cancelBooking(againBusy);await refreshWaitlist();
  await deliverWaitlistJob(job.id,async()=>{throw Object.assign(Error('test failure'),{code:'ECONNRESET'});});
  const retry=(await pool.query('SELECT status,attempts,last_error FROM waitlist_notifications WHERE id=$1',[job.id])).rows[0];assert.deepEqual(retry,{status:'pending',attempts:1,last_error:'ECONNRESET'});
  await pool.query("UPDATE waitlist_notifications SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",[job.id]);
  const changedEmail=randomUUID()+'@example.invalid';await pool.query("UPDATE app_users SET email=$2,name='<Fixture & player>' WHERE id=$1",[userId,changedEmail]);
  await Promise.all([deliverWaitlistJob(job.id,send),deliverWaitlistJob(job.id,send)]);assert.equal(sent.length,1);assert.equal(sent[0].to.address,changedEmail);assert.ok(sent[0].html.includes('&lt;Fixture &amp; player&gt;'));assert.ok(sent[0].text.includes('date='+date));assert.ok(sent[0].text.includes('start=10%3A00'));assert.ok(sent[0].text.includes('duration=60'));assert.equal(sent[0].attachments[0].contentType,'image/png');
  await refreshWaitlist();await deliverWaitlistJob(job.id,send);assert.equal(sent.length,1);
  const active=await api('/api/waitlist/mine','GET',undefined,userId);assert.equal(active.data.entries[0].status,'notified');assert.equal(active.data.entries[0].notifiedCourtId,1);assert.equal(active.data.entries[0].version,2);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM court_reservations WHERE court_id=1 AND status='active'")).rows[0].n,0);
  assert.equal((await api('/api/waitlist/'+entry.id+'/cancel','POST',{version:1},userId)).status,409);
  assert.equal((await api('/api/waitlist/'+entry.id+'/cancel','POST',{version:2},userId)).status,200);
  assert.equal((await api('/api/waitlist/'+entry.id+'/cancel','POST',{version:2},userId)).status,200);
  assert.equal((await api('/api/waitlist/mine?view=history','GET',undefined,userId)).data.entries[0].status,'cancelled');

  // Booking the requested interval fulfills the request and suppresses pending mail.
  const occupied=await makeBooking();
  const fulfilEntry=(await signup()).data.entry;
  await cancelBooking(occupied);await refreshWaitlist();
  const pendingJob=(await pool.query('SELECT id FROM waitlist_notifications WHERE waitlist_id=$1',[fulfilEntry.id])).rows[0].id;
  await makeBooking(1,'10:00',userId);
  assert.equal((await pool.query('SELECT status FROM waitlist_entries WHERE id=$1',[fulfilEntry.id])).rows[0].status,'fulfilled');
  await deliverWaitlistJob(pendingJob,send);assert.equal(sent.length,1);

  // Any-court requests wait until a resource of the same sport becomes free.
  const badminton=(await pool.query("SELECT court_id FROM court_sport_options WHERE sport_id='badminton' ORDER BY court_id")).rows.map(r=>r.court_id);
  const blocks=[];
  for(const id of badminton){const response=await api('/api/admin/blocks','POST',{courtId:id,date,start:'16:00',end:'17:00',reason:'Waitlist fixture',requestKey:randomUUID()});assert.equal(response.status,201);blocks.push(response.data.block);}
  const allBusyOptions=await api('/api/waitlist/options?courtId=1&sport=badminton&date='+date+'&duration=60&scope=sport','GET',undefined,userId);
  assert.equal(allBusyOptions.status,200);assert.ok(allBusyOptions.data.slots.some((s:any)=>s.start==='16:00'));assert.equal(allBusyOptions.data.slots.some((s:any)=>s.start==='17:30'),false);
  assert.equal((await signup({...core,scope:'sport',start:'17:30'})).status,409);
  const any=await signup({...core,scope:'sport',start:'16:00'});assert.equal(any.status,201,JSON.stringify(any.data));assert.equal(any.data.entry.courtId,null);
  await refreshWaitlist();assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notifications WHERE waitlist_id=$1',[any.data.entry.id])).rows[0].n,0);
  const freed=blocks[blocks.length-1];await api('/api/admin/blocks/'+freed.id+'/release','POST',{version:1});await refreshWaitlist();
  const anyJob=(await pool.query('SELECT id FROM waitlist_notifications WHERE waitlist_id=$1',[any.data.entry.id])).rows[0].id;
  await deliverWaitlistJob(anyJob,send);assert.equal(sent.length,2);assert.ok(sent[1].text.includes('/courts/'+freed.courtId+'?'));assert.ok(sent[1].text.includes('sport=badminton'));
  const anySaved=(await pool.query('SELECT sport_id,notified_court_id FROM waitlist_entries WHERE id=$1',[any.data.entry.id])).rows[0];assert.equal(anySaved.sport_id,'badminton');assert.equal(anySaved.notified_court_id,freed.courtId);

  // Cancellation before availability prevents mail and returns the entry in history.
  const lastBlock=blocks[0];
  const cancelled=await signup({...core,start:'16:00'});assert.equal(cancelled.status,201);
  assert.equal((await api('/api/waitlist/'+cancelled.data.entry.id+'/cancel','POST',{version:1},userId)).status,200);
  await api('/api/admin/blocks/'+lastBlock.id+'/release','POST',{version:1});await refreshWaitlist();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notifications WHERE waitlist_id=$1',[cancelled.data.entry.id])).rows[0].n,0);


  // A queued availability email is suppressed if the user removes the request.
  const lateBusy=await makeBooking(1,'14:00');
  const lateEntry=await signup({...core,start:'14:00'});assert.equal(lateEntry.status,201);
  await cancelBooking(lateBusy);await refreshWaitlist();
  const lateJob=(await pool.query('SELECT id FROM waitlist_notifications WHERE waitlist_id=$1',[lateEntry.data.entry.id])).rows[0].id;
  assert.equal((await api('/api/waitlist/'+lateEntry.data.entry.id+'/cancel','POST',{version:1},userId)).status,200);
  const countBefore=sent.length;await deliverWaitlistJob(lateJob,send);assert.equal(sent.length,countBefore);

  // Expired and removed resources never produce availability emails.
  const expired=randomUUID();
  await pool.query("INSERT INTO waitlist_entries(id,user_id,court_id,sport_id,play_date,start_minute,duration) VALUES($1,$2,1,'badminton','1900-01-01',600,60)",[expired,userId]);
  await refreshWaitlist();assert.equal((await pool.query('SELECT status FROM waitlist_entries WHERE id=$1',[expired])).rows[0].status,'expired');
  const table=(await pool.query("SELECT court_id FROM court_sport_options WHERE sport_id='table-tennis' ORDER BY court_id LIMIT 1")).rows[0].court_id;
  const tableBlock=await api('/api/admin/blocks','POST',{courtId:table,date,start:'14:00',end:'15:00',reason:'Waitlist fixture',requestKey:randomUUID()});assert.equal(tableBlock.status,201);
  const tableEntry=await signup({...core,courtId:table,sportId:'table-tennis',start:'14:00'});assert.equal(tableEntry.status,201);
  await api('/api/admin/blocks/'+tableBlock.data.block.id+'/release','POST',{version:1});
  await pool.query('UPDATE courts SET deleted_at=now() WHERE id=$1',[table]);await refreshWaitlist();
  assert.equal((await pool.query('SELECT status FROM waitlist_entries WHERE id=$1',[tableEntry.data.entry.id])).rows[0].status,'expired');
  assert.equal((await api('/api/waitlist/mine?view=history&page=999','GET',undefined,userId)).data.page,2);
  assert.equal((await api('/api/waitlist/mine?view=history&page=1','GET',undefined,userId)).data.entries.length,3);
 }finally{
  if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
  await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
 }
});
