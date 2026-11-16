import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool} from '../db';
const router=Router();
type Rate={dayType:'weekday'|'weekend';startMinute:number;endMinute:number;hourlyRate:number;extraPlayerHourlyRate:number};
const amount=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=100000000;
const minute=(value:unknown)=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=1440&&Number(value)%30===0;
router.get('/',async(_req,res)=>{
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const settings=(await db.query('SELECT version,vip_hourly_surcharge FROM commercial_settings')).rows[0];const version=settings.version;
  const sports=(await db.query(`SELECT s.id,s.name,jsonb_agg(jsonb_build_object('dayType',r.day_type,'startMinute',r.start_minute,'endMinute',r.end_minute,'hourlyRate',r.hourly_rate,'extraPlayerHourlyRate',r.extra_player_hourly_rate) ORDER BY r.day_type,r.start_minute) AS rates FROM sports s JOIN sport_time_rates r ON r.sport_id=s.id GROUP BY s.id ORDER BY s.name`)).rows;
  const equipment=(await db.query(`SELECT e.id,e.name,e.unit_price AS "unitPrice",ARRAY(SELECT sport_id FROM equipment_sports WHERE equipment_id=e.id ORDER BY sport_id) AS "sportIds",COALESCE((SELECT jsonb_agg(jsonb_build_object('courtId',ce.court_id,'max',ce.max_quantity) ORDER BY ce.court_id) FROM court_equipment ce JOIN courts c ON c.id=ce.court_id WHERE ce.equipment_id=e.id AND c.deleted_at IS NULL),'[]') AS courts FROM equipment e ORDER BY e.name`)).rows;
  const courts=(await db.query(`SELECT c.id,c.name,c.kind,c.is_vip AS "isVip",c.resource_number AS "resourceNumber",c.hourly_surcharge AS "hourlySurcharge",ARRAY(SELECT sport_id FROM court_sport_options WHERE court_id=c.id) AS "sportIds" FROM courts c WHERE c.deleted_at IS NULL ORDER BY c.id`)).rows;
  await db.query('COMMIT');return res.json({version,vipHourlySurcharge:settings.vip_hourly_surcharge,sports,equipment,courts});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.put('/rates/:sportId',async(req,res)=>{
 const {rates,version}=req.body??{};
 if(!Number.isSafeInteger(version)||!Array.isArray(rates)||rates.length<2||rates.length>48||rates.some((r:Rate)=>!r||!['weekday','weekend'].includes(r.dayType)||!minute(r.startMinute)||!minute(r.endMinute)||r.endMinute<=r.startMinute||!amount(r.hourlyRate)||!amount(r.extraPlayerHourlyRate)))return res.status(400).json({error:'Проверьте интервалы с шагом 30 минут и цены от 0 до 1 000 000 ₽.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const current=(await db.query('SELECT version FROM commercial_settings FOR UPDATE')).rows[0].version;
  const reject=async(status:number,error:string)=>{await db.query('ROLLBACK');return res.status(status).json({error});};
  if(current!==version)return await reject(409,'Прайс или инвентарь уже изменён. Обновите данные перед сохранением.');
  if(!(await db.query('SELECT id FROM sports WHERE id=$1 FOR UPDATE',[req.params.sportId])).rowCount)return await reject(404,'Вид спорта не найден.');
  const hours=(await db.query('SELECT weekday,opens_at,closes_at FROM opening_hours')).rows;
  for(const type of ['weekday','weekend']){
   const rows=rates.filter((r:Rate)=>r.dayType===type).sort((a:Rate,b:Rate)=>a.startMinute-b.startMinute);
   if(!rows.length||rows.some((r:Rate,index:number)=>index>0&&r.startMinute!==rows[index-1].endMinute))return await reject(400,'Интервалы должны идти подряд, без пересечений и пропусков.');
   const days=hours.filter(h=>[0,6].includes(h.weekday)===(type==='weekend'));
   if(days.some(h=>rows[0].startMinute>h.opens_at||rows[rows.length-1].endMinute<h.closes_at))return await reject(400,'Тарифы должны покрывать все часы работы комплекса.');
  }
  await db.query('DELETE FROM sport_time_rates WHERE sport_id=$1',[req.params.sportId]);
  for(const r of rates)await db.query('INSERT INTO sport_time_rates(sport_id,day_type,start_minute,end_minute,hourly_rate,extra_player_hourly_rate) VALUES($1,$2,$3,$4,$5,$6)',[req.params.sportId,r.dayType,r.startMinute,r.endMinute,r.hourlyRate,r.extraPlayerHourlyRate]);
  await db.query('UPDATE commercial_settings SET version=version+1');await db.query('COMMIT');return res.json({version:current+1});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});
router.put('/vip-tables',async(req,res)=>{
 const {version,hourlySurcharge}=req.body??{};
 if(!Number.isSafeInteger(version)||!amount(hourlySurcharge))return res.status(400).json({error:'Укажите корректную надбавку.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const current=(await db.query('SELECT version FROM commercial_settings FOR UPDATE')).rows[0].version;
  if(current!==version){await db.query('ROLLBACK');return res.status(409).json({error:'Данные уже изменены. Обновите прайс.'});}
  const tables=await db.query("SELECT id FROM courts WHERE kind='table' AND is_vip AND deleted_at IS NULL ORDER BY id FOR UPDATE");
  await db.query('UPDATE courts SET hourly_surcharge=$2,edit_version=edit_version+1 WHERE id=ANY($1::int[])',[tables.rows.map(t=>t.id),hourlySurcharge]);
  await db.query('UPDATE commercial_settings SET vip_hourly_surcharge=$1,version=version+1',[hourlySurcharge]);await db.query('COMMIT');return res.json({version:current+1});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});

async function saveEquipment(req:import('express').Request,res:import('express').Response,creating=false){
 const {name,unitPrice,sportIds,courts,version}=req.body??{};
 if(!Number.isSafeInteger(version)||typeof name!=='string'||name.trim().length<2||name.trim().length>100||!amount(unitPrice)||!Array.isArray(sportIds)||!sportIds.length||sportIds.length>6||new Set(sportIds).size!==sportIds.length||sportIds.some(id=>typeof id!=='string')||!Array.isArray(courts)||courts.length>500||new Set(courts.map(c=>c?.courtId)).size!==courts.length||courts.some(c=>!c||!Number.isSafeInteger(c.courtId)||c.courtId<1||!Number.isInteger(c.max)||c.max<0||c.max>100))return res.status(400).json({error:'Проверьте название, цену, виды спорта и количество от 0 до 100.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const current=(await db.query('SELECT version FROM commercial_settings FOR UPDATE')).rows[0].version;
  const reject=async(status:number,error:string)=>{await db.query('ROLLBACK');return res.status(status).json({error});};
  if(current!==version)return await reject(409,'Прайс или инвентарь уже изменён. Обновите данные перед сохранением.');
  if((await db.query('SELECT id FROM sports WHERE id=ANY($1::text[])',[sportIds])).rowCount!==sportIds.length)return await reject(400,'Выберите существующие виды спорта.');
  // Same court -> equipment lock order as booking confirmation.
  const courtRows=(await db.query('SELECT id FROM courts WHERE id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY id FOR SHARE',[courts.map(c=>c.courtId)])).rows;
  if(courtRows.length!==courts.length)return await reject(409,'Список площадок изменился. Обновите форму.');
  for(const c of courts.filter(c=>c.max>0))if(!(await db.query('SELECT 1 FROM court_sport_options WHERE court_id=$1 AND sport_id=ANY($2::text[])',[c.courtId,sportIds])).rowCount)return await reject(400,'Инвентарь не подходит выбранному виду спорта площадки.');
  const id=creating?randomUUID():req.params.equipmentId;
  if(creating)await db.query('INSERT INTO equipment(id,name,unit_price) VALUES($1,$2,$3)',[id,name.trim(),unitPrice]);
  else {
   if(!(await db.query('SELECT id FROM equipment WHERE id=$1 FOR UPDATE',[id])).rowCount)return await reject(404,'Инвентарь не найден.');
   await db.query('UPDATE equipment SET name=$2,unit_price=$3 WHERE id=$1',[id,name.trim(),unitPrice]);
  }
  await db.query('DELETE FROM court_equipment WHERE equipment_id=$1',[id]);
  await db.query('DELETE FROM equipment_sports WHERE equipment_id=$1',[id]);
  for(const sport of sportIds)await db.query('INSERT INTO equipment_sports(equipment_id,sport_id) VALUES($1,$2)',[id,sport]);
  for(const c of courts.filter(c=>c.max>0))await db.query('INSERT INTO court_equipment(court_id,equipment_id,max_quantity) VALUES($1,$2,$3)',[c.courtId,id,c.max]);
  await db.query('UPDATE commercial_settings SET version=version+1');await db.query('COMMIT');return res.status(creating?201:200).json({id,version:current+1});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
router.post('/equipment',(req,res)=>saveEquipment(req,res,true));
router.put('/equipment/:equipmentId',(req,res)=>saveEquipment(req,res));
export default router;
