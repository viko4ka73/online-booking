import type { PoolClient } from "pg";
import { Router,type Request,type Response } from "express";
import { pool } from "../db";
import { MAX_BOOKING_MINUTES,lockBookingDays,availableSlots, scheduleError } from "../booking";
import { getCourtOptions, lockCourtPricing } from "../catalog";
import { calculatePrice } from "../pricing";
import { sessionUserId } from "./auth";
import { queueBookingEmail, emailQueueStatus } from "../notifications";

import {fulfillWaitlist} from '../waitlist';
const router = Router();
import { fields,fromBookings,canModify,canAdminModify,publicBooking,type BookingRow,type Equipment } from "../reservationView";

router.get("/mine", async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт." });
  const view = req.query.view ?? "upcoming";
  const requestedPage = req.query.page === undefined ? 1 : typeof req.query.page === "string" ? Number(req.query.page) : NaN;
  if (!["upcoming","past","cancelled","all"].includes(view as string) ||
      !Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000000) {
    return res.status(400).json({ error: "Проверьте раздел и номер страницы." });
  }
  const pageSize = 3;
  const isUpcoming = "r.status = 'active' AND (r.play_date + r.end_minute * interval '1 minute') > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')";
  const isPast = "r.status = 'active' AND (r.play_date + r.end_minute * interval '1 minute') <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')";
  const condition = view === "all" ? "TRUE" : view === "upcoming" ? isUpcoming : view === "cancelled" ? "r.status = 'cancelled'" : isPast;
  const direction = view === "upcoming" ? "ASC" : "DESC";
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const totals = await client.query<{ all: number; upcoming: number; past: number; cancelled: number }>(
      `SELECT count(*)::int AS all,
        count(*) FILTER (WHERE ${isUpcoming})::int AS upcoming,
        count(*) FILTER (WHERE ${isPast})::int AS past,
        count(*) FILTER (WHERE r.status='cancelled')::int AS cancelled
       FROM court_reservations r WHERE r.user_id=$1`, [userId],
    );
    const counts = totals.rows[0];
    const total = counts[view as keyof typeof counts];
    const totalPages = Math.max(1,Math.ceil(total/pageSize));
    const page = Math.min(requestedPage,totalPages);
    const result = await client.query<BookingRow>(
      `SELECT ${fields} ${fromBookings} WHERE r.user_id=$1 AND ${condition}
       ORDER BY r.play_date ${direction},r.start_minute ${direction},r.id ${direction}
       LIMIT $2 OFFSET $3`,
      [userId,pageSize,(page-1)*pageSize],
    );
    await client.query("COMMIT");
    res.set("Cache-Control","no-store");
    return res.json({ bookings: result.rows.map(publicBooking),counts,total,page,pageSize,totalPages });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export async function createReservation(req:Request,res:Response,adminId?:string){
  let userId = adminId?null:sessionUserId(req);
  let guest:{name:string;phone:string}|null=null;
  if(adminId){
    const customer=req.body?.customer;
    if(customer?.mode==='account'){
      const email=typeof customer.email==='string'?customer.email.trim().toLowerCase():'';
      if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Укажите почту аккаунта посетителя.'});
      userId=(await pool.query<{id:string}>('SELECT id FROM app_users WHERE lower(email)=$1',[email])).rows[0]?.id??null;
      if(!userId)return res.status(400).json({error:'Аккаунт с такой почтой не найден. Проверьте адрес или выберите посетителя без регистрации.'});
    }else if(customer?.mode==='guest'){
      const name=typeof customer.name==='string'?customer.name.trim():'';
      const phone=typeof customer.phone==='string'?customer.phone.trim():'';
      if(name.length<2||name.length>100||phone.length>24||!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)return res.status(400).json({error:'Укажите имя посетителя и корректный номер телефона.'});
      guest={name,phone};
    }else return res.status(400).json({error:'Выберите посетителя для записи.'});
  }
  if (!adminId&&!userId) return res.status(401).json({ error: "Войдите в аккаунт, чтобы забронировать площадку." });

  const { courtId, sportId, date, duration, start, players, requestKey, expectedTotal, equipment: requestedEquipment } = req.body ?? {};
  if (sportId !== undefined && typeof sportId !== "string") return res.status(400).json({error:"Выберите вид спорта."});
  const court = Number.isSafeInteger(courtId) && courtId > 0 ? await getCourtOptions(courtId,undefined,sportId) : null;
  if (!court) return res.status(400).json({ error: "Выберите площадку." });
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof start !== "string" || !/^([01]\d|2[0-3]):(00|30)$/.test(start) ||
      typeof duration !== "number" || !Number.isInteger(duration) || duration < 60 || duration > MAX_BOOKING_MINUTES || duration % 30 !== 0) {
    return res.status(400).json({ error: "Проверьте дату, время и длительность." });
  }
  const parsedDate = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: "Укажите корректную дату." });
  }
  if (!Number.isInteger(players) || players < court.minPlayers || players > court.capacity) {
    return res.status(400).json({ error: `Допустимо от ${court.minPlayers} до ${court.capacity} игроков.` });
  }
  if (typeof requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
    return res.status(400).json({ error: "Обновите форму бронирования." });
  }
  if (!Array.isArray(requestedEquipment) || requestedEquipment.length > court.equipment.length) {
    return res.status(400).json({ error: "Проверьте выбранный инвентарь." });
  }
  const quantities = new Map<string, number>();
  for (const item of requestedEquipment) {
    const option = court.equipment.find(({ id }) => id === item?.id);
    if (!option || quantities.has(option.id) || !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > option.max) {
      return res.status(400).json({ error: "Недопустимое количество инвентаря." });
    }
    quantities.set(option.id, item.quantity);
  }
  const equipment: Equipment[] = court.equipment
    .filter(({ id }) => (quantities.get(id) ?? 0) > 0)
    .map(({ id, name }) => ({ id, name, quantity: quantities.get(id)! }));
  const startMinute = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if(adminId)await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`admin-reservation|${adminId}|${requestKey}`]);
    // Serialize checks and writes for one court and day, including the 30-minute-gap rule.
    await lockBookingDays(client,[{courtId:court.id,date}]);
    const existing = await client.query<BookingRow & {user_id:string|null;guest_name:string|null;guest_phone:string|null}>(
      `SELECT ${fields},r.user_id,r.guest_name,r.guest_phone ${fromBookings} WHERE ${adminId?'r.created_by':'r.user_id'} = $1 AND r.request_key = $2`, [adminId??userId, requestKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if ((adminId && (row.user_id!==userId || row.guest_name!==(guest?.name??null) || row.guest_phone!==(guest?.phone??null))) || row.sport_id !== court.sportId || row.court_id !== court.id || row.play_date !== date || row.start_minute !== startMinute ||
          row.end_minute !== startMinute + duration || row.players !== players ||
          (row.equipment.length !== equipment.length || equipment.some((item) => !row.equipment.some((saved) => saved.id === item.id && saved.quantity === item.quantity)))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Эта попытка бронирования уже обработана. Обновите форму." });
      }
      await client.query("COMMIT");
      return res.json({ booking: publicBooking(row), email:userId?emailQueueStatus():{queued:false} });
    }
    await lockCourtPricing(court.id,client,court.sportId);
    const currentCourt = await getCourtOptions(court.id, client,court.sportId);
    if (!currentCourt || players < currentCourt.minPlayers || players > currentCourt.capacity ||
        [...quantities].some(([id, quantity]) => {
          const item = currentCourt.equipment.find((option) => option.id === id);
          return !item || quantity > item.max;
        })) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Параметры площадки изменились. Обновите форму." });
    }
    const pricing = calculatePrice(currentCourt, date, start, duration, players, quantities);
    if (!pricing) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "На этот промежуток нет тарифа. Выберите время в пределах часов работы." });
    }
    if (!Number.isSafeInteger(expectedTotal) || expectedTotal !== pricing.totalAmount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Стоимость изменилась. Обновите расписание и проверьте новую сумму перед подтверждением." });
    }
    const error = scheduleError(date, duration);
    if (error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error });
    }
    const slots = await availableSlots(court.id, date, duration, client,null,court.sportId);
    if (!slots.some((slot) => slot.start === start)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Это время уже недоступно. Выберите другой интервал." });
    }
    const account = userId?await client.query("SELECT id FROM app_users WHERE id = $1", [userId]):null;
    if (userId&&!account?.rows.length) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Войдите в аккаунт заново." });
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO court_reservations (court_id,play_date,start_minute,end_minute,user_id,players,request_key,pricing,sport_id,created_by,guest_name,guest_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) RETURNING id`,
      [court.id,date,startMinute,startMinute+duration,userId,players,requestKey,JSON.stringify(pricing),currentCourt.sportId,adminId??null,guest?.name??null,guest?.phone??null],
    );
    const bookingId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO reservation_equipment (reservation_id,equipment_id,equipment_name,quantity)
       SELECT $1,item.id,item.name,item.quantity FROM jsonb_to_recordset($2::jsonb) AS item(id text,name text,quantity int)`,
      [bookingId,JSON.stringify(pricing.equipment)],
    );
    const result = await client.query<BookingRow>(`SELECT ${fields} ${fromBookings} WHERE r.id=$1`, [bookingId]);
    if(userId)await fulfillWaitlist(client,userId,court.id,currentCourt.sportId,date,startMinute,duration);
    if(userId)await queueBookingEmail(client,userId,"created",publicBooking(result.rows[0]));
    await client.query("COMMIT");
    return res.status(201).json({ booking: publicBooking(result.rows[0]), email:userId?emailQueueStatus():{queued:false} });
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return res.status(409).json({ error: "Запрос уже обработан. Проверьте бронирования в личном кабинете." });
    }
    throw error;
  } finally {
    client.release();
  }
}
router.post("/",(req,res)=>createReservation(req,res));

router.param("id", (_req,res,next,id) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: "Некорректный номер брони." });
  }
  next();
});

async function ownedBooking(id: string, userId: string, db: Pick<PoolClient,"query"> = pool, lock = false, admin = false) {
  const result = await db.query<BookingRow & {user_id:string|null}>(
    `SELECT ${fields},r.user_id ${fromBookings} WHERE r.id=$1 AND ($3::boolean OR r.user_id=$2)${lock ? " FOR UPDATE OF r" : ""}`,
    [id,userId,admin],
  );
  return result.rows[0];
}

async function lockDays(client: PoolClient, courtId: number, dates: string[]) {
  await lockBookingDays(client,dates.map(date=>({courtId,date})));
}

function changeError(body: { date?: unknown; duration?: unknown; start?: unknown }) {
  const error = scheduleError(body.date,body.duration);
  if (error) return error;
  if (typeof body.start !== "string" || !/^([01]\d|2[0-3]):(00|30)$/.test(body.start)) return "Выберите корректное время начала.";
  return null;
}

function targetCourt(value:unknown,row:BookingRow){
 if(value===undefined)return row.court_id;
 return Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=2147483647?Number(value):null;
}

export async function reservationCourts(req:Request<{id:string}>,res:Response,adminId?:string){
 const userId=adminId??sessionUserId(req);
 if(!userId)return res.status(401).json({error:'Войдите в аккаунт.'});
 const row=await ownedBooking(req.params.id,userId,pool,false,Boolean(adminId));
 if(!row)return res.status(404).json({error:"Бронь не найдена."});
 if(!(adminId?canAdminModify(row):canModify(row)))return res.status(403).json({error:adminId?"Изменять можно только предстоящие активные записи.":"Перенос доступен не позднее чем за 48 часов до игры."});
 res.set("Cache-Control","no-store");
 const courts=await pool.query(`SELECT c.id,o.name,h.name AS hall FROM courts c JOIN court_sport_options o ON o.court_id=c.id JOIN halls h ON h.id=c.hall_id WHERE o.sport_id=$1 AND c.capacity>=$2 AND o.min_players<=$2 ORDER BY h.name,c.resource_number,c.id`,[row.sport_id,row.players]);
 return res.json({courts:courts.rows});
}

router.get("/:id/courts",(req,res)=>reservationCourts(req,res));

async function changedPrice(row: BookingRow, date: string, start: string, duration: number, db: Pick<PoolClient,"query"> = pool) {
  const court = await getCourtOptions(row.court_id,db,row.sport_id);
  if (!court || row.players < court.minPlayers || row.players > court.capacity ||
      row.equipment.some((item) => {
        const option = court.equipment.find(({ id }) => id === item.id);
        return !option || item.quantity > option.max;
      })) return null;
  return calculatePrice(court,date,start,duration,row.players,new Map(row.equipment.map((item) => [item.id,item.quantity])));
}

router.get("/:id/repeat", async (req,res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт, чтобы повторить бронирование." });
  const row = await ownedBooking(req.params.id,userId);
  if (!row) return res.status(404).json({ error: "Бронь не найдена." });
  res.set("Cache-Control","no-store");
  return res.json({ booking: publicBooking(row) });
});

export async function reservationAvailability(req:Request<{id:string}>,res:Response,adminId?:string){
  const userId = adminId??sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт." });
  const row = await ownedBooking(req.params.id,userId,pool,false,Boolean(adminId));
  if (!row) return res.status(404).json({ error: "Бронь не найдена." });
  if (!(adminId?canAdminModify(row):canModify(row))) return res.status(403).json({ error: adminId?"Изменять можно только предстоящие активные записи.":"Отмена и перенос доступны не позднее чем за 48 часов до игры." });
  const date = req.query.date;
  const duration = typeof req.query.duration === "string" ? Number(req.query.duration) : NaN;
  const error = scheduleError(date,duration);
  if (error) return res.status(400).json({ error });
  const target=targetCourt(req.query.courtId===undefined?undefined:typeof req.query.courtId==='string'&&/^[1-9][0-9]*$/.test(req.query.courtId)?Number(req.query.courtId):null,row);
  if(!target)return res.status(400).json({error:'Выберите допустимую площадку.'});
  if(target!==row.court_id){
   const option=await getCourtOptions(target,undefined,row.sport_id);
   if(!option||row.players<option.minPlayers||row.players>option.capacity||row.equipment.some(item=>!option.equipment.some(e=>e.id===item.id&&e.max>=item.quantity)))return res.status(409).json({error:'На этой площадке недоступен выбранный инвентарь или количество игроков. Выберите другую площадку.'});
  }
  const slots = await availableSlots(target,date as string,duration,pool,row.id,row.sport_id);
  res.set("Cache-Control","no-store");
  return res.json({ slots });
}
router.get("/:id/availability",(req,res)=>reservationAvailability(req,res));

export async function reservationQuote(req:Request<{id:string}>,res:Response,adminId?:string){
  const userId = adminId??sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт." });
  const row = await ownedBooking(req.params.id,userId,pool,false,Boolean(adminId));
  if (!row) return res.status(404).json({ error: "Бронь не найдена." });
  if (!(adminId?canAdminModify(row):canModify(row))) return res.status(403).json({ error: adminId?"Изменять можно только предстоящие активные записи.":"Отмена и перенос доступны не позднее чем за 48 часов до игры." });
  const error = changeError(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const target=targetCourt(req.body?.courtId,row);
  if(!target)return res.status(400).json({error:'Выберите допустимую площадку.'});
  const pricing = await changedPrice({...row,court_id:target},req.body.date,req.body.start,req.body.duration);
  if (!pricing) return res.status(409).json({ error: "На это время нет тарифа или изменились условия инвентаря." });
  res.set("Cache-Control","no-store");
  return res.json({ pricing });
}
router.post("/:id/quote",(req,res)=>reservationQuote(req,res));

export async function cancelReservation(req:Request<{id:string}>,res:Response,adminId?:string){
  const userId = adminId??sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт." });
  if (!Number.isSafeInteger(req.body?.version) || req.body.version < 1) {
    return res.status(400).json({ error: "Обновите список бронирований." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await ownedBooking(req.params.id,userId,client,true,Boolean(adminId));
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Бронь не найдена." }); }
    if (row.status === "cancelled") {
      await client.query("COMMIT");
      return res.json({ booking: publicBooking(row), email:row.user_id?emailQueueStatus():{queued:false} });
    }
    await lockDays(client,row.court_id,[row.play_date]);
    if (row.version !== req.body.version) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Бронь уже изменилась. Обновите список." });
    }
    if (!(adminId?canAdminModify(row):canModify(row))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: adminId?"Изменять можно только предстоящие активные записи.":"До начала игры осталось меньше 48 часов. Отмена недоступна." });
    }
    await client.query("UPDATE court_reservations SET status='cancelled',cancelled_at=now(),updated_at=now(),version=version+1 WHERE id=$1", [row.id]);
    const updated = await ownedBooking(row.id,userId,client,false,Boolean(adminId));
    if(updated.user_id)await queueBookingEmail(client,updated.user_id,"cancelled",publicBooking(updated));
    await client.query("COMMIT");
    return res.json({ booking: publicBooking(updated), email:row.user_id?emailQueueStatus():{queued:false} });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
router.post("/:id/cancel",(req,res)=>cancelReservation(req,res));

export async function rescheduleReservation(req:Request<{id:string}>,res:Response,adminId?:string){
  const userId = adminId??sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт." });
  const error = changeError(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const { date,start,duration,expectedTotal,version } = req.body;
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(expectedTotal) || expectedTotal < 0) {
    return res.status(400).json({ error: "Проверьте стоимость и обновите список бронирований." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await ownedBooking(req.params.id,userId,client,true,Boolean(adminId));
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Бронь не найдена." }); }
    if (row.version !== version) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Бронь уже изменилась. Обновите список." });
    }
    const target=targetCourt(req.body?.courtId,row);
    if(!target){await client.query('ROLLBACK');return res.status(400).json({error:'Выберите допустимую площадку.'});}
    await lockBookingDays(client,[{courtId:row.court_id,date:row.play_date},{courtId:target,date}]);
    if (!(adminId?canAdminModify(row):canModify(row))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: adminId?"Изменять можно только предстоящие активные записи.":"Перенос доступен не позднее чем за 48 часов до игры." });
    }
    await lockCourtPricing(target,client,row.sport_id);
    const pricing = await changedPrice({...row,court_id:target},date,start,duration,client);
    if (!pricing || pricing.totalAmount !== expectedTotal) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Стоимость или условия изменились. Обновите расчёт перед подтверждением." });
    }
    const slots = await availableSlots(target,date,duration,client,row.id,row.sport_id);
    if (!slots.some((slot) => slot.start === start)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Это время уже недоступно. Выберите другой интервал." });
    }
    if (!(adminId?canAdminModify(row):canModify(row))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: adminId?"Изменять можно только предстоящие активные записи.":"До начала игры осталось меньше 48 часов. Перенос недоступен." });
    }
    const startMinute = Number(start.slice(0,2))*60+Number(start.slice(3));
    await client.query(
      `UPDATE court_reservations SET court_id=$6,play_date=$2,start_minute=$3,end_minute=$4,pricing=$5::jsonb,
        updated_at=now(),version=version+1 WHERE id=$1`,
      [row.id,date,startMinute,startMinute+duration,JSON.stringify(pricing),target],
    );
    await client.query(
      `UPDATE reservation_equipment re SET equipment_name=item.name
        FROM jsonb_to_recordset($2::jsonb) AS item(id text,name text) WHERE re.reservation_id=$1 AND re.equipment_id=item.id`,
      [row.id,JSON.stringify(pricing.equipment)],
    );
    const updated = await ownedBooking(row.id,userId,client,false,Boolean(adminId));
    if(updated.user_id)await fulfillWaitlist(client,updated.user_id,target,row.sport_id,date,startMinute,duration);
    if(updated.user_id)await queueBookingEmail(client,updated.user_id,"rescheduled",publicBooking(updated),publicBooking(row));
    await client.query("COMMIT");
    return res.json({ booking: publicBooking(updated), email:row.user_id?emailQueueStatus():{queued:false} });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
router.patch("/:id/reschedule",(req,res)=>rescheduleReservation(req,res));

export default router;
