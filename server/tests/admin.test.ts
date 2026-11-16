import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { pool,initializeDatabase } from "../src/db";
import adminRouter from "../src/routes/admin";

test("admin access, filters, paging and immediate role revocation",async()=>{
  await initializeDatabase();
  const adminId=randomUUID(),userId=randomUUID();
  const bookingIds:string[]=[];
  let server:Server|undefined;
  const day=`${3000+parseInt(userId.slice(0,3),16)}-02-01`;
  const token=(id:string,role="admin")=>"sport_booking_session="+jwt.sign({role},process.env.JWT_SECRET!,{subject:id,expiresIn:"5m",issuer:"sport-booking-api",audience:"sport-booking-client"});
  try {
    await pool.query("INSERT INTO app_users(id,name,email,password_hash,role,phone) VALUES($1,'Администратор теста',$2,'test-only','admin',NULL),($3,'Игрок теста',$4,'test-only','user','+79991234567')",[adminId,adminId+"@example.invalid",userId,userId+"@example.invalid"]);
    const courts=(await pool.query("SELECT id FROM courts ORDER BY id LIMIT 2")).rows;
    assert.ok(courts.length>=2);
    for(let i=0;i<7;i++){
      const id=randomUUID();bookingIds.push(id);
      await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players,status) VALUES($1,$2,$3,$4,$5,$6,2,$7)",[id,i===6?courts[1].id:courts[0].id,day,480+i*60,540+i*60,i%2?adminId:userId,i===0?"cancelled":"active"]);
    }
    const pastId=randomUUID();bookingIds.push(pastId);
    await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players) VALUES($1,$2,'1900-01-01',480,540,$3,2)",[pastId,courts[0].id,userId]);
    const app=express();app.use(cookieParser());app.use("/api/admin",adminRouter);
    server=await new Promise<Server>(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
    const address=server.address();assert.ok(address && typeof address!=="string");
    const api=async(query:string,id:string|null=adminId,role="admin")=>{
      const response=await fetch(`http://127.0.0.1:${address.port}/api/admin/reservations${query}`,{headers:id?{Cookie:token(id,role)}:{}});
      return {status:response.status,data:await response.json(),cache:response.headers.get("cache-control")};
    };
    assert.equal((await api("",null)).status,401);
    assert.equal((await api("",userId,"user")).status,403);
    assert.equal((await api("",userId,"admin")).status,403); // An admin claim alone grants nothing.
    const calendar=async(query:string,id:string|null=adminId)=>{
      const response=await fetch(`http://127.0.0.1:${address.port}/api/admin/schedule${query}`,{headers:id?{Cookie:token(id)}:{}});
      return {status:response.status,data:await response.json(),cache:response.headers.get("cache-control")};
    };
    assert.equal((await calendar(`?date=${day}`,null)).status,401);
    assert.equal((await calendar(`?date=${day}`,userId)).status,403);
    const schedule=await calendar(`?date=${day}`);
    assert.equal(schedule.status,200);assert.equal(schedule.cache,"no-store");
    assert.equal(schedule.data.date,day);
    assert.equal(schedule.data.bookings.length,7); // A complete day, not the list's first three records.
    assert.equal(schedule.data.bookings.filter((booking:any)=>booking.status==="cancelled").length,1);
    assert.equal(schedule.data.bookings.filter((booking:any)=>booking.courtId===courts[1].id).length,1);
    assert.ok(schedule.data.bookings.every((booking:any)=>booking.date===day));
    assert.ok(schedule.data.courts.some((court:any)=>court.id===courts[0].id));
    const hours=(await pool.query('SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1',[new Date(`${day}T00:00:00Z`).getUTCDay()])).rows[0];
    assert.deepEqual(schedule.data.openingHours,hours?{opensAt:hours.opens_at,closesAt:hours.closes_at}:null);
    for(const bad of ["","?date=2026-02-30","?date=0000-01-01","?date[]=2026-01-01",`?date=${day}&page=1`])assert.equal((await calendar(bad)).status,400,bad);
    const query=`?date=${day}&courtId=${courts[0].id}`;
    const first=await api(query);assert.equal(first.status,200);assert.equal(first.cache,"no-store");
    assert.equal(first.data.total,6);assert.equal(first.data.pageSize,3);assert.equal(first.data.totalPages,2);
    assert.deepEqual(first.data.counts,{all:6,upcoming:5,past:0,cancelled:1});
    assert.equal(first.data.bookings.length,3);assert.ok(first.data.courts.length>=2);
    assert.ok(first.data.bookings.some((booking:any)=>booking.customer.email===userId+"@example.invalid"));
    assert.ok(first.data.bookings.some((booking:any)=>booking.customer.email===adminId+"@example.invalid"));
    assert.ok(first.data.bookings.every((booking:any)=>booking.date===day && booking.courtId===courts[0].id && !("password_hash" in booking.customer)));
    assert.deepEqual(first.data.bookings.map((booking:any)=>booking.id),bookingIds.slice(1,4));
    const ascending=await api(query+'&sort=date-asc');assert.deepEqual(ascending.data.bookings.map((booking:any)=>booking.id),bookingIds.slice(0,3));
    const descending=await api(query+'&sort=date-desc');assert.deepEqual(descending.data.bookings.map((booking:any)=>booking.id),bookingIds.slice(3,6).reverse());
    for(const invalid of ['?sort=unknown','?sort[]=nearest','?sort=nearest&sort=date-asc'])assert.equal((await api(invalid)).status,400,invalid);
    const next=await api(query+"&page=2");assert.equal(next.data.bookings.length,3);assert.deepEqual(next.data.bookings.map((booking:any)=>booking.id),[bookingIds[4],bookingIds[5],bookingIds[0]]);
    const pageIds=new Set([...first.data.bookings,...next.data.bookings].map((booking:any)=>booking.id));assert.equal(pageIds.size,6);
    const clamped=await api(query+"&page=999");assert.equal(clamped.data.page,2);
    const cancelled=await api(query+"&status=cancelled");assert.equal(cancelled.data.total,1);assert.equal(cancelled.data.bookings[0].status,"cancelled");
    const upcoming=await api(query+"&status=upcoming");assert.equal(upcoming.data.total,5);assert.ok(upcoming.data.bookings.every((booking:any)=>booking.status==="active"));
    const past=await api(`?date=1900-01-01&courtId=${courts[0].id}&status=past`);assert.ok(past.data.bookings.some((booking:any)=>booking.id===pastId));
    const secondCourt=await api(`?date=${day}&courtId=${courts[1].id}`);assert.equal(secondCourt.data.total,1);
    const empty=await api(query+"&status=past");assert.equal(empty.data.total,0);assert.equal(empty.data.totalPages,1);assert.deepEqual(empty.data.bookings,[]);
    for(const invalid of ["?date=2026-02-30","?date=0000-01-01","?date[]=2026-01-01","?status=unknown","?courtId=1%20OR%201=1","?courtId=9999999999999999","?page=0","?page=1.5","?page[]=1"]){
      assert.equal((await api(invalid)).status,400,invalid);
    }
    // Search is applied before pagination and supports normalized Russian phone numbers.
    for(const term of ['игРОК ТеСТА',userId+'@EXAMPLE.INVALID','+7 (999) 123-45-67','8 (999) 123-45-67','1234567']){
      const found=await api(`?date=${day}&q=${encodeURIComponent(term)}`);assert.equal(found.status,200,term);
      assert.equal(found.data.total,4,term);assert.equal(found.data.totalPages,2);assert.equal(found.data.bookings.length,3);
      assert.ok(found.data.bookings.every((booking:any)=>booking.customer.email===userId+'@example.invalid'));
    }
    const emailQuery=encodeURIComponent(userId+'@example.invalid');
    const allDates=await api(`?q=${emailQuery}`);assert.equal(allDates.data.total,5);
    assert.deepEqual(allDates.data.bookings.map((booking:any)=>booking.id),[bookingIds[2],bookingIds[4],bookingIds[6]]);
    const historyPage=await api(`?q=${emailQuery}&page=2`);assert.deepEqual(historyPage.data.bookings.map((booking:any)=>booking.id),[pastId,bookingIds[0]]);
    const searchNext=await api(`?date=${day}&q=${emailQuery}&page=2`);assert.equal(searchNext.data.bookings.length,1);
    const searchCancelled=await api(`?date=${day}&q=${emailQuery}&status=cancelled`);assert.equal(searchCancelled.data.total,1);assert.equal(searchCancelled.data.counts.all,4);
    const byId=await api(`?q=${bookingIds[3].toUpperCase()}`);assert.equal(byId.status,200);assert.equal(byId.data.total,1);assert.equal(byId.data.bookings[0].id,bookingIds[3]);
    for(const term of ['%','_','\\',"' OR 1=1 --"]){const literal=await api(`?date=${day}&q=${encodeURIComponent(term)}`);assert.equal(literal.status,200,term);assert.equal(literal.data.total,0,term);}
    assert.equal((await api('?q='+('a'.repeat(101)))).status,400);assert.equal((await api('?q[]=name')).status,400);
    assert.equal((await api(`?q=${emailQuery}`,userId)).status,403);
    // Filter the stored booking sport, not the primary sport of a universal hall.
    const shared=(await pool.query("SELECT id,sport_id FROM courts WHERE hall_id='hall-4' AND kind='whole' LIMIT 1")).rows[0];
    assert.ok(shared);
    for(const [index,sportId] of ['football','tennis'].entries()){
      const id=randomUUID();bookingIds.push(id);
      await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players,sport_id) VALUES($1,$2,$3,$4,$5,$6,10,$7)",[id,shared.id,day,1020+index*60,1080+index*60,userId,sportId]);
    }
    for(const sport of ['football','Футбол','tennis','Теннис']){
      const result=await api(`?date=${day}&sport=${encodeURIComponent(sport)}`);assert.equal(result.status,200);
      const sportId=['football','Футбол'].includes(sport)?'football':'tennis';
      assert.equal(result.data.total,1);assert.equal(result.data.counts.all,1);
      assert.ok(result.data.bookings.every((booking:any)=>booking.sportId===sportId && booking.courtId===shared.id));
    }
    const legacySport=(await pool.query('SELECT sport_id FROM courts WHERE id=$1',[courts[0].id])).rows[0].sport_id;
    assert.equal((await api(`?date=${day}&sport=${legacySport}`)).data.total,6);
    const combination=await api(`?date=${day}&courtId=${courts[0].id}&sport=football`);assert.equal(combination.data.total,0);
    assert.equal((await api('?sport=unknown')).status,400);assert.equal((await api('?sport[]=football')).status,400);
    await pool.query("UPDATE app_users SET role='user' WHERE id=$1",[adminId]);
    assert.equal((await api(query)).status,403); // Same cookie, revoked database role.
    assert.equal((await calendar(`?date=${day}`)).status,403);
    await pool.query("UPDATE app_users SET role='admin' WHERE id=$1",[adminId]);
    assert.equal((await api(query)).status,200);
    assert.equal((await api(query,randomUUID())).status,401);
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>{server!.close(error=>error?reject(error):resolve());server!.closeAllConnections();});
    await pool.query("DELETE FROM court_reservations WHERE id=ANY($1::uuid[])",[bookingIds]);
    await pool.query("DELETE FROM app_users WHERE id=ANY($1::uuid[])",[[adminId,userId]]);
    await pool.end();
  }
});
