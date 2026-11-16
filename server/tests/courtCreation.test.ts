import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { initializeDatabase,pool } from "../src/db";
import admin from "../src/routes/admin";
import schedule from "../src/routes/schedule";
import { COURT_IMAGE_DIR } from "../src/courtImages";

test("court creation: publication, pricing, photos, validation and idempotency",async()=>{
  await initializeDatabase();await initializeDatabase();
  const adminId=randomUUID(),userId=randomUUID(),testHallId="test-"+randomUUID();
  const created=new Set<number>(),images=new Set<string>();let server:Server|undefined;
  try {
    await pool.query("INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Создание площадок',$2,'test-only','admin'),($3,'Тест игрока',$4,'test-only','user')",[adminId,adminId+"@example.invalid",userId,userId+"@example.invalid"]);
    const app=express();app.use(express.json({limit:"3mb"}));app.use(cookieParser());app.use("/api/admin",admin);app.use("/api/courts",schedule);app.use("/uploads/courts",express.static(COURT_IMAGE_DIR));
    server=await new Promise<Server>(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
    const address=server.address();assert.ok(address && typeof address!=="string");const origin=`http://127.0.0.1:${address.port}`;
    const token=(id:string)=>"sport_booking_session="+jwt.sign({role:"admin"},process.env.JWT_SECRET!,{subject:id,expiresIn:"5m",issuer:"sport-booking-api",audience:"sport-booking-client"});
    const api=async(path:string,method="GET",body?:unknown,id:string|null=adminId)=>{
      const response=await fetch(origin+path,{method,headers:{"Content-Type":"application/json",...(id?{Cookie:token(id)}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();
      if(response.ok && method!=="GET" && data.court){created.add(data.court.id);if(data.court.image.startsWith("/uploads/courts/"))images.add(data.court.image.split("/").pop());}
      return {status:response.status,data};
    };
    await pool.query("INSERT INTO halls(id,name,rental_mode) VALUES($1,$2,'units')",[testHallId,'Тестовый зал '+testHallId]);
    await pool.query('INSERT INTO hall_sports SELECT $1,id FROM sports',[testHallId]);
    const directory=await api("/api/admin/courts");assert.equal(directory.status,200);
    const photo="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const body={requestKey:randomUUID(),name:"Тест создания "+adminId,sportId:"badminton",hallId:testHallId,image:photo,capacity:4,description:"Новая площадка для проверки сценария создания.",dimensions:"13,4 × 6,1 м",surface:"Спортивное покрытие",equipmentDescription:""};
    assert.equal((await api("/api/admin/courts","POST",body,null)).status,401);
    assert.equal((await api("/api/admin/courts","POST",body,userId)).status,403);
    for(const changes of [{name:""},{description:"Мало"},{requestKey:"invalid"},{sportId:"unknown"},{hallId:"unknown"},{capacity:1},{capacity:2,sportId:"football"},{image:""},{image:"/images/home/unknown.png"},{image:"data:image/png;base64,aGVsbG8="},{role:"admin"}]){
      const result=await api("/api/admin/courts","POST",{...body,...changes});assert.equal(result.status,400,JSON.stringify(changes));
    }
    const first=await api("/api/admin/courts","POST",body);assert.equal(first.status,201);const court=first.data.court;
    assert.ok(court.id>0);assert.equal(court.version,1);assert.equal(court.hasReservations,false);assert.equal(court.hasEquipment,false);
    assert.equal(court.name,body.name);assert.equal(court.sportId,"badminton");assert.equal(court.capacity,4);
    assert.match(court.image,/^\/uploads\/courts\/[0-9a-f-]+\.png$/);
    const replay=await api("/api/admin/courts","POST",body);assert.equal(replay.status,200);assert.equal(replay.data.court.id,court.id);assert.equal(replay.data.court.image,court.image);
    const upper=await api("/api/admin/courts","POST",{...body,requestKey:body.requestKey.toUpperCase()});assert.equal(upper.status,200);assert.equal(upper.data.court.id,court.id);
    assert.equal((await api("/api/admin/courts","POST",{...body,name:body.name+" changed"})).status,409);
    assert.equal(Number((await pool.query("SELECT count(*) FROM court_creation_requests WHERE user_id=$1",[adminId])).rows[0].count),1);
    const publicCatalog=await api("/api/courts","GET",undefined,null);assert.ok(publicCatalog.data.courts.some((item:any)=>item.id===court.id && item.image===court.image));
    const options=await api(`/api/courts/${court.id}/options`,"GET",undefined,null);assert.equal(options.status,200);assert.deepEqual(options.data.court.equipment,[]);assert.ok(options.data.court.rates.length);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Moscow"}).format(new Date());const target=new Date(today+"T00:00:00Z");target.setUTCDate(target.getUTCDate()+7);const date=target.toISOString().slice(0,10);
    const availability=await api(`/api/courts/${court.id}/availability?date=${date}&duration=60`,"GET",undefined,null);assert.equal(availability.status,200);assert.ok(availability.data.slots.length);
    const quote=await api(`/api/courts/${court.id}/quote`,"POST",{date,start:availability.data.slots[0].start,duration:60,players:2,equipment:[]},null);assert.equal(quote.status,200);assert.ok(quote.data.pricing.totalAmount>0);assert.equal(quote.data.pricing.equipmentAmount,0);
    const calendar=await api(`/api/admin/schedule?date=${date}`);assert.ok(calendar.data.courts.some((item:any)=>item.id===court.id));
    const image=await fetch(origin+court.image);assert.equal(image.status,200);assert.match(image.headers.get("content-type")!,/image\/png/);
    // Same request, even with a differently cased UUID, creates only one row under concurrency.
    const next={...body,requestKey:randomUUID(),name:body.name+" concurrent",sportId:"football",capacity:10};
    const concurrent=await Promise.all([api("/api/admin/courts","POST",next),api("/api/admin/courts","POST",{...next,requestKey:next.requestKey.toUpperCase()})]);
    assert.deepEqual(concurrent.map(item=>item.status).sort(),[200,201]);assert.equal(concurrent[0].data.court.id,concurrent[1].data.court.id);assert.notEqual(concurrent[0].data.court.id,court.id);
    assert.equal(Number((await pool.query("SELECT count(*) FROM court_creation_requests WHERE user_id=$1",[adminId])).rows[0].count),2);
    await pool.query("UPDATE app_users SET role='user' WHERE id=$1",[adminId]);
    assert.equal((await api("/api/admin/courts","POST",{...body,requestKey:randomUUID()})).status,403);
  } finally {
    if(server)await new Promise<void>((resolve,reject)=>{server!.close(error=>error?reject(error):resolve());server!.closeAllConnections();});
    const owned=await pool.query("SELECT c.id,c.image FROM courts c JOIN court_creation_requests cr ON cr.court_id=c.id WHERE cr.user_id=$1",[adminId]);
    for(const row of owned.rows){created.add(row.id);images.add(row.image.split("/").pop());}
    await pool.query("DELETE FROM courts WHERE id=ANY($1::int[])",[[...created]]);
    await pool.query("DELETE FROM halls WHERE id=$1",[testHallId]);
    await pool.query("DELETE FROM app_users WHERE id=ANY($1::uuid[])",[[adminId,userId]]);
    for(const file of images)if(/^[0-9a-f-]+\.png$/.test(file))await unlink(resolve(COURT_IMAGE_DIR,file)).catch(()=>{});
    await pool.end();
  }
});
