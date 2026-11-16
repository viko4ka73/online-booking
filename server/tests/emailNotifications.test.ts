import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { initializeDatabase,pool } from "../src/db";
import reservations from "../src/routes/reservations";
import schedule from "../src/routes/schedule";
import notifications from "../src/routes/notifications";
import auth from "../src/routes/auth";
import { deliverEmailJob,emailConfigured,ensureReminders,scheduleReminder,type EmailSender } from "../src/notifications";
import { renderBookingEmail } from "../src/emailTemplates";

test("email queue: booking lifecycle, reminders, preferences, ownership and retries", async () => {
  assert.equal(emailConfigured(),false,"Run this integration test with external email disabled (MAIL_ENABLED=false).");
  await initializeDatabase();
  await initializeDatabase(); // Migration must be safe on restart.
  const userId=randomUUID(),otherId=randomUUID();
  let server: Server | undefined;
  const cookie=(id:string) => "sport_booking_session="+jwt.sign({},process.env.JWT_SECRET!,{subject:id,expiresIn:"5m",issuer:"sport-booking-api",audience:"sport-booking-client"});
  try {
    await pool.query("INSERT INTO app_users(id,name,email,password_hash) VALUES($1,'Тест писем',$2,'test-only'),($3,'Другой игрок',$4,'test-only')",[userId,userId+"@example.invalid",otherId,otherId+"@example.invalid"]);
    const app=express();
    app.use(express.json()); app.use(cookieParser());
    app.use("/api/reservations",reservations); app.use("/api/courts",schedule);
    app.use("/api/notifications",notifications); app.use("/api/auth",auth);
    server=await new Promise<Server>(resolve=>{ const instance=app.listen(0,"127.0.0.1",()=>resolve(instance)); });
    const address=server.address(); assert.ok(address && typeof address!=="string");
    const api=async(path:string,method="GET",body?:unknown,id:string|null=userId)=>{
      const response=await fetch(`http://127.0.0.1:${address.port}/api${path}`,{method,headers:{"Content-Type":"application/json",...(id?{Cookie:cookie(id)}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return { status:response.status,data:await response.json() };
    };
    assert.equal((await api("/notifications/settings","GET",undefined,null)).status,401);
    assert.equal((await api("/notifications/settings","PATCH",{remindersEnabled:"yes"})).status,400);
    const settings=await api("/notifications/settings");
    assert.equal(settings.data.remindersEnabled,true); assert.equal(settings.data.deliveryConfigured,false);
    const court=(await pool.query("SELECT c.id,s.min_players FROM courts c JOIN sports s ON s.id=c.sport_id ORDER BY c.id LIMIT 1")).rows[0];
    const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10), duration=90;
    const available=await api(`/courts/${court.id}/availability?date=${date}&duration=${duration}`);
    assert.ok(available.data.slots.length);
    const params={date,start:available.data.slots[0].start,duration,players:court.min_players,equipment:[]};
    const quote=await api(`/courts/${court.id}/quote`,"POST",params); assert.equal(quote.status,200);
    const body={...params,courtId:court.id,requestKey:randomUUID(),expectedTotal:quote.data.pricing.totalAmount};
    const created=await api("/reservations","POST",body); assert.equal(created.status,201);
    assert.deepEqual(created.data.email,{queued:true,deliveryConfigured:false});
    const booking=created.data.booking;
    const jobs=async()=> (await pool.query("SELECT *,extract(epoch from scheduled_at) AS scheduled FROM email_notifications WHERE reservation_id=$1 ORDER BY id",[booking.id])).rows;
    let records=await jobs(); assert.equal(records.length,2); assert.equal(records[0].kind,"created"); assert.equal(records[1].kind,"reminder");
    assert.equal(Number(records[1].scheduled)*1000,new Date(`${date}T${params.start}:00+03:00`).getTime()-86400000);
    const oldReminderId=records[1].id;
    assert.equal((await api("/reservations","POST",body)).status,200); assert.equal((await jobs()).length,2);
    // Failed operations must not produce mail jobs.
    assert.equal((await api("/reservations","POST",{...body,requestKey:randomUUID()})).status,409);
    assert.equal((await jobs()).length,2);
    assert.equal((await api(`/reservations/${booking.id}/cancel`,"POST",{version:1},otherId)).status,404);
    assert.equal((await jobs()).length,2);
    const renamed=userId+"-updated@example.invalid";
    const profile=await api("/auth/me","PATCH",{name:'Тест <script> письма',email:renamed,phone:"",birthDate:"",profilePhoto:null}); assert.equal(profile.status,200);
    const delivered: Parameters<EmailSender>[0][]=[];
    const fake:EmailSender=async message=>{ delivered.push(message); };
    await deliverEmailJob(records[0].id,fake);
    assert.equal(delivered.length,1); assert.equal(delivered[0].to.address,renamed);
    assert.ok(delivered[0].html.includes("&lt;script&gt;")); assert.ok(!delivered[0].html.includes("<script>"));
    assert.ok(delivered[0].text.includes(params.start));
    await deliverEmailJob(records[0].id,fake); assert.equal(delivered.length,1);
    assert.equal((await api("/notifications/settings","PATCH",{remindersEnabled:false})).status,200);
    assert.equal((await jobs())[1].status,"skipped");
    assert.equal((await api("/notifications/settings","GET",undefined,otherId)).data.remindersEnabled,true);
    assert.equal((await api("/notifications/settings","PATCH",{remindersEnabled:true})).status,200);
    assert.equal((await jobs())[1].status,"pending");
    await ensureReminders(pool,userId); assert.equal((await jobs()).length,2);
    // A game booked less than a day ahead gets no immediate duplicate reminder.
    const soon=new Date(Date.now()+12*3600000);
    const soonDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Moscow"}).format(soon);
    const soonTime=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(soon);
    await scheduleReminder(pool,userId,{...booking,date:soonDate,start:soonTime,version:100});
    assert.equal((await jobs()).length,2);
    const nextDate=new Date(Date.now()+8*86400000).toISOString().slice(0,10);
    const times=await api(`/reservations/${booking.id}/availability?date=${nextDate}&duration=${duration}`);
    assert.ok(times.data.slots.length);
    const move={date:nextDate,start:times.data.slots[0].start,duration};
    const moveQuote=await api(`/reservations/${booking.id}/quote`,"POST",move); assert.equal(moveQuote.status,200);
    const moved=await api(`/reservations/${booking.id}/reschedule`,"PATCH",{...move,version:booking.version,expectedTotal:moveQuote.data.pricing.totalAmount}); assert.equal(moved.status,200);
    records=await jobs(); assert.equal(records.length,4); assert.equal(records[1].status,"skipped");
    assert.equal(records[2].kind,"rescheduled"); assert.equal(records[2].payload.previous.date,date); assert.equal(records[2].payload.booking.date,nextDate); assert.equal(records[3].kind,"reminder");
    // Even an accidentally reactivated reminder for an old version is suppressed.
    await pool.query("UPDATE email_notifications SET status='pending',scheduled_at=now(),next_attempt_at=now() WHERE id=$1",[oldReminderId]);
    await deliverEmailJob(oldReminderId,fake); assert.equal(delivered.length,1); assert.equal((await jobs())[1].status,"skipped");
    const moveId=records[2].id;
    await deliverEmailJob(moveId,async()=>{ throw Object.assign(new Error("Do not persist credentials or full SMTP errors"),{code:"ECONNRESET"}); });
    let failed=(await jobs()).find(row=>row.id===moveId); assert.equal(failed.status,"pending");assert.equal(failed.attempts,1);assert.equal(failed.last_error,"ECONNRESET");
    await deliverEmailJob(moveId,fake); assert.equal(delivered.length,1); // Backoff is respected.
    await pool.query("UPDATE email_notifications SET next_attempt_at=now() WHERE id=$1",[moveId]);
    await deliverEmailJob(moveId,fake); assert.equal(delivered.length,2);
    assert.equal((await jobs()).find(row=>row.id===moveId).attempts,2);
    const cancelled=await api(`/reservations/${booking.id}/cancel`,"POST",{version:moved.data.booking.version}); assert.equal(cancelled.status,200);
    records=await jobs(); assert.equal(records.length,5); assert.equal(records[3].status,"skipped"); assert.equal(records[4].kind,"cancelled");
    assert.equal((await api(`/reservations/${booking.id}/cancel`,"POST",{version:moved.data.booking.version})).status,200);
    assert.equal((await jobs()).length,5);
    await Promise.all([deliverEmailJob(records[4].id,fake),deliverEmailJob(records[4].id,fake)]);
    assert.equal(delivered.length,3); assert.ok(delivered[2].subject.includes("отменено"));
    // Transaction rollback removes the pending event along with the business operation.
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const {queueBookingEmail}=await import("../src/notifications");
      await queueBookingEmail(db,userId,"created",{...booking,version:101});
      await db.query("ROLLBACK");
    } finally { db.release(); }
    assert.equal((await jobs()).length,5);
    const rendered=renderBookingEmail("reminder",{booking},"Игрок","http://localhost:5173");
    assert.ok(rendered.text.includes("48 часов")); assert.ok(rendered.html.includes("/account"));
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>{ server!.close(error=>error?reject(error):resolve()); server!.closeAllConnections(); });
    await pool.query("DELETE FROM reservation_equipment WHERE reservation_id IN (SELECT id FROM court_reservations WHERE user_id=ANY($1::uuid[]))",[[userId,otherId]]);
    await pool.query("DELETE FROM court_reservations WHERE user_id=ANY($1::uuid[])",[[userId,otherId]]);
    await pool.query("DELETE FROM app_users WHERE id=ANY($1::uuid[])",[[userId,otherId]]);
    await pool.end();
  }
});
