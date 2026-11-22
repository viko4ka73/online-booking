import {attachAdjacency} from "../adjacency";
import { reservationCourts,createReservation,reservationAvailability,reservationQuote,cancelReservation,rescheduleReservation } from "./reservations";
import { Router } from "express";
import { pool } from "../db";
import { adminSearchPatterns,adminBookingSearch } from "../adminSearch";
import { sessionUserId } from "./auth";
import adminCourtsRouter from "./adminCourts";
import adminHallsRouter from "./adminHalls";
import { fields,fromBookings,publicBooking,canAdminModify,type BookingRow } from "../reservationView";

import adminCommercialRouter from './adminCommercial';
import adminBlocksRouter from './adminBlocks';
import { blockFields,blockFrom,publicTimeBlock,type TimeBlockRow } from '../timeBlocks';
const router = Router();
router.use(async (req,res,next) => {
  res.set("Cache-Control","no-store");
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error:"Войдите в аккаунт администратора." });

  const { rows } = await pool.query<{role:string}>("SELECT role FROM app_users WHERE id=$1",[userId]);
  if (!rows.length) return res.status(401).json({ error:"Аккаунт не найден. Войдите заново." });
  if (rows[0].role !== "admin") return res.status(403).json({ error:"Этот раздел доступен только администратору." });
  res.locals.adminId = userId;
  next();
});

router.get('/customers/lookup',async(req,res)=>{
 const email=typeof req.query.email==='string'?req.query.email.trim().toLowerCase():'';
 if(Object.keys(req.query).some(key=>key!=='email')||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Укажите корректную почту аккаунта.'});
 const result=await pool.query<{id:string;name:string;email:string;phone:string|null}>('SELECT id,name,email,phone FROM app_users WHERE lower(email)=$1 LIMIT 1',[email]);
 return res.json({customer:result.rows[0]??null});
});
router.post("/reservations",(req,res)=>createReservation(req,res,res.locals.adminId));
router.param('id',(_req,res,next,id)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Некорректный номер брони.'});next();});
router.get('/reservations/:id/courts',(req,res)=>reservationCourts(req,res,res.locals.adminId));
router.get('/reservations/:id/availability',(req,res)=>reservationAvailability(req,res,res.locals.adminId));
router.post('/reservations/:id/quote',(req,res)=>reservationQuote(req,res,res.locals.adminId));
router.post('/reservations/:id/cancel',(req,res)=>cancelReservation(req,res,res.locals.adminId));
router.patch('/reservations/:id/reschedule',(req,res)=>rescheduleReservation(req,res,res.locals.adminId));

router.use("/commercial",adminCommercialRouter);
router.use("/blocks",adminBlocksRouter);
router.use("/courts",adminCourtsRouter);
router.use("/halls",adminHallsRouter);

router.get("/schedule", async (req,res) => {
  const date = req.query.date;
  if (Object.keys(req.query).some(key => key !== "date") || typeof date !== "string") {
    return res.status(400).json({ error:"Выберите дату расписания." });
  }
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(NaN);
  if (date < "0001-01-01" || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) {
    return res.status(400).json({ error:"Укажите корректную дату." });
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const bookings = await db.query<BookingRow & {customer_name:string|null;customer_email:string|null;customer_phone:string|null}>(`
      SELECT ${fields},COALESCE(r.guest_name,u.name) AS customer_name,u.email AS customer_email,COALESCE(r.guest_phone,u.phone) AS customer_phone
      ${fromBookings} LEFT JOIN app_users u ON u.id=r.user_id
      WHERE r.play_date=$1 ORDER BY r.start_minute,r.court_id,r.id`,[date]);
    const courts = await db.query(`SELECT c.id,c.name,c.kind,c.resource_number AS "resourceNumber",h.id AS "hallId",h.rental_mode AS "rentalMode",CASE WHEN h.rental_mode='whole' THEN 'Универсальный зал' ELSE s.name END AS sport,h.name AS hall,
      ARRAY(SELECT ss.name FROM court_sport_options o JOIN sports ss ON ss.id=o.sport_id WHERE o.court_id=c.id ORDER BY ss.name) AS sports FROM courts c
      JOIN sports s ON s.id=c.sport_id JOIN halls h ON h.id=c.hall_id WHERE c.deleted_at IS NULL OR EXISTS(SELECT 1 FROM court_reservations saved WHERE saved.court_id=c.id AND saved.play_date=$1) OR EXISTS(SELECT 1 FROM court_time_blocks b WHERE b.court_id=c.id AND b.play_date=$1) ORDER BY CASE WHEN h.id='badminton-hall' THEN 1 WHEN h.id='table-tennis-hall' THEN 2 ELSE 3 END,c.resource_number NULLS LAST,h.name,c.id`,[date]);
    const blocks=await db.query<TimeBlockRow>("SELECT "+blockFields+" "+blockFrom+" WHERE b.play_date=$1 AND b.status='active' ORDER BY b.start_minute",[date]);
    const hours = await db.query<{opensAt:number;closesAt:number}>(`SELECT opens_at AS "opensAt",closes_at AS "closesAt"
      FROM opening_hours WHERE weekday=$1`,[parsed.getUTCDay()]);
    await db.query("COMMIT");
    return res.json({date,blocks:blocks.rows.map(publicTimeBlock),courts:await attachAdjacency(db,courts.rows),openingHours:hours.rows[0] ?? null,
      bookings:bookings.rows.map(row => ({...publicBooking(row),canModify:canAdminModify(row),customer:{name:row.customer_name,email:row.customer_email,phone:row.customer_phone}})),
    });
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
});

router.get("/reservations", async (req,res) => {
  if (Object.keys(req.query).some(key => !["date","courtId","sport","status","page","q","sort"].includes(key))) {
    return res.status(400).json({ error:"Неизвестный параметр фильтра." });
  }
  const date = req.query.date ?? "";
  const court = req.query.courtId ?? "";
  const sport = req.query.sport ?? "";
  const search = req.query.q ?? "";
  const sort = req.query.sort ?? "nearest";
  const view = req.query.status ?? "all";
  const pageValue = req.query.page ?? "1";
  if (typeof search !== "string" || search.length>100 || typeof date !== "string" || typeof court !== "string" || typeof sport !== "string" || sport.length>100 || typeof view !== "string" || typeof sort !== "string" || !["nearest","date-asc","date-desc"].includes(sort) || typeof pageValue !== "string") {
    return res.status(400).json({ error:"Проверьте фильтры бронирований." });
  }
  if (date) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(NaN);
    if (date < "0001-01-01" || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return res.status(400).json({ error:"Укажите корректную дату." });
  }
  const {pattern,phonePattern}=adminSearchPatterns(search);
  const courtId = court ? Number(court) : null;
  const requestedPage = Number(pageValue);
  if ((court && (!/^[1-9]\d*$/.test(court) || !Number.isSafeInteger(courtId) || courtId! > 2147483647)) ||
      !["all","upcoming","past","cancelled"].includes(view) || !/^[1-9]\d*$/.test(pageValue) ||
      !Number.isSafeInteger(requestedPage) || requestedPage > 1000000) {
    return res.status(400).json({ error:"Проверьте площадку, статус и номер страницы." });
  }
  const isUpcoming = "r.status='active' AND (r.play_date+r.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')";
  const isPast = "r.status='active' AND (r.play_date+r.end_minute*interval '1 minute')<=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')";
  const condition = view === "upcoming" ? isUpcoming : view === "past" ? isPast : view === "cancelled" ? "r.status='cancelled'" : "TRUE";
  const base = `($1::date IS NULL OR r.play_date=$1) AND ($2::int IS NULL OR r.court_id=$2) AND ($3::text IS NULL OR COALESCE(r.sport_id,(SELECT fc.sport_id FROM courts fc WHERE fc.id=r.court_id))=$3) AND ${adminBookingSearch}`;
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const selectedSport = sport ? (await db.query<{id:string}>('SELECT id FROM sports WHERE id=$1 OR name=$1',[sport])).rows[0]?.id : null;
    if (sport && !selectedSport) { await db.query('ROLLBACK');return res.status(400).json({error:'Выберите существующий вид спорта.'}); }
    const totals = await db.query<{all:number;upcoming:number;past:number;cancelled:number}>(`
      SELECT count(*)::int AS all,count(*) FILTER(WHERE ${isUpcoming})::int AS upcoming,
        count(*) FILTER(WHERE ${isPast})::int AS past,count(*) FILTER(WHERE r.status='cancelled')::int AS cancelled
      FROM court_reservations r WHERE ${base}`,[date || null,courtId,selectedSport,pattern,phonePattern]);
    const counts = totals.rows[0];
    const total = counts[view as keyof typeof counts];
    const pageSize = 3;
    const totalPages = Math.max(1,Math.ceil(total/pageSize));
    const page = Math.min(requestedPage,totalPages);

    const startsAt="r.play_date+r.start_minute*interval '1 minute'";
    const order=sort==='nearest'
      ? `CASE WHEN ${isUpcoming} THEN 0 WHEN r.status='active' THEN 1 ELSE 2 END ASC,
         CASE WHEN ${isUpcoming} THEN ${startsAt} END ASC,
         CASE WHEN NOT (${isUpcoming}) THEN ${startsAt} END DESC,r.id ASC`
      : `r.play_date ${sort==='date-asc'?'ASC':'DESC'},r.start_minute ${sort==='date-asc'?'ASC':'DESC'},r.id ASC`;
    const bookings = await db.query<BookingRow & { customer_name:string|null; customer_email:string|null; customer_phone:string|null }>(`
      SELECT ${fields},COALESCE(r.guest_name,u.name) AS customer_name,u.email AS customer_email,COALESCE(r.guest_phone,u.phone) AS customer_phone
      ${fromBookings} LEFT JOIN app_users u ON u.id=r.user_id
      WHERE ${base} AND ${condition}
      ORDER BY ${order} LIMIT $6 OFFSET $7`,[date || null,courtId,selectedSport,pattern,phonePattern,pageSize,(page-1)*pageSize]);
    const courts = await db.query(`SELECT c.id,c.name,c.kind,c.resource_number AS "resourceNumber",h.id AS "hallId",h.rental_mode AS "rentalMode",CASE WHEN h.rental_mode='whole' THEN 'Универсальный зал' ELSE s.name END AS sport,h.name AS hall,
      ARRAY(SELECT ss.name FROM court_sport_options o JOIN sports ss ON ss.id=o.sport_id WHERE o.court_id=c.id ORDER BY ss.name) AS sports FROM courts c
      JOIN sports s ON s.id=c.sport_id JOIN halls h ON h.id=c.hall_id WHERE c.deleted_at IS NULL ORDER BY CASE WHEN h.id='badminton-hall' THEN 1 WHEN h.id='table-tennis-hall' THEN 2 ELSE 3 END,c.resource_number NULLS LAST,h.name,c.id`);
    await db.query("COMMIT");
    return res.json({
      bookings:bookings.rows.map(row => ({...publicBooking(row),canModify:canAdminModify(row),customer:{name:row.customer_name,email:row.customer_email,phone:row.customer_phone}})),
      counts,total,page,pageSize,totalPages,courts:courts.rows,
    });
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
});
export default router;
