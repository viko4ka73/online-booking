import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

test('halls: independent courts, shared multi-sport occupancy, tariffs, repeat, move and cancellation',async()=>{
  // Isolate outbox jobs from the running application's real email worker.
  const bootstrap=new Pool({connectionString:process.env.DATABASE_URL});
  const schema='hall_test_'+randomUUID().replaceAll('-','');
  await bootstrap.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
  const {pool,initializeDatabase}=await import('../src/db');
  let server:Server|undefined;const images=new Set<string>();
  try {
    await initializeDatabase();await initializeDatabase();
    const [{default:admin},{default:schedule},{default:reservations},{COURT_IMAGE_DIR}]=await Promise.all([import('../src/routes/admin'),import('../src/routes/schedule'),import('../src/routes/reservations'),import('../src/courtImages')]);
    const adminId=randomUUID(),userId=randomUUID();
    await pool.query("INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Админ',$2,'test-only','admin'),($3,'Игрок',$4,'test-only','user')",[adminId,adminId+'@example.invalid',userId,userId+'@example.invalid']);
    const app=express();app.use(express.json({limit:'3mb'}));app.use(cookieParser());app.use('/api/admin',admin);app.use('/api/courts',schedule);app.use('/api/reservations',reservations);
    server=await new Promise<Server>(done=>{const instance=app.listen(0,'127.0.0.1',()=>done(instance));});
    const address=server.address();assert.ok(address && typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
    const api=async(path:string,method='GET',body?:unknown,id=adminId)=>{
      const cookie='sport_booking_session='+jwt.sign({},process.env.JWT_SECRET!,{subject:id,expiresIn:'5m',issuer:'sport-booking-api',audience:'sport-booking-client'});
      const res=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
      const data=await res.json();return {status:res.status,data};
    };
    const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const draft={requestKey:randomUUID(),name:'Универсальный тестовый зал',rentalMode:'whole',sportIds:['volleyball','basketball'],image:photo,capacity:12,description:'Зал для проверки общего расписания разных видов спорта.',dimensions:'28 × 15 м',surface:'Спортивный паркет',equipmentDescription:''};
    assert.equal((await api('/api/admin/halls','POST',draft,userId)).status,403);
    const created=await api('/api/admin/halls','POST',draft);assert.equal(created.status,201,JSON.stringify(created.data));
    const hall=created.data.hall;images.add(resolve(COURT_IMAGE_DIR,hall.image.split('/').pop()));assert.equal(hall.resourceCount,1);assert.equal(hall.sports.length,2);
    assert.equal((await api('/api/admin/halls','POST',draft)).data.hall.resourceId,hall.resourceId);
    const publicCourts=(await api('/api/courts')).data.courts.filter((c:any)=>c.hallId===hall.id);
    assert.equal(publicCourts.length,1);assert.equal(publicCourts[0].sports.length,2);
    const resource={name:'Корт',hallId:hall.id,sportId:'badminton',kind:'court',image:photo,capacity:4,description:draft.description,dimensions:'13 × 6 м',surface:draft.surface,equipmentDescription:'',requestKey:randomUUID()};
    assert.equal((await api('/api/admin/courts','POST',resource)).status,409);
    assert.equal((await api(`/api/courts/${hall.resourceId}/options?sport=badminton`)).status,404);
    await pool.query("UPDATE sport_time_rates SET hourly_rate=hourly_rate+10000 WHERE sport_id='basketball'");
    const dateAt=new Date();dateAt.setUTCDate(dateAt.getUTCDate()+7);const date=dateAt.toISOString().slice(0,10);
    const details={date,start:'10:00',duration:60,players:10,equipment:[]};
    const catalog=(await api('/api/courts')).data.courts;
    const complex=catalog.filter((c:any)=>['badminton-hall','table-tennis-hall',...Array.from({length:7},(_,i)=>`hall-${i+1}`)].includes(c.hallId));
    assert.equal(complex.length,21);
    const bySport=(sport:string)=>complex.filter((c:any)=>c.sports.some((s:any)=>s.id===sport));
    assert.equal(bySport('badminton').length,6);assert.equal(bySport('table-tennis').length,8);
    assert.equal(bySport('football').length,7);assert.equal(bySport('tennis').length,8);
    assert.deepEqual(bySport('volleyball').map((c:any)=>c.resourceNumber).sort(),[4,5,7]);
    assert.deepEqual(bySport('basketball').map((c:any)=>c.resourceNumber).sort(),[4,5,7]);
    const vip=bySport('table-tennis').find((c:any)=>c.resourceNumber===1),regular=bySport('table-tennis').find((c:any)=>c.resourceNumber===3);
    assert.equal(vip.hourlySurcharge,3000);assert.equal(bySport('table-tennis').filter((c:any)=>c.hourlySurcharge>0).length,2);
    for(const duration of [60,90,180]){
      const price=async(id:number)=>{const r=await api(`/api/courts/${id}/quote`,'POST',{...details,start:'11:00',players:2,duration,sportId:'table-tennis'});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.pricing.totalAmount;};
      assert.equal(await price(vip.id)-await price(regular.id),3000*duration/60);
    }
    const shared=complex.find((c:any)=>c.hallId==='hall-4');
    assert.equal(shared.sports.length,4);
    const sharedAttempts=await Promise.all(['tennis','football','volleyball','basketball'].map(async sportId=>{
      const payload={...details,start:'14:00',sportId};const q=await api(`/api/courts/${shared.id}/quote`,'POST',payload);assert.equal(q.status,200);
      return api('/api/reservations','POST',{...payload,courtId:shared.id,requestKey:randomUUID(),expectedTotal:q.data.pricing.totalAmount},userId);
    }));
    assert.deepEqual(sharedAttempts.map(r=>r.status).sort(),[201,409,409,409]);
    const sharedBooking=sharedAttempts.find(r=>r.status===201)!.data.booking;
    assert.equal((await api(`/api/reservations/${sharedBooking.id}/cancel`,'POST',{version:sharedBooking.version},userId)).status,200);
    const wall=bySport('badminton').find((c:any)=>c.resourceNumber===6);
    assert.equal(wall.sports.find((s:any)=>s.id==='tennis').courtName,'Теннисная стенка №6');
    const wallOptions=await api(`/api/courts/${wall.id}/options?sport=tennis`);assert.equal(wallOptions.status,200);assert.equal(wallOptions.data.court.name,'Теннисная стенка №6');assert.deepEqual(wallOptions.data.court.equipment,[]);
    const wallDetails={...details,players:2,sportId:'tennis'};
    const wallQuote=await api(`/api/courts/${wall.id}/quote`,'POST',wallDetails);assert.equal(wallQuote.status,200);
    const wallBooking=await api('/api/reservations','POST',{...wallDetails,courtId:wall.id,requestKey:randomUUID(),expectedTotal:wallQuote.data.pricing.totalAmount},userId);assert.equal(wallBooking.status,201,JSON.stringify(wallBooking.data));assert.equal(wallBooking.data.booking.courtName,'Теннисная стенка №6');
    const badmintonQuote=await api(`/api/courts/${wall.id}/quote`,'POST',{...details,players:2,sportId:'badminton'});assert.equal(badmintonQuote.status,200);
    const wallConflict=await api('/api/reservations','POST',{...details,players:2,sportId:'badminton',courtId:wall.id,requestKey:randomUUID(),expectedTotal:badmintonQuote.data.pricing.totalAmount},userId);assert.equal(wallConflict.status,409);
    const wallMoveDetails={date,start:'12:00',duration:90};
    const wallMoveQuote=await api(`/api/reservations/${wallBooking.data.booking.id}/quote`,'POST',wallMoveDetails,userId);assert.equal(wallMoveQuote.status,200);
    const wallMoved=await api(`/api/reservations/${wallBooking.data.booking.id}/reschedule`,'PATCH',{...wallMoveDetails,version:wallBooking.data.booking.version,expectedTotal:wallMoveQuote.data.pricing.totalAmount},userId);assert.equal(wallMoved.status,200);assert.equal(wallMoved.data.booking.courtName,'Теннисная стенка №6');
    assert.equal((await api(`/api/reservations/${wallMoved.data.booking.id}/cancel`,'POST',{version:wallMoved.data.booking.version},userId)).status,200);
    const quote=async(sportId:string)=>{const q=await api(`/api/courts/${hall.resourceId}/quote`,'POST',{...details,sportId});assert.equal(q.status,200,JSON.stringify(q.data));return q.data.pricing.totalAmount;};
    const volleyball=await quote('volleyball'),basketball=await quote('basketball');assert.ok(basketball>volleyball);
    const book=async(sportId:string,total:number)=>api('/api/reservations','POST',{...details,courtId:hall.resourceId,sportId,expectedTotal:total,requestKey:randomUUID()},userId);
    const concurrent=await Promise.all([book('volleyball',volleyball),book('basketball',basketball)]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
    const booking=concurrent.find(r=>r.status===201)!.data.booking;assert.ok(['volleyball','basketball'].includes(booking.sportId));
    assert.equal((await api('/api/reservations/mine','GET',undefined,userId)).data.bookings[0].sportId,booking.sportId);
    assert.equal((await api(`/api/reservations/${booking.id}/repeat`,'GET',undefined,userId)).data.booking.sportId,booking.sportId);
    const available=async(id:number)=>{const r=await api(`/api/courts/${id}/availability?date=${date}&duration=60`);assert.equal(r.status,200);return r.data.slots.map((s:any)=>s.start);};
    assert.ok(!(await available(hall.resourceId)).includes('10:00'));
    const newDetails={date,start:'12:00',duration:60};
    const moveQuote=await api(`/api/reservations/${booking.id}/quote`,'POST',newDetails,userId);assert.equal(moveQuote.status,200);
    const moved=await api(`/api/reservations/${booking.id}/reschedule`,'PATCH',{...newDetails,version:booking.version,expectedTotal:moveQuote.data.pricing.totalAmount},userId);assert.equal(moved.status,200,JSON.stringify(moved.data));assert.equal(moved.data.booking.sportId,booking.sportId);
    assert.ok((await available(hall.resourceId)).includes('10:00'));assert.ok(!(await available(hall.resourceId)).includes('12:00'));
    const cancelled=await api(`/api/reservations/${booking.id}/cancel`,'POST',{version:moved.data.booking.version},userId);assert.equal(cancelled.status,200);assert.ok((await available(hall.resourceId)).includes('12:00'));
    const unitHall=await api('/api/admin/halls','POST',{...draft,requestKey:randomUUID(),name:'Зал с независимыми кортами',rentalMode:'units',sportIds:['badminton']});assert.equal(unitHall.status,201);assert.equal(unitHall.data.hall.resourceCount,0);images.add(resolve(COURT_IMAGE_DIR,unitHall.data.hall.image.split('/').pop()));
    assert.equal((await api('/api/admin/courts','POST',{...resource,hallId:unitHall.data.hall.id,sportId:'basketball',capacity:12})).status,400);
    const ids:number[]=[];
    for(let i=0;i<2;i++){const r=await api('/api/admin/courts','POST',{...resource,hallId:unitHall.data.hall.id,name:'Корт '+i,requestKey:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));ids.push(r.data.court.id);images.add(resolve(COURT_IMAGE_DIR,r.data.court.image.split('/').pop()));}
    const q=await api(`/api/courts/${ids[0]}/quote`,'POST',{...details,sportId:'badminton',players:2});assert.equal(q.status,200);
    const first=await api('/api/reservations','POST',{...details,courtId:ids[0],sportId:'badminton',players:2,requestKey:randomUUID(),expectedTotal:q.data.pricing.totalAmount},userId);assert.equal(first.status,201,JSON.stringify(first.data));
    assert.ok(!(await available(ids[0])).includes('10:00'));assert.ok((await available(ids[1])).includes('10:00'));
  } finally {
    if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
    await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
    for(const file of images)await unlink(file).catch(()=>{});
  }
});
