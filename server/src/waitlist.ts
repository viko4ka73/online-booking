import type {PoolClient} from 'pg';
import {pool} from './db';
import {availableSlots,formatTime,incompatibleNeighborBookings,bookingLockKeys} from './booking';
import {renderWaitlistEmail} from './emailTemplates';
import type {EmailSender} from './notifications';
type DB=Pick<PoolClient,'query'>;
export type WaitRow={id:string;user_id:string;court_id:number|null;sport_id:string;play_date:string;start_minute:number;duration:number;status:'waiting'|'notified'|'cancelled'|'expired'|'fulfilled';version:number;notified_court_id:number|null;notified_at:Date|null;court_name:string|null;sport:string;notified_court_name:string|null;delivery_status:string|null};
export const waitFields="w.*,to_char(w.play_date,'YYYY-MM-DD') AS play_date,s.name AS sport,COALESCE((SELECT name FROM court_sport_options WHERE court_id=w.court_id AND sport_id=w.sport_id),c.name) AS court_name,nc.name AS notified_court_name,n.status AS delivery_status";
export const waitFrom="FROM waitlist_entries w JOIN sports s ON s.id=w.sport_id LEFT JOIN courts c ON c.id=w.court_id LEFT JOIN courts nc ON nc.id=w.notified_court_id LEFT JOIN waitlist_notifications n ON n.waitlist_id=w.id";
export function publicWaitlist(row:WaitRow){return{id:row.id,courtId:row.court_id,sportId:row.sport_id,sport:row.sport,courtName:row.court_name,date:row.play_date,start:formatTime(row.start_minute),end:formatTime(row.start_minute+row.duration),duration:row.duration,status:row.status,version:row.version,notifiedCourtId:row.notified_court_id,notifiedCourtName:row.notified_court_name,notifiedAt:row.notified_at,deliveryStatus:row.delivery_status};}
export async function expireWaitlist(db:DB,userId:string|null=null){
 await db.query(`UPDATE waitlist_entries w SET status='expired',version=version+1 WHERE status IN ('waiting','notified') AND ($1::uuid IS NULL OR user_id=$1) AND
  ((play_date+start_minute*interval '1 minute')<=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow') OR (court_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM court_sport_options WHERE court_id=w.court_id AND sport_id=w.sport_id)))`,[userId]);
}
export async function fulfillWaitlist(db:DB,userId:string,courtId:number,sportId:string,date:string,start:number,duration:number){
 const rows=await db.query<{id:string}>("UPDATE waitlist_entries SET status='fulfilled',version=version+1 WHERE user_id=$1 AND (court_id IS NULL OR court_id=$2) AND sport_id=$3 AND play_date=$4 AND start_minute=$5 AND duration=$6 AND status IN ('waiting','notified') RETURNING id",[userId,courtId,sportId,date,start,duration]);
 if(rows.rowCount)await db.query("UPDATE waitlist_notifications SET status='skipped' WHERE waitlist_id=ANY($1::uuid[]) AND status='pending'",[rows.rows.map(row=>row.id)]);
}
export async function waitlistCourts(db:DB,sportId:string,courtId:number|null){
 return (await db.query<{id:number;name:string;sport:string}>(`SELECT c.id,o.name,s.name AS sport FROM courts c JOIN court_sport_options o ON o.court_id=c.id JOIN sports s ON s.id=o.sport_id WHERE o.sport_id=$1 AND ($2::int IS NULL OR c.id=$2) AND c.capacity>=o.min_players ORDER BY c.id`,[sportId,courtId])).rows;
}

export async function waitlistOccupancy(db:DB,courtIds:number[],date:string,sportId:string|null=null){
 const own=(await db.query<{court_id:number;start_minute:number;end_minute:number}>(
  "SELECT court_id,start_minute,end_minute FROM court_reservations WHERE court_id=ANY($1::int[]) AND play_date=$2 AND status='active' UNION ALL SELECT court_id,start_minute,end_minute FROM court_time_blocks WHERE court_id=ANY($1::int[]) AND play_date=$2 AND status='active'",[courtIds,date])).rows;
 return [...own,...await incompatibleNeighborBookings(db,courtIds,date,sportId)];
}
export function isWaitlistOccupied(courtIds:number[],busy:{court_id:number;start_minute:number;end_minute:number}[],start:number,duration:number){
 return courtIds.length>0&&courtIds.every(id=>busy.some(row=>row.court_id===id&&start<row.end_minute&&start+duration>row.start_minute));
}

async function findFreeCourt(db:DB,row:Pick<WaitRow,'sport_id'|'court_id'|'play_date'|'duration'|'start_minute'>){
 for(const court of await waitlistCourts(db,row.sport_id,row.court_id))if((await availableSlots(court.id,row.play_date,row.duration,db,null,row.sport_id)).some(slot=>slot.start===formatTime(row.start_minute)))return court;
 return null;
}
export async function refreshWaitlist(){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  if(!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('waitlist-refresh',0)) AS locked")).rows[0].locked){await db.query('COMMIT');return;}
  await expireWaitlist(db);
  const rows=(await db.query<WaitRow>("SELECT w.*,to_char(play_date,'YYYY-MM-DD') AS play_date FROM waitlist_entries w WHERE status='waiting' ORDER BY checked_at NULLS FIRST,created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
  for(const row of rows){
   await db.query('UPDATE waitlist_entries SET checked_at=now() WHERE id=$1',[row.id]);
   if(await findFreeCourt(db,row))await db.query("INSERT INTO waitlist_notifications(waitlist_id) VALUES($1) ON CONFLICT(waitlist_id) DO UPDATE SET status='pending',next_attempt_at=now() WHERE waitlist_notifications.status='skipped'",[row.id]);
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function deliverWaitlistJob(jobId:string,send:EmailSender){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const job=(await db.query<{id:string;waitlist_id:string;attempts:number}>("SELECT * FROM waitlist_notifications WHERE id=$1 AND status='pending' AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED",[jobId])).rows[0];
  if(!job){await db.query('COMMIT');return;}
  // Cancellation and booking confirmation lock the entry before the mail row.
  const row=(await db.query<WaitRow & {email:string;name:string}>("SELECT w.*,to_char(play_date,'YYYY-MM-DD') AS play_date,u.email,u.name FROM waitlist_entries w JOIN app_users u ON u.id=w.user_id WHERE w.id=$1 FOR UPDATE OF w NOWAIT",[job.waitlist_id])).rows[0];
  let court=row?.status==='waiting'?await findFreeCourt(db,row):null;
  if(court){
   // Never wait while holding the entry: a concurrent booking may need it to fulfill the request.
   if(!(await db.query("SELECT pg_try_advisory_xact_lock_shared(hashtextextended('court-adjacency-config',0)) AS locked")).rows[0].locked){await db.query('ROLLBACK');return;}
   for(const key of await bookingLockKeys(db,[{courtId:court.id,date:row.play_date}]))if(!(await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked){await db.query('ROLLBACK');return;}
   if(!(await db.query('SELECT id FROM courts WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[court.id])).rowCount)court=null;
   else court=await findFreeCourt(db,{...row,court_id:court.id});
  }
  if(!court){await db.query("UPDATE waitlist_notifications SET status='skipped' WHERE id=$1",[job.id]);}
  else{
   const origin=process.env.APP_PUBLIC_URL||process.env.CLIENT_ORIGIN||'http://localhost:5173';
   const content=renderWaitlistEmail({courtId:court.id,courtName:court.name,sportId:row.sport_id,sport:court.sport,date:row.play_date,start:formatTime(row.start_minute),end:formatTime(row.start_minute+row.duration),duration:row.duration},row.name,origin);
   const domain=(process.env.SMTP_FROM||process.env.SMTP_USER||'igraem.local').split('@').pop();
   try{
    await send({...content,to:{name:row.name,address:row.email},messageId:'<waitlist-'+job.id+'@'+domain+'>'});
    await db.query("UPDATE waitlist_notifications SET status='sent',sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[job.id]);
    await db.query("UPDATE waitlist_entries SET status='notified',notified_at=now(),notified_court_id=$2,version=version+1 WHERE id=$1",[row.id,court.id]);
   }catch(error){
    const code=typeof error==='object'&&error&&'code'in error?String(error.code).slice(0,50):'SEND_FAILED';
    await db.query("UPDATE waitlist_notifications SET attempts=attempts+1,status=CASE WHEN attempts+1>=8 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+$2*interval '1 second',last_error=$3 WHERE id=$1",[job.id,Math.min(21600,60*2**job.attempts),code]);
   }
  }
  await db.query('COMMIT');
 }catch(error){
  await db.query('ROLLBACK');
  if(!(typeof error==='object'&&error&&'code'in error&&error.code==='55P03'))throw error;
 }finally{db.release();}
}
