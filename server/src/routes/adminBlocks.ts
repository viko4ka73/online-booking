import {Router} from 'express';
import {pool} from '../db';
import {localDate,scheduleError} from '../booking';
import {blockFields,blockFrom,loadTimeBlock,publicTimeBlock,type TimeBlockRow} from '../timeBlocks';
const router=Router();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function minute(value:unknown,end=false){
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):(00|30)$/.test(value)&&!(end&&value==='24:00'))return NaN;
 return Number(value.slice(0,2))*60+Number(value.slice(3));
}
router.post('/',async(req,res)=>{
 const {courtId,date,start,end,reason,requestKey}=req.body??{};
 const startMinute=minute(start),endMinute=minute(end,true);
 const message=scheduleError(date,60);
 if(message)return res.status(400).json({error:message});
 if(!Number.isSafeInteger(courtId)||courtId<1||courtId>2147483647||!Number.isFinite(startMinute)||!Number.isFinite(endMinute)||endMinute-startMinute<30||typeof reason!=='string'||reason.trim().length<3||reason.trim().length>300||typeof requestKey!=='string'||!uuid.test(requestKey))return res.status(400).json({error:'Выберите площадку, интервал от 30 минут и укажите причину (3–300 символов).'});
 const adminId=res.locals.adminId,db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['block-request|'+adminId+'|'+requestKey]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[courtId+'|'+date]);
  const existing=(await db.query<TimeBlockRow>('SELECT '+blockFields+' '+blockFrom+' WHERE b.created_by=$1 AND b.request_key=$2',[adminId,requestKey])).rows[0];
  if(existing){
   if(existing.court_id!==courtId||existing.play_date!==date||existing.start_minute!==startMinute||existing.end_minute!==endMinute||existing.reason!==reason.trim()||existing.status!=='active'){await db.query('ROLLBACK');return res.status(409).json({error:'Этот запрос уже обработан. Откройте форму заново.'});}
   await db.query('COMMIT');return res.json({block:publicTimeBlock(existing)});
  }
  const court=(await db.query('SELECT id FROM courts WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[courtId])).rows[0];
  if(!court){await db.query('ROLLBACK');return res.status(404).json({error:'Площадка не найдена.'});}
  const weekday=new Date(date+'T00:00:00Z').getUTCDay();
  const hours=(await db.query<{opens_at:number;closes_at:number}>('SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1',[weekday])).rows[0];
  const now=new Date(),currentTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now),nowMinute=minute(currentTime.slice(0,3)+(Number(currentTime.slice(3))<30?'00':'30'));
  if(!hours||startMinute<hours.opens_at||endMinute>hours.closes_at||date===localDate.format(now)&&startMinute<nowMinute){await db.query('ROLLBACK');return res.status(400).json({error:'Выберите текущий или будущий интервал в пределах часов работы.'});}
  const conflicts=await db.query("SELECT id FROM court_reservations WHERE court_id=$1 AND play_date=$2 AND status='active' AND start_minute<$4 AND end_minute>$3 LIMIT 1",[courtId,date,startMinute,endMinute]);
  if(conflicts.rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'В этом интервале есть бронирование. Сначала перенесите или отмените запись.'});}
  const blocked=await db.query("SELECT id FROM court_time_blocks WHERE court_id=$1 AND play_date=$2 AND status='active' AND start_minute<$4 AND end_minute>$3 LIMIT 1",[courtId,date,startMinute,endMinute]);
  if(blocked.rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'В этом интервале уже есть техническая блокировка.'});}
  const id=(await db.query<{id:string}>('INSERT INTO court_time_blocks(court_id,play_date,start_minute,end_minute,reason,created_by,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[courtId,date,startMinute,endMinute,reason.trim(),adminId,requestKey])).rows[0].id;
  const row=await loadTimeBlock(db,id);await db.query('COMMIT');return res.status(201).json({block:publicTimeBlock(row)});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.post('/:blockId/release',async(req,res)=>{
 const {blockId}=req.params,version=req.body?.version;
 if(!uuid.test(blockId)||!Number.isSafeInteger(version)||version<1)return res.status(400).json({error:'Обновите календарь и повторите действие.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const row=await loadTimeBlock(db,blockId,true);
  if(!row){await db.query('ROLLBACK');return res.status(404).json({error:'Блокировка не найдена.'});}
  if(row.status==='released'){await db.query('COMMIT');return res.json({block:publicTimeBlock(row)});}
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[row.court_id+'|'+row.play_date]);
  if(row.version!==version){await db.query('ROLLBACK');return res.status(409).json({error:'Блокировка уже изменилась. Обновите календарь.'});}
  if(new Date(row.play_date+'T'+String(Math.floor(row.end_minute/60)).padStart(2,'0')+':'+String(row.end_minute%60).padStart(2,'0')+':00+03:00').getTime()<=Date.now()){await db.query('ROLLBACK');return res.status(403).json({error:'Этот интервал уже завершён. История блокировки сохранена.'});}
  await db.query("UPDATE court_time_blocks SET status='released',released_at=now(),released_by=$2,version=version+1 WHERE id=$1",[blockId,res.locals.adminId]);
  const updated=await loadTimeBlock(db,blockId);await db.query('COMMIT');return res.json({block:publicTimeBlock(updated)});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
export default router;
