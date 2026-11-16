import type { PoolClient } from "pg";
import { pool } from "./db";

export const MAX_BOOKING_MINUTES=300;
export const localDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" });
const localTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatTime(minutes: number) {
  return [Math.floor(minutes / 60), minutes % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function scheduleError(date: unknown, duration: unknown, now = new Date()): string | null {
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + "T00:00:00Z") : new Date(NaN);
  const today = localDate.format(now);
  if (typeof date !== "string" || Number.isNaN(day.getTime()) ||
      day.toISOString().slice(0, 10) !== date || date < today) {
    return "Выберите сегодняшнюю или будущую дату.";
  }
  const lastDay = new Date(today + "T00:00:00Z");
  lastDay.setUTCDate(lastDay.getUTCDate() + 40);
  if (date > lastDay.toISOString().slice(0, 10)) return "Запись доступна не более чем на 40 дней вперёд.";
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 60 || duration > MAX_BOOKING_MINUTES || duration % 30 !== 0) {
    return "Выберите длительность от 1 до 5 часов с шагом 30 минут.";
  }
  return null;
}

// A shared lock serializes bookings across the adjoining physical halls as well.
export async function bookingLockKeys(db: Pick<PoolClient, "query">, targets: {courtId:number;date:string}[]) {
  const ids=targets.map(t=>t.courtId);
  const links=(await db.query<{court_a:number;court_b:number}>('SELECT court_a,court_b FROM court_adjacency WHERE court_a=ANY($1::int[]) OR court_b=ANY($1::int[])',[ids])).rows;
  return [...new Set(targets.flatMap(t=>[`${t.courtId}|${t.date}`,...links.filter(x=>x.court_a===t.courtId||x.court_b===t.courtId).map(x=>`!adjacent-${x.court_a}-${x.court_b}|${t.date}`)]))].sort();
}
export async function lockBookingDays(db: Pick<PoolClient, "query">, targets: {courtId:number;date:string}[]) {
  await db.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('court-adjacency-config',0))");
  for(const key of await bookingLockKeys(db,targets))await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);
}
export async function incompatibleNeighborBookings(db: Pick<PoolClient, "query">, courtIds:number[], date:string, sportId:string|null=null, excludeId:string|null=null) {
  return (await db.query<{court_id:number;start_minute:number;end_minute:number}>(`
    SELECT c.id AS court_id,r.start_minute,r.end_minute
    FROM courts c JOIN court_adjacency x ON x.court_a=c.id OR x.court_b=c.id
    JOIN courts neighbor ON neighbor.id=CASE WHEN x.court_a=c.id THEN x.court_b ELSE x.court_a END AND neighbor.deleted_at IS NULL
    JOIN court_reservations r ON r.court_id=neighbor.id AND r.play_date=$2 AND r.status='active'
    WHERE c.id=ANY($1::int[]) AND c.deleted_at IS NULL AND ($4::uuid IS NULL OR r.id<>$4::uuid)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x.allowed_pairs) pair WHERE pair->>0=CASE WHEN x.court_a=c.id THEN COALESCE($3::text,c.sport_id) ELSE COALESCE(r.sport_id,neighbor.sport_id) END AND pair->>1=CASE WHEN x.court_a=c.id THEN COALESCE(r.sport_id,neighbor.sport_id) ELSE COALESCE($3::text,c.sport_id) END)`,[courtIds,date,sportId,excludeId])).rows;
}

export async function availableSlots(courtId: number, date: string, duration: number, db: Pick<PoolClient, "query"> = pool, excludeId: string | null = null, sportId: string | null = null) {
  const now = new Date();
  const today = localDate.format(now);
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const hours = await db.query<{ opens_at: number; closes_at: number }>("SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1", [weekday]);
  if (!hours.rows.length) return [];
  const { opens_at: opensAt, closes_at: closesAt } = hours.rows[0];
  const [hour, minute] = localTime.format(now).split(":").map(Number);
  const { rows } = await db.query<{ start_minute: number; end_minute: number }>(
    "SELECT start_minute, end_minute FROM court_reservations WHERE court_id = $1 AND play_date = $2 AND status = 'active' AND ($3::uuid IS NULL OR id <> $3::uuid)",
    [courtId, date, excludeId],
  );
  const blocks = (await db.query<{start_minute:number;end_minute:number}>("SELECT start_minute,end_minute FROM court_time_blocks WHERE court_id=$1 AND play_date=$2 AND status='active'",[courtId,date])).rows;
  const neighbors = await incompatibleNeighborBookings(db,[courtId],date,sportId,excludeId);
  const slots: { start: string; end: string }[] = [];
  for (let start = opensAt; start + duration <= closesAt; start += 30) {
    if (date === today && start <= hour * 60 + minute) continue;
    const end = start + duration;
    const conflict = rows.some(({ start_minute, end_minute }) =>
      (start < end_minute && end > start_minute) || start - end_minute === 30 || start_minute - end === 30,
    );
    if (!conflict && !neighbors.some(row=>start<row.end_minute&&end>row.start_minute) && !blocks.some(block=>start<block.end_minute&&end>block.start_minute)) slots.push({ start: formatTime(start), end: formatTime(end) });
  }
  return slots;
}
