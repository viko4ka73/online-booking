import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('admin manages rates, equipment and cross-court transfers without changing saved bookings',async()=>{
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
  const guest={mode:'guest',name:'Commercial fixture',phone:'+79991234567'};
  const options=await api('/api/courts/1/options');const originalEquipment=options.data.court.equipment;
  const core={courtId:1,sportId:'badminton',date,start:'10:00',duration:60,players:2,equipment:[{id:'racket',quantity:1}]};
  const q=await api('/api/courts/1/quote','POST',core);assert.equal(q.status,200);
  const draft={...core,expectedTotal:q.data.pricing.totalAmount,customer:guest,requestKey:randomUUID()};
  const created=await api('/api/admin/reservations','POST',draft);assert.equal(created.status,201,JSON.stringify(created.data));
  const booking=created.data.booking;
  assert.equal((await api('/api/admin/commercial','GET',undefined,null)).status,401);
  assert.equal((await api('/api/admin/commercial','GET',undefined,userId)).status,403);
  const settings=(await api('/api/admin/commercial')).data;
  const sport=settings.sports.find((s:any)=>s.id==='badminton');
  const rates=sport.rates.map((r:any)=>({...r,hourlyRate:r.hourlyRate+1234,extraPlayerHourlyRate:r.extraPlayerHourlyRate+100}));
  assert.equal((await api('/api/admin/commercial/rates/badminton','PUT',{version:settings.version,rates:rates.map((r:any)=>({...r,hourlyRate:-1}))})).status,400);
  const gap=rates.map((r:any,i:number)=>i===0?{...r,endMinute:r.endMinute-30}:r);
  assert.equal((await api('/api/admin/commercial/rates/badminton','PUT',{version:settings.version,rates:gap})).status,400);
  assert.equal((await api('/api/admin/commercial/rates/badminton','PUT',{version:settings.version,rates:rates.filter((r:any)=>r.dayType==='weekday')})).status,400);
  const saved=await api('/api/admin/commercial/rates/badminton','PUT',{version:settings.version,rates});assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal((await api('/api/admin/commercial/rates/badminton','PUT',{version:settings.version,rates})).status,409);
  const recalculated=await api('/api/courts/1/quote','POST',{...core,start:'12:00'});assert.equal(recalculated.status,200);
  assert.equal((await api('/api/admin/reservations','POST',{...draft,start:'12:00',requestKey:randomUUID()})).status,409);
  assert.deepEqual((await pool.query('SELECT pricing FROM court_reservations WHERE id=$1',[booking.id])).rows[0].pricing,booking.pricing);
  let current=(await api('/api/admin/commercial')).data;
  const racket=current.equipment.find((e:any)=>e.id==='racket');
  const itemBody={...racket,version:current.version,unitPrice:racket.unitPrice+999,courts:racket.courts};
  assert.equal((await api('/api/admin/commercial/equipment/racket','PUT',{...itemBody,unitPrice:-1})).status,400);
  const savedItem=await api('/api/admin/commercial/equipment/racket','PUT',itemBody);assert.equal(savedItem.status,200,JSON.stringify(savedItem.data));
  assert.equal((await api('/api/admin/commercial/equipment/racket','PUT',itemBody)).status,409);
  assert.equal((await api('/api/courts/1/options')).data.court.equipment.find((e:any)=>e.id==='racket').unitPrice,racket.unitPrice+999);
  assert.deepEqual((await pool.query('SELECT pricing FROM court_reservations WHERE id=$1',[booking.id])).rows[0].pricing,booking.pricing);
  const candidates=await api('/api/admin/reservations/'+booking.id+'/courts');assert.equal(candidates.status,200);
  const other=candidates.data.courts.find((c:any)=>c.id!==1).id;
  const targetQuery='/api/admin/reservations/'+booking.id;
  const targetQuote=await api(targetQuery+'/quote','POST',{courtId:other,date,start:'10:00',duration:60});assert.equal(targetQuote.status,200,JSON.stringify(targetQuote.data));
  assert.equal((await api(targetQuery+'/reschedule','PATCH',{courtId:other,date,start:'10:00',duration:60,version:99,expectedTotal:targetQuote.data.pricing.totalAmount})).status,409);
  // Blocking and a competing booking must both leave the original unchanged.
  const block=await api('/api/admin/blocks','POST',{courtId:other,date,start:'10:00',end:'11:00',reason:'Fixture repair',requestKey:randomUUID()});assert.equal(block.status,201);
  const move={courtId:other,date,start:'10:00',duration:60,version:1,expectedTotal:targetQuote.data.pricing.totalAmount};
  assert.equal((await api(targetQuery+'/reschedule','PATCH',move)).status,409);
  assert.equal((await pool.query('SELECT court_id FROM court_reservations WHERE id=$1',[booking.id])).rows[0].court_id,1);
  await api('/api/admin/blocks/'+block.data.block.id+'/release','POST',{version:1});
  const transfer=await api(targetQuery+'/reschedule','PATCH',move);assert.equal(transfer.status,200,JSON.stringify(transfer.data));assert.equal(transfer.data.booking.courtId,other);assert.equal(transfer.data.booking.id,booking.id);assert.equal(transfer.data.booking.players,2);assert.equal(transfer.data.booking.equipment[0].quantity,1);assert.equal(transfer.data.booking.sport,'Бадминтон');assert.equal(transfer.data.booking.version,2);
  assert.ok((await api('/api/courts/1/availability?date='+date+'&duration=60')).data.slots.some((s:any)=>s.start==='10:00'));
  assert.equal((await api('/api/courts/'+other+'/availability?date='+date+'&duration=60')).data.slots.some((s:any)=>s.start==='10:00'),false);
  const table=current.courts.find((c:any)=>c.sportIds.includes('table-tennis')).id;
  assert.equal((await api(targetQuery+'/quote','POST',{courtId:table,date,start:'12:00',duration:60})).status,409);
  assert.equal((await api(targetQuery+'/availability?date='+date+'&duration=60&courtId='+table)).status,409);
  assert.equal((await api(targetQuery+'/availability?date='+date+'&duration=60&courtId=garbage')).status,400);
  current=(await api('/api/admin/commercial')).data;
  const currentRacket=current.equipment.find((e:any)=>e.id==='racket');
  const hide={...currentRacket,version:current.version,courts:[]};
  assert.equal((await api('/api/admin/commercial/equipment/racket','PUT',hide)).status,200);
  assert.equal((await api('/api/courts/1/options')).data.court.equipment.some((e:any)=>e.id==='racket'),false);
  assert.equal((await api(targetQuery+'/quote','POST',{courtId:1,date,start:'12:00',duration:60})).status,409);
  assert.equal((await pool.query('SELECT equipment_name FROM reservation_equipment WHERE reservation_id=$1',[booking.id])).rows[0].equipment_name,originalEquipment.find((e:any)=>e.id==='racket').name);
  current=(await api('/api/admin/commercial')).data;
  const newItem={name:'Fixture football',unitPrice:12345,sportIds:['football'],courts:current.courts.filter((c:any)=>c.sportIds.includes('football')).map((c:any)=>({courtId:c.id,max:3})),version:current.version};
  const added=await api('/api/admin/commercial/equipment','POST',newItem);assert.equal(added.status,201,JSON.stringify(added.data));
  const shared=newItem.courts[0].courtId;
  assert.ok((await api('/api/courts/'+shared+'/options?sport=football')).data.court.equipment.some((e:any)=>e.id===added.data.id&&e.max===3));
  assert.equal((await api('/api/courts/'+shared+'/options?sport=tennis')).data.court.equipment.some((e:any)=>e.id===added.data.id),false);
  // Two editors saving the same version cannot overwrite each other.
  current=(await api('/api/admin/commercial')).data;
  const raceBody={...newItem,version:current.version,name:'Race fixture'};
  const race=await Promise.all([api('/api/admin/commercial/equipment','POST',raceBody),api('/api/admin/commercial/equipment','POST',raceBody)]);
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_notifications')).rows[0].n,0);

  current=(await api('/api/admin/commercial')).data;
  assert.equal((await api('/api/admin/commercial/vip-tables','PUT',{version:current.version,hourlySurcharge:4500})).status,200);
  const {courtDraftTemplate}=await import('../../client/src/lib/courtTemplates');
  const directory=(await api('/api/admin/courts')).data;
  assert.equal(directory.vipHourlySurcharge,4500);
  const vipDraft=courtDraftTemplate(directory,'table-tennis',undefined,['table-tennis'],true);
  const vipBody={requestKey:randomUUID(),name:vipDraft.name,sportId:vipDraft.sportId,hallId:vipDraft.hallId,image:vipDraft.image,capacity:vipDraft.capacity,description:vipDraft.description,dimensions:vipDraft.dimensions,surface:vipDraft.surface,equipmentDescription:vipDraft.equipmentDescription,kind:vipDraft.kind,resourceNumber:vipDraft.resourceNumber,vip:true};
  const newVip=await api('/api/admin/courts','POST',vipBody);assert.equal(newVip.status,201,JSON.stringify(newVip.data));assert.equal(newVip.data.court.hourlySurcharge,4500);
  const {listPrices}=await import('../src/catalog');
  assert.deepEqual((await listPrices()).sports.find((s:any)=>s.id==='table-tennis').supplements,[{hourlySurcharge:4500}]);
  current=(await api('/api/admin/commercial')).data;
  assert.equal((await api('/api/admin/commercial/vip-tables','PUT',{version:current.version,hourlySurcharge:0})).status,200);
  assert.equal((await api('/api/courts/'+newVip.data.court.id+'/options')).data.court.hourlySurcharge,0);
  current=(await api('/api/admin/commercial')).data;
  assert.equal((await api('/api/admin/commercial/vip-tables','PUT',{version:current.version,hourlySurcharge:4500})).status,200);
  assert.equal((await api('/api/courts/'+newVip.data.court.id+'/options')).data.court.hourlySurcharge,4500);
  assert.deepEqual((await listPrices()).sports.find((s:any)=>s.id==='table-tennis').supplements,[{hourlySurcharge:4500}]);
  const vip=current.courts.find((c:any)=>c.kind==='table'&&c.resourceNumber===1).id;
  assert.equal((await api('/api/courts/'+vip+'/options')).data.court.hourlySurcharge,4500);
  const basic=current.courts.find((c:any)=>c.kind==='table'&&c.resourceNumber===3).id;
  const ttCore={courtId:basic,sportId:'table-tennis',date,start:'10:00',duration:60,players:2,equipment:[]};
  const ttQuote=await api('/api/courts/'+basic+'/quote','POST',ttCore);assert.equal(ttQuote.status,200);
  const ttBooking=await api('/api/admin/reservations','POST',{...ttCore,expectedTotal:ttQuote.data.pricing.totalAmount,customer:{mode:'account',email},requestKey:randomUUID()});assert.equal(ttBooking.status,201);
  const ttId=ttBooking.data.booking.id;
  assert.equal((await api('/api/reservations/'+ttId+'/quote','POST',{courtId:vip,date,start:'10:00',duration:60},userId)).status,200);
  const vipQuote=await api('/api/admin/reservations/'+ttId+'/quote','POST',{courtId:vip,date,start:'10:00',duration:60});assert.equal(vipQuote.status,200);
  assert.equal(vipQuote.data.pricing.totalAmount-ttQuote.data.pricing.totalAmount,4500);
  const vipMove=await api('/api/admin/reservations/'+ttId+'/reschedule','PATCH',{courtId:vip,date,start:'10:00',duration:60,version:1,expectedTotal:vipQuote.data.pricing.totalAmount});assert.equal(vipMove.status,200);
  const mail=(await pool.query("SELECT payload FROM email_notifications WHERE reservation_id=$1 AND kind='rescheduled'",[ttId])).rows[0].payload;
  assert.equal(mail.booking.courtId,vip);assert.equal(mail.previous.courtId,basic);


  const third=candidates.data.courts.find((c:any)=>c.id!==1&&c.id!==other).id;
  const secondCore={courtId:1,sportId:'badminton',date,start:'12:00',duration:60,players:2,equipment:[]};
  const secondQuote=await api('/api/courts/1/quote','POST',secondCore);
  const second=await api('/api/admin/reservations','POST',{...secondCore,expectedTotal:secondQuote.data.pricing.totalAmount,customer:guest,requestKey:randomUUID()});assert.equal(second.status,201);
  // Restore the racket on all badminton courts for both concurrent moves.
  current=(await api('/api/admin/commercial')).data;
  const restored=current.equipment.find((e:any)=>e.id==='racket');
  assert.equal((await api('/api/admin/commercial/equipment/racket','PUT',{...restored,version:current.version,courts:current.courts.filter((c:any)=>c.sportIds.includes('badminton')).map((c:any)=>({courtId:c.id,max:4}))})).status,200);
  const moves=await Promise.all([booking.id,second.data.booking.id].map(async(id:string)=>{
   const path='/api/admin/reservations/'+id;
   const q=await api(path+'/quote','POST',{courtId:third,date,start:'16:00',duration:60});assert.equal(q.status,200);
   return api(path+'/reschedule','PATCH',{courtId:third,date,start:'16:00',duration:60,version:id===booking.id?2:1,expectedTotal:q.data.pricing.totalAmount});
  }));
  assert.deepEqual(moves.map(r=>r.status).sort(),[200,409]);

 }finally{
  if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
  await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
 }
});
