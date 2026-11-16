import {Router} from 'express';
import {pool} from '../db';
import {sessionUserId} from './auth';
import {availableSlots,formatTime,scheduleError} from '../booking';
import {getCourtOptions} from '../catalog';
import {waitlistOccupancy,isWaitlistOccupied,expireWaitlist,publicWaitlist,waitFields,waitFrom,waitlistCourts,type WaitRow} from '../waitlist';
const router=Router();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.use(async(req,res,next)=>{
 res.set('Cache-Control','no-store');const id=sessionUserId(req);
 if(!id||!(await pool.query('SELECT id FROM app_users WHERE id=$1',[id])).rowCount)return res.status(401).json({error:'Войдите в аккаунт, чтобы пользоваться листом ожидания.'});
 res.locals.userId=id;next();
});
router.get('/options',async(req,res)=>{
 const courtId=Number(req.query.courtId),date=req.query.date,duration=typeof req.query.duration==='string'?Number(req.query.duration):NaN,scope=req.query.scope;
 const error=scheduleError(date,duration);if(error)return res.status(400).json({error});
 if(!Number.isSafeInteger(courtId)||courtId<1||courtId>2147483647||!['court','sport'].includes(scope as string)||req.query.sport!==undefined&&typeof req.query.sport!=='string')return res.status(400).json({error:'Выберите площадку и формат ожидания.'});
 const court=await getCourtOptions(courtId,undefined,req.query.sport as string|undefined);
 if(!court)return res.status(404).json({error:'Площадка не найдена.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const candidates=await waitlistCourts(db,court.sportId,scope==='court'?courtId:null);
  const hours=(await db.query<{opens_at:number;closes_at:number}>('SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1',[new Date(date+'T00:00:00Z').getUTCDay()])).rows[0];
  const ids=candidates.map(candidate=>candidate.id);
  const busy=await waitlistOccupancy(db,ids,date as string,court.sportId);
  const slots=[];
  if(hours&&candidates.length)for(let start=hours.opens_at;start+duration<=hours.closes_at;start+=30){
   const value=formatTime(start);
   if(new Date(date+'T'+value+':00+03:00').getTime()>Date.now()&&isWaitlistOccupied(ids,busy,start,duration))slots.push({start:value,end:formatTime(start+duration)});
  }
  await db.query('COMMIT');return res.json({slots,sportId:court.sportId,courtName:court.name});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.post('/',async(req,res)=>{
 const {courtId,sportId,date,duration,start,scope}=req.body??{};
 const error=scheduleError(date,duration);if(error)return res.status(400).json({error});
 if(!Number.isSafeInteger(courtId)||courtId<1||courtId>2147483647||typeof sportId!=='string'||!['court','sport'].includes(scope)||typeof start!=='string'||!/^([01][0-9]|2[0-3]):(00|30)$/.test(start))return res.status(400).json({error:'Проверьте площадку, вид спорта и время.'});
 const minute=Number(start.slice(0,2))*60+Number(start.slice(3));
 if(new Date(date+'T'+start+':00+03:00').getTime()<=Date.now())return res.status(400).json({error:'Выберите будущее время.'});
 const db=await pool.connect(),userId=res.locals.userId,target=scope==='court'?courtId:null;
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['waitlist-user|'+userId]);
  await expireWaitlist(db,userId);
  const court=await getCourtOptions(courtId,db,sportId);
  const reject=async(status:number,error:string,extra:object={})=>{await db.query('ROLLBACK');return res.status(status).json({error,...extra});};
  if(!court)return await reject(404,'Площадка для этого вида спорта не найдена.');
  const old=(await db.query<WaitRow>('SELECT '+waitFields+' '+waitFrom+" WHERE w.user_id=$1 AND w.sport_id=$2 AND w.court_id IS NOT DISTINCT FROM $3::int AND w.play_date=$4 AND w.start_minute=$5 AND w.duration=$6 AND w.status IN ('waiting','notified')",[userId,court.sportId,target,date,minute,duration])).rows[0];
  if(old){await db.query('COMMIT');return res.json({entry:publicWaitlist(old),existing:true});}
  const hours=(await db.query<{opens_at:number;closes_at:number}>('SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1',[new Date(date+'T00:00:00Z').getUTCDay()])).rows[0];
  if(!hours||minute<hours.opens_at||minute+duration>hours.closes_at)return await reject(400,'Выберите интервал в пределах часов работы.');
  if((await db.query("SELECT count(*)::int AS n FROM waitlist_entries WHERE user_id=$1 AND status IN ('waiting','notified')",[userId])).rows[0].n>=20)return await reject(400,'Можно оставить до 20 активных заявок. Удалите ненужные заявки в личном кабинете.');
  const candidates=await waitlistCourts(db,court.sportId,target);
  for(const candidate of candidates)if((await availableSlots(candidate.id,date,duration,db,null,court.sportId)).some(slot=>slot.start===start))return await reject(409,'Это время уже свободно — можно перейти к бронированию.',{availableCourtId:candidate.id,sportId:court.sportId});
  const ids=candidates.map(candidate=>candidate.id);
  if(!isWaitlistOccupied(ids,await waitlistOccupancy(db,ids,date,court.sportId),minute,duration))return await reject(400,'Этот интервал не занят. В листе ожидания можно выбрать только время с бронью или техническим перерывом.');
  if(new Date(date+'T'+start+':00+03:00').getTime()<=Date.now())return await reject(400,'Начало интервала уже прошло. Выберите будущее время.');
  const id=(await db.query<{id:string}>('INSERT INTO waitlist_entries(user_id,court_id,sport_id,play_date,start_minute,duration) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[userId,target,court.sportId,date,minute,duration])).rows[0].id;
  const row=(await db.query<WaitRow>('SELECT '+waitFields+' '+waitFrom+' WHERE w.id=$1',[id])).rows[0];
  await db.query('COMMIT');return res.status(201).json({entry:publicWaitlist(row)});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.get('/mine',async(req,res)=>{
 const view=req.query.view??'active',requested=req.query.page===undefined?1:typeof req.query.page==='string'?Number(req.query.page):NaN;
 if(!['active','history'].includes(view as string)||!Number.isSafeInteger(requested)||requested<1||requested>1000000)return res.status(400).json({error:'Проверьте раздел и страницу.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await expireWaitlist(db,res.locals.userId);
  const condition=view==='active'?"w.status IN ('waiting','notified')":"w.status IN ('cancelled','expired','fulfilled')";
  const total=(await db.query<{n:number}>('SELECT count(*)::int AS n FROM waitlist_entries w WHERE user_id=$1 AND '+condition,[res.locals.userId])).rows[0].n;
  const totalPages=Math.max(1,Math.ceil(total/3)),page=Math.min(requested,totalPages);
  const rows=(await db.query<WaitRow>('SELECT '+waitFields+' '+waitFrom+' WHERE w.user_id=$1 AND '+condition+' ORDER BY w.play_date '+(view==='active'?'ASC':'DESC')+',w.start_minute,w.id LIMIT 3 OFFSET $2',[res.locals.userId,(page-1)*3])).rows;
  await db.query('COMMIT');return res.json({entries:rows.map(publicWaitlist),page,total,totalPages});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.post('/:id/cancel',async(req,res)=>{
 if(!uuid.test(req.params.id)||!Number.isSafeInteger(req.body?.version)||req.body.version<1)return res.status(400).json({error:'Обновите список заявок.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const row=(await db.query<WaitRow>('SELECT * FROM waitlist_entries WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,res.locals.userId])).rows[0];
  const reject=async(status:number,error:string)=>{await db.query('ROLLBACK');return res.status(status).json({error});};
  if(!row)return await reject(404,'Заявка не найдена.');
  if(row.status!=='cancelled'){
   if(row.version!==req.body.version)return await reject(409,'Заявка изменилась. Обновите список.');
   if(!['waiting','notified'].includes(row.status))return await reject(409,'Эта заявка уже завершена.');
   await db.query("UPDATE waitlist_entries SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);
   await db.query("UPDATE waitlist_notifications SET status='skipped' WHERE waitlist_id=$1 AND status='pending'",[row.id]);
  }
  await db.query('COMMIT');return res.json({cancelled:true});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
export default router;
