import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { pool,initializeDatabase } from "../src/db";
import admin from "../src/routes/admin";
import schedule from "../src/routes/schedule";
import favorites from "../src/routes/favorites";
import { COURT_IMAGE_DIR } from "../src/courtImages";

test("court editor: permissions, persistence, image upload, capacity and concurrent updates",async()=>{
  await initializeDatabase();await initializeDatabase();
  const adminId=randomUUID(),userId=randomUUID(),bookingId=randomUUID();
  const courtId=1000000000+Math.floor(Math.random()*1000000000);
  const uploaded=new Set<string>();let server:Server|undefined;
  const token=(id:string)=>"sport_booking_session="+jwt.sign({role:"admin"},process.env.JWT_SECRET!,{subject:id,expiresIn:"5m",issuer:"sport-booking-api",audience:"sport-booking-client"});
  try {
    await pool.query("INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Тест администратора',$2,'test-only','admin'),($3,'Тест игрока',$4,'test-only','user')",[adminId,adminId+"@example.invalid",userId,userId+"@example.invalid"]);
    await pool.query(`INSERT INTO courts(id,name,sport_id,hall_id,image,capacity,description,dimensions,surface,equipment_description,hourly_rate,extra_player_hourly_rate)
      SELECT $1,'Тестовая площадка','badminton',hall_id,image,6,description,dimensions,surface,equipment_description,hourly_rate,extra_player_hourly_rate FROM courts ORDER BY id LIMIT 1`,[courtId]);
    await pool.query("INSERT INTO user_favorite_courts(user_id,court_id) VALUES($1,$2)",[userId,courtId]);
    const app=express();app.use(express.json({limit:"3mb"}));app.use(cookieParser());app.use("/api/admin",admin);app.use("/api/courts",schedule);app.use("/api/favorites",favorites);app.use("/uploads/courts",express.static(COURT_IMAGE_DIR));
    server=await new Promise<Server>(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
    const address=server.address();assert.ok(address && typeof address!=="string");
    const origin=`http://127.0.0.1:${address.port}`;
    const api=async(path:string,method="GET",body?:unknown,id:string|null=adminId)=>{
      const http=await fetch(origin+path,{method,headers:{"Content-Type":"application/json",...(id?{Cookie:token(id)}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:http.status,data:await http.json()};
    };
    assert.equal((await api("/api/admin/courts","GET",undefined,null)).status,401);
    assert.equal((await api("/api/admin/courts","GET",undefined,userId)).status,403);
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",{},userId)).status,403);
    const directory=await api("/api/admin/courts");assert.equal(directory.status,200);assert.ok(directory.data.sports.length);assert.ok(directory.data.halls.length);
    let court=directory.data.courts.find((item:any)=>item.id===courtId);assert.ok(court);assert.equal(court.version,1);assert.equal(court.hasReservations,false);assert.equal(court.hasEquipment,false);
    const body=(changes:Record<string,unknown>={})=>({version:court.version,name:court.name,sportId:court.sportId,hallId:court.hallId,image:court.image,capacity:court.capacity,description:court.description,dimensions:court.dimensions,surface:court.surface,equipmentDescription:court.equipmentDescription,...changes});
    for(const changes of [{name:""},{capacity:1},{capacity:101},{capacity:"6"},{sportId:"unknown"},{hallId:"unknown"},{image:"https://example.invalid/picture.png"},{image:"data:image/png;base64,aGVsbG8="},{role:"admin"}]){
      assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body(changes))).status,400,JSON.stringify(changes));
    }
    const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const edited=await api(`/api/admin/courts/${courtId}`,"PATCH",body({name:"Обновлённая тестовая площадка",description:"Описание обновлено администратором для проверки.",image:png,capacity:5}));
    assert.equal(edited.status,200);const previousVersion=court.version;court=edited.data.court;uploaded.add(court.image.split("/").pop());
    assert.match(court.image,/^\/uploads\/courts\/[0-9a-f-]+\.png$/);assert.equal(court.version,2);
    const image=await fetch(origin+court.image);assert.equal(image.status,200);assert.match(image.headers.get("content-type")!,/image\/png/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(png.split(",")[1],"base64"));
    const publicCatalog=await api("/api/courts","GET",undefined,null);const visible=publicCatalog.data.courts.find((item:any)=>item.id===courtId);assert.equal(visible.name,court.name);assert.equal(visible.image,court.image);assert.equal(visible.players,5);
    const savedFavorites=await api("/api/favorites","GET",undefined,userId);assert.ok(savedFavorites.data.courtIds.includes(courtId));
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body({version:previousVersion}))).status,409);
    // A configured inventory prevents silently switching its sport.
    const equipment=(await pool.query("SELECT id FROM equipment ORDER BY id LIMIT 1")).rows[0];
    await pool.query("INSERT INTO court_equipment(court_id,equipment_id,max_quantity) VALUES($1,$2,1)",[courtId,equipment.id]);
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body({sportId:"tennis"}))).status,409);
    await pool.query("DELETE FROM court_equipment WHERE court_id=$1",[courtId]);
    const unusedSport=await api(`/api/admin/courts/${courtId}`,"PATCH",body({sportId:"tennis"}));assert.equal(unusedSport.status,200);court=unusedSport.data.court;
    await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,user_id,players) VALUES($1,$2,CURRENT_DATE+7,600,660,$3,4)",[bookingId,courtId,userId]);
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body({capacity:3}))).status,409);
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body({sportId:"badminton"}))).status,409);
    const otherHall=directory.data.halls.find((hall:any)=>hall.id!==court.hallId);
    if(otherHall)assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",body({hallId:otherHall.id}))).status,409);
    const before=(await pool.query("SELECT court_id,play_date,start_minute,end_minute,players,status FROM court_reservations WHERE id=$1",[bookingId])).rows[0];
    const concurrent=await Promise.all([api(`/api/admin/courts/${courtId}`,"PATCH",body({name:"Редактор А"})),api(`/api/admin/courts/${courtId}`,"PATCH",body({name:"Редактор Б"}))]);
    assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);
    assert.deepEqual((await pool.query("SELECT court_id,play_date,start_minute,end_minute,players,status FROM court_reservations WHERE id=$1",[bookingId])).rows[0],before);
    const reloaded=await api("/api/admin/courts");const final=reloaded.data.courts.find((item:any)=>item.id===courtId);assert.equal(final.version,court.version+1);assert.equal(final.hasReservations,true);
    await pool.query("UPDATE app_users SET role='user' WHERE id=$1",[adminId]);
    assert.equal((await api(`/api/admin/courts/${courtId}`,"PATCH",{...body(),version:final.version})).status,403);
    assert.equal((await api("/api/admin/courts")).status,403);
  } finally {
    if(server)await new Promise<void>((resolve,reject)=>{server!.close(error=>error?reject(error):resolve());server!.closeAllConnections();});
    await pool.query("DELETE FROM court_reservations WHERE id=$1",[bookingId]);
    await pool.query("DELETE FROM court_equipment WHERE court_id=$1",[courtId]);
    await pool.query("DELETE FROM courts WHERE id=$1",[courtId]);
    await pool.query("DELETE FROM app_users WHERE id=ANY($1::uuid[])",[[adminId,userId]]);
    for(const filename of uploaded)if(/^[0-9a-f-]+\.png$/.test(filename))await unlink(resolve(COURT_IMAGE_DIR,filename)).catch(()=>{});
    await pool.end();
  }
});
