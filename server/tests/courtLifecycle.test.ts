import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';
import {courtDraftTemplate} from '../../client/src/lib/courtTemplates';

test('all-sport templates, numbered creation, VIP pricing and safe deletion preserve booking history',async()=>{
  const bootstrap=new Pool({connectionString:process.env.DATABASE_URL});
  const schema='lifecycle_test_'+randomUUID().replaceAll('-','');
  await bootstrap.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
  const {pool,initializeDatabase}=await import('../src/db');let server:Server|undefined;
  try{
    await initializeDatabase();await initializeDatabase();
    const [{default:admin},{default:schedule},{default:reservations},{default:favorites}]=await Promise.all([import('../src/routes/admin'),import('../src/routes/schedule'),import('../src/routes/reservations'),import('../src/routes/favorites')]);
    const adminId=randomUUID(),userId=randomUUID();
    await pool.query("INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Тест админа',$2,'test-only','admin'),($3,'Тест игрока',$4,'test-only','user')",[adminId,adminId+'@example.invalid',userId,userId+'@example.invalid']);
    const app=express();app.use(express.json({limit:'3mb'}));app.use(cookieParser());app.use('/api/admin',admin);app.use('/api/courts',schedule);app.use('/api/reservations',reservations);app.use('/api/favorites',favorites);
    server=await new Promise<Server>(done=>{const instance=app.listen(0,'127.0.0.1',()=>done(instance));});const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
    const api=async(path:string,method='GET',body?:unknown,id:string|null=adminId)=>{
      const cookie=id?'sport_booking_session='+jwt.sign({},process.env.JWT_SECRET!,{subject:id,expiresIn:'5m',issuer:'sport-booking-api',audience:'sport-booking-client'}):'';
      const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};
    };
    const created:any[]=[];
    for(const sportId of ['badminton','table-tennis','football','volleyball','basketball','tennis']){
      const directory=(await api('/api/admin/courts')).data;
      const draft=courtDraftTemplate(directory,sportId,undefined,sportId==='football'?['football','tennis','volleyball','basketball']:[sportId],sportId==='table-tennis');
      assert.ok(draft.description.length>=10);assert.ok(draft.dimensions);assert.ok(draft.surface);assert.ok(draft.equipmentDescription);assert.ok(draft.capacity>=directory.sports.find((s:any)=>s.id===sportId).minPlayers);
      const core={name:draft.name,image:draft.image,capacity:draft.capacity,description:draft.description,dimensions:draft.dimensions,surface:draft.surface,equipmentDescription:draft.equipmentDescription,requestKey:randomUUID(),resourceNumber:draft.resourceNumber};
      const path=draft.kind==='whole'?'/api/admin/halls':'/api/admin/courts';
      const body=draft.kind==='whole'?{...core,rentalMode:'whole',sportIds:draft.sportIds}:{...core,kind:draft.kind,sportId,hallId:draft.hallId,vip:draft.vip};
      assert.equal((await api(path,'POST',body,userId)).status,403);
      const result=await api(path,'POST',body);assert.equal(result.status,201,JSON.stringify(result.data));const court=result.data.court;assert.ok(court);created.push({court,path,body});
      assert.equal(court.sportId,sportId);assert.equal(court.kind,draft.kind);assert.equal(court.resourceNumber,draft.resourceNumber);assert.equal(court.image,draft.image);assert.equal(court.hourlySurcharge,draft.vip?3000:0);
      const retry=await api(path,'POST',body);assert.equal(retry.status,200);assert.equal(retry.data.court.id,court.id);
      const duplicate=await api(path,'POST',{...body,name:body.name+' duplicate',requestKey:randomUUID()});assert.equal(duplicate.status,409);
      const options=await api(`/api/courts/${court.id}/options?sport=${sportId}`);assert.equal(options.status,200);
    }
    const scheduleDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
    const numbered=(await api('/api/admin/schedule?date='+scheduleDate)).data.courts.filter((c:any)=>c.kind==='whole').map((c:any)=>c.resourceNumber);
    assert.ok(numbered.includes(10));
    assert.deepEqual(numbered,[...numbered].sort((a:number,b:number)=>a-b),'Calendar columns must follow numeric resource numbers');
    const shared=created.find(item=>item.court.sportId==='football').court;
    const draftFor=(court:any,sportIds:string[],changes:Record<string,unknown>={})=>({name:court.name,sportId:court.sportId,hallId:court.hallId,kind:court.kind,image:court.image,capacity:court.capacity,description:court.description,dimensions:court.dimensions,surface:court.surface,equipmentDescription:court.equipmentDescription,version:court.version,sportIds,...changes});
    const patch=(court:any,sportIds:string[],changes:Record<string,unknown>={})=>api('/api/admin/courts/'+court.id,'PATCH',draftFor(court,sportIds,changes));
    const originalIds=shared.sports.map((s:any)=>s.id);
    assert.equal((await patch(shared,[])).status,400);
    assert.equal((await patch(shared,[...originalIds,'unknown'])).status,400);
    assert.equal((await patch(shared,[...originalIds,'badminton'],{capacity:2})).status,400);
    assert.equal((await api('/api/admin/courts/'+shared.id,'PATCH',draftFor(shared,[...originalIds,'badminton']),userId)).status,403);
    let edited=await patch(shared,[...originalIds,'badminton']);assert.equal(edited.status,200,JSON.stringify(edited.data));
    let current=edited.data.court;assert.ok(current.sports.some((s:any)=>s.id==='badminton'));
    assert.equal((await api('/api/courts/'+shared.id+'/options?sport=badminton')).status,200);
    const occupiedAt=new Date();occupiedAt.setUTCDate(occupiedAt.getUTCDate()+3);const occupiedDate=occupiedAt.toISOString().slice(0,10),sportBooking=randomUUID();
    await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players,sport_id) VALUES($1,$2,$3,600,660,$4,2,'badminton')",[sportBooking,shared.id,occupiedDate,userId]);
    assert.equal((await patch(current,originalIds)).status,409);
    assert.equal((await api('/api/courts/'+shared.id+'/options?sport=badminton')).status,200);
    assert.equal((await api('/api/courts/'+shared.id+'/availability?date='+occupiedDate+'&duration=60')).data.slots.some((slot:any)=>slot.start==='10:00'),false);
    await pool.query("UPDATE court_reservations SET status='cancelled' WHERE id=$1",[sportBooking]);
    edited=await patch(current,['tennis'],{sportId:'tennis'});assert.equal(edited.status,200,JSON.stringify(edited.data));current=edited.data.court;
    assert.deepEqual(current.sports.map((s:any)=>s.id),['tennis']);
    assert.equal((await api('/api/courts/'+shared.id+'/options?sport=football')).status,404);
    assert.equal((await api('/api/courts/'+shared.id+'/options?sport=badminton')).status,404);
    assert.ok((await api('/api/reservations/mine?view=all','GET',undefined,userId)).data.bookings.some((b:any)=>b.id===sportBooking&&b.sportId==='badminton'));
    edited=await patch(current,originalIds,{sportId:'football'});assert.equal(edited.status,200);Object.assign(shared,edited.data.court);
    assert.equal((await patch(current,originalIds,{sportId:'football'})).status,409);
    // Separate units share availability across added sports, without changing their neighbours.
    const unit=created[0].court;
    edited=await patch(unit,['badminton','tennis']);assert.equal(edited.status,200,JSON.stringify(edited.data));
    assert.equal((await api('/api/courts/'+unit.id+'/options?sport=tennis')).status,200);
    edited=await patch(edited.data.court,['badminton']);assert.equal(edited.status,200);Object.assign(unit,edited.data.court);

    const catalog=(await api('/api/courts')).data.courts;assert.equal(catalog.find((c:any)=>c.id===shared.id).sports.length,4);
    const target=created[0].court;
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version},null)).status,401);
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version},userId)).status,403);
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version+1})).status,409);
    const dateAt=new Date();dateAt.setUTCDate(dateAt.getUTCDate()+7);const date=dateAt.toISOString().slice(0,10),bookingId=randomUUID();
    await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players,sport_id) VALUES($1,$2,$3,600,660,$4,2,'badminton')",[bookingId,target.id,date,userId]);
    assert.equal((await api(`/api/favorites/${target.id}`,'PUT',undefined,userId)).status,200);
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version})).status,409);
    assert.equal((await api('/api/admin/courts')).data.courts.find((c:any)=>c.id===target.id).upcomingReservations,1);
    await pool.query("UPDATE court_reservations SET status='cancelled' WHERE id=$1",[bookingId]);
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version})).status,200);
    assert.equal((await api(`/api/admin/courts/${target.id}`,'DELETE',{version:target.version})).status,200);
    assert.ok(!(await api('/api/courts')).data.courts.some((c:any)=>c.id===target.id));assert.ok(!(await api('/api/admin/courts')).data.courts.some((c:any)=>c.id===target.id));
    assert.equal((await api(`/api/courts/${target.id}/options`)).status,404);
    assert.equal((await api(`/api/courts/${target.id}/availability?date=${date}&duration=60`)).status,404);
    assert.equal((await api(created[0].path,'POST',created[0].body)).status,409);
    assert.ok(!(await api('/api/favorites','GET',undefined,userId)).data.courtIds.includes(target.id));assert.equal((await api(`/api/favorites/${target.id}`,'PUT',undefined,userId)).status,404);
    assert.ok((await api('/api/reservations/mine?view=all','GET',undefined,userId)).data.bookings.some((b:any)=>b.id===bookingId));
    const history=await api(`/api/admin/schedule?date=${date}`);assert.ok(history.data.bookings.some((b:any)=>b.id===bookingId));
    assert.equal((await api(`/api/admin/courts/${shared.id}`,'DELETE',{version:shared.version})).status,200);
    assert.equal((await api(`/api/courts/${shared.id}/options?sport=volleyball`)).status,404);
    assert.equal((await api(created[2].path,'POST',created[2].body)).status,409);
    const vip=created[1].court;const q=await api(`/api/courts/${vip.id}/quote`,'POST',{date,start:'10:00',duration:90,players:2,equipment:[],sportId:'table-tennis'});assert.equal(q.status,200);assert.equal(q.data.pricing.segments[0].hourlyRate,(await pool.query("SELECT min(hourly_rate)::int AS amount FROM sport_time_rates WHERE sport_id='table-tennis' AND day_type=$1",[q.data.pricing.dayType])).rows[0].amount+3000);
  }finally{
    if(server)await new Promise<void>((done,fail)=>{server!.close(error=>error?fail(error):done());server!.closeAllConnections();});
    await pool.end();await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);await bootstrap.end();
  }
});
