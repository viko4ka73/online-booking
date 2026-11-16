import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { renderBookingEmail, type EmailBooking, type EmailKind, type EmailPayload } from "./emailTemplates";

import {refreshWaitlist,deliverWaitlistJob} from './waitlist';

type DB = Pick<PoolClient,"query">;
const hour = 60*60*1000;

export function emailConfigured() {
  return process.env.MAIL_ENABLED === "true" && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && (process.env.SMTP_FROM || process.env.SMTP_USER));
}
export function emailQueueStatus() { return { queued:true, deliveryConfigured:emailConfigured() }; }

export async function scheduleReminder(db: DB, userId: string, booking: EmailBooking) {
  const startsAt = new Date(`${booking.date}T${booking.start}:00+03:00`);
  const scheduled = new Date(startsAt.getTime()-24*hour);
  // A confirmation is sufficient for games booked less than a day in advance.
  if (booking.status !== "active" || scheduled.getTime() <= Date.now()) return;
  await db.query(`
    INSERT INTO email_notifications(user_id,reservation_id,reservation_version,kind,payload,scheduled_at,next_attempt_at,expires_at)
    SELECT $1,$2,$3,'reminder',$4::jsonb,$5,$5,$6 FROM app_users WHERE id=$1 AND email_reminders_enabled
    ON CONFLICT(reservation_id,reservation_version,kind) DO UPDATE
      SET status='pending',scheduled_at=EXCLUDED.scheduled_at,next_attempt_at=EXCLUDED.next_attempt_at,attempts=0,last_error=NULL
      WHERE email_notifications.status='skipped'`,
    [userId,booking.id,booking.version,JSON.stringify({booking}),scheduled,startsAt]);
}

// This is called inside the same transaction as the reservation change.
export async function queueBookingEmail(db: DB, userId: string, kind: Exclude<EmailKind,"reminder">, booking: EmailBooking, previous?: EmailBooking) {
  await db.query("UPDATE email_notifications SET status='skipped' WHERE reservation_id=$1 AND kind='reminder' AND status='pending'",[booking.id]);
  await db.query(`
    INSERT INTO email_notifications(user_id,reservation_id,reservation_version,kind,payload,expires_at)
    VALUES($1,$2,$3,$4,$5::jsonb,now()+interval '7 days')
    ON CONFLICT(reservation_id,reservation_version,kind) DO NOTHING`,
    [userId,booking.id,booking.version,kind,JSON.stringify({booking,previous})]);
  await scheduleReminder(db,userId,booking);
}

export async function ensureReminders(db: DB = pool, userId?: string) {
  const { rows } = await db.query<{ user_id:string; booking:EmailBooking }>(`
    SELECT r.user_id,jsonb_build_object(
      'id',r.id,'version',r.version,'courtName',COALESCE(cs.display_name,c.name),'sport',s.name,'hall',h.name,
      'date',to_char(r.play_date,'YYYY-MM-DD'),'start',to_char(r.play_date+r.start_minute*interval '1 minute','HH24:MI'),
      'end',to_char(r.play_date+r.end_minute*interval '1 minute','HH24:MI'),'status',r.status,'players',r.players,'pricing',r.pricing,
      'equipment',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',re.equipment_name,'quantity',re.quantity)) FROM reservation_equipment re WHERE re.reservation_id=r.id),'[]'::jsonb)
    ) AS booking FROM court_reservations r JOIN app_users u ON u.id=r.user_id
    JOIN courts c ON c.id=r.court_id JOIN sports s ON s.id=COALESCE(r.sport_id,c.sport_id) JOIN halls h ON h.id=c.hall_id LEFT JOIN court_sports cs ON cs.court_id=c.id AND cs.sport_id=s.id
    WHERE r.status='active' AND u.email_reminders_enabled AND ($1::uuid IS NULL OR u.id=$1)
      AND ((r.play_date + r.start_minute*interval '1 minute') AT TIME ZONE 'Europe/Moscow') > now()+interval '24 hours'`,[userId ?? null]);
  for (const row of rows) await scheduleReminder(db,row.user_id,row.booking);
}

type Delivery = ReturnType<typeof renderBookingEmail> & { to: { name:string; address:string }; messageId:string };
export type EmailSender = (message: Delivery) => Promise<void>;

// A separate function lets integration tests use a local fake sender, never real mailboxes.
export async function deliverEmailJob(jobId: string, send: EmailSender) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query<{
      id:string; kind:EmailKind; payload:EmailPayload; reservation_id:string; reservation_version:number;
      email:string; name:string; email_reminders_enabled:boolean; attempts:number; expired:boolean;
    }>(`SELECT n.*,u.email,u.name,u.email_reminders_enabled,n.expires_at<=now() AS expired
        FROM email_notifications n JOIN app_users u ON u.id=n.user_id
        WHERE n.id=$1 AND n.status='pending' AND n.scheduled_at<=now() AND n.next_attempt_at<=now()
        FOR UPDATE OF n SKIP LOCKED`,[jobId]);
    const job = result.rows[0];
    if (!job) { await db.query("COMMIT"); return; }
    let skip = job.expired;
    if (job.kind === "reminder" && !skip) {
      // NOWAIT avoids a lock cycle with cancellation/rescheduling, which locks the booking first.
      const booking = await db.query<{ status:string; version:number }>("SELECT status,version FROM court_reservations WHERE id=$1 FOR UPDATE NOWAIT",[job.reservation_id]);
      skip = !job.email_reminders_enabled || !booking.rows.length || booking.rows[0].status !== "active" || booking.rows[0].version !== job.reservation_version;
    }
    if (skip) {
      await db.query("UPDATE email_notifications SET status='skipped' WHERE id=$1",[job.id]);
    } else {
      const origin = process.env.APP_PUBLIC_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173";
      const content = renderBookingEmail(job.kind,job.payload,job.name,origin);
      const domain = (process.env.SMTP_FROM || process.env.SMTP_USER || "igraem.local").split("@").pop();
      try {
        await send({ to:{name:job.name,address:job.email}, messageId:`<booking-${job.id}@${domain}>`, ...content });
        await db.query("UPDATE email_notifications SET status='sent',sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[job.id]);
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code).slice(0,50) : "SEND_FAILED";
        const delaySeconds = Math.min(21600,60*2**job.attempts);
        await db.query(`UPDATE email_notifications SET attempts=attempts+1,
          status=CASE WHEN attempts+1>=8 THEN 'failed' ELSE 'pending' END,
          next_attempt_at=now()+$2*interval '1 second',last_error=$3 WHERE id=$1`,[job.id,delaySeconds,code]);
      }
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    if (!(typeof error === "object" && error && "code" in error && error.code === "55P03")) throw error;
  } finally { db.release(); }
}

export function startEmailWorker() {
  if (!emailConfigured()) {
    console.info("Email delivery is disabled until MAIL_ENABLED and SMTP settings are configured. Notifications remain queued.");
    return;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const transport = nodemailer.createTransport({
    host:process.env.SMTP_HOST, port, secure:port === 465, requireTLS:port !== 465,
    auth:{ user:process.env.SMTP_USER,pass:process.env.SMTP_PASS },
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
  });
  const send: EmailSender = async message => {
    const result = await transport.sendMail({ from:{ name:"Спортивный комплекс «Играем?»",address:from }, ...message });
    if (!result.accepted.length) throw new Error("Recipient was not accepted");
  };
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await refreshWaitlist();
      const waitJobs=await pool.query<{id:string}>("SELECT id FROM waitlist_notifications WHERE status='pending' AND next_attempt_at<=now() ORDER BY id LIMIT 10");
      for(const job of waitJobs.rows)await deliverWaitlistJob(job.id,send);
      // Preserve the order of event emails for each reservation, including retries.
      const { rows } = await pool.query<{ id:string }>(`SELECT n.id FROM email_notifications n
        WHERE n.status='pending' AND n.scheduled_at<=now() AND n.next_attempt_at<=now()
          AND NOT EXISTS(SELECT 1 FROM email_notifications older WHERE older.reservation_id=n.reservation_id
            AND older.id<n.id AND older.kind<>'reminder' AND older.status='pending')
        ORDER BY n.id LIMIT 10`);
      for (const row of rows) await deliverEmailJob(row.id,send);
    } catch { console.error("Email worker could not process the queue; it will retry."); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); },15000);
  timer.unref();
  void tick();
}
