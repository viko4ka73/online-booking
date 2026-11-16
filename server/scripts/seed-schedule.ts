import 'dotenv/config';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import type {Pool} from 'pg';
import {pool,initializeDatabase} from '../src/db';
import {lockBookingDays,availableSlots,localDate,scheduleError} from '../src/booking';
import {getCourtOptions,lockCourtPricing} from '../src/catalog';
import {calculatePrice} from '../src/pricing';

const names=['Анна Смирнова','Илья Соколов','Мария Орлова','Денис Волков','Ольга Лебедева','Максим Ковалёв','Елена Морозова','Александр Белов'];
const reasons=['Уборка','Подготовка оборудования','Обслуживание покрытия'];
const number=(key:string)=>createHash('sha256').update(key).digest().readUInt32BE(0);
function requestId(key:string){
 const bytes=createHash('sha256').update('igraem-schedule-v1|'+key).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function addDays(date:string,days:number){const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

export async function seedSchedule(source:Pool,options:{days?:number;firstDate?:string}={}){
 const days=options.days??7,today=localDate.format(new Date()),firstDate=options.firstDate??addDays(today,1);
 if(!Number.isInteger(days)||days<1||days>14||scheduleError(firstDate,60)||scheduleError(addDays(firstDate,days-1),60))throw Error('Заполнение расписания: от 1 до 14 дней в пределах 40 дней вперёд.');
 const db=await source.connect();
 let locked=false;
 const stats={firstDate,lastDate:addDays(firstDate,days-1),bookings:0,blocks:0,skipped:0,courts:0};
 try{
  locked=Boolean((await db.query("SELECT pg_try_advisory_lock(hashtextextended('igraem-seed-v1',0)) AS locked")).rows[0].locked);
  if(!locked)throw Error('Заполнение уже запущено. Дождитесь завершения.');
  const courts=(await db.query<{id:number;sports:string[]}>("SELECT c.id,ARRAY(SELECT sport_id FROM court_sport_options WHERE court_id=c.id ORDER BY sport_id) AS sports FROM courts c WHERE c.deleted_at IS NULL ORDER BY c.id")).rows;
  stats.courts=courts.length;
  if(!courts.length)throw Error('В каталоге нет действующих площадок.');
  const admin=(await db.query<{id:string}>("SELECT id FROM app_users WHERE role='admin' ORDER BY created_at,id LIMIT 1")).rows[0]?.id??null;
  for(let day=0;day<days;day++){
   const date=addDays(firstDate,day);
   // Technical breaks have no owner, price or mail notification.
   if(admin){
    const court=courts[(day*7)%courts.length],key=requestId('block|'+date+'|'+court.id);
    await db.query('BEGIN');
    try{
     await lockBookingDays(db,[{courtId:court.id,date}]);
     await db.query('SELECT id FROM courts WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[court.id]);
     const existing=(await db.query('SELECT 1 FROM court_time_blocks WHERE request_key=$1',[key])).rowCount;
     const hours=(await db.query<{opens_at:number;closes_at:number}>('SELECT opens_at,closes_at FROM opening_hours WHERE weekday=$1',[new Date(date+'T00:00:00Z').getUTCDay()])).rows[0];
     if(existing||!hours){stats.skipped++;await db.query('COMMIT');}
     else{
      const from=Math.max(hours.opens_at,Math.min(hours.closes_at-30,(11+day%3)*60)),to=Math.min(hours.closes_at,from+(day%2?60:30));
      const occupied=(await db.query("SELECT 1 FROM court_reservations WHERE court_id=$1 AND play_date=$2 AND status='active' AND start_minute<$4 AND end_minute>$3 UNION ALL SELECT 1 FROM court_time_blocks WHERE court_id=$1 AND play_date=$2 AND status='active' AND start_minute<$4 AND end_minute>$3",[court.id,date,from,to])).rowCount;
      if(occupied||!(await db.query('SELECT 1 FROM courts WHERE id=$1 AND deleted_at IS NULL',[court.id])).rowCount)stats.skipped++;
      else{
       await db.query('INSERT INTO court_time_blocks(court_id,play_date,start_minute,end_minute,reason,created_by,request_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[court.id,date,from,to,reasons[day%reasons.length],admin,key]);stats.blocks++;
      }
      await db.query('COMMIT');
     }
    }catch(error){await db.query('ROLLBACK');throw error;}
   }
   for(const court of courts){
    const seed=number(court.id+'|'+date),count=1+seed%3;
    for(let index=0;index<count;index++){
     const key=requestId('booking|'+date+'|'+court.id+'|'+index);
     await db.query('BEGIN');
     try{
      await lockBookingDays(db,[{courtId:court.id,date}]);
      if((await db.query('SELECT 1 FROM court_reservations WHERE request_key=$1',[key])).rowCount){stats.skipped++;await db.query('COMMIT');continue;}
      const sport=court.sports[(seed+index)%court.sports.length];
      await lockCourtPricing(court.id,db,sport);
      const option=await getCourtOptions(court.id,db,sport);
      if(!option||option.capacity<option.minPlayers){stats.skipped++;await db.query('COMMIT');continue;}
      const duration=[60,90,120][(seed+index)%3];
      const desired=(index===0?9+seed%3:index===1?18+seed%3:13+seed%3)*60+(seed%2)*30;
      const slots=await availableSlots(court.id,date,duration,db,null,sport);
      const slot=slots.sort((a,b)=>Math.abs(Number(a.start.slice(0,2))*60+Number(a.start.slice(3))-desired)-Math.abs(Number(b.start.slice(0,2))*60+Number(b.start.slice(3))-desired))[0];
      if(!slot){stats.skipped++;await db.query('COMMIT');continue;}
      const players=Math.min(option.capacity,option.minPlayers+(seed+index)%3);
      const item=option.equipment[(seed+index)%Math.max(1,option.equipment.length)];
      const quantities=new Map<string,number>(item&&index%2===0?[[item.id,Math.min(item.max,2)]]:[]);
      const pricing=calculatePrice(option,date,slot.start,duration,players,quantities);
      if(!pricing){stats.skipped++;await db.query('COMMIT');continue;}
      const start=Number(slot.start.slice(0,2))*60+Number(slot.start.slice(3));
      const id=(await db.query<{id:string}>("INSERT INTO court_reservations(court_id,play_date,start_minute,end_minute,user_id,players,request_key,pricing,sport_id,created_by,guest_name,guest_phone) VALUES($1,$2,$3,$4,NULL,$5,$6,$7::jsonb,$8,$9,$10,NULL) RETURNING id",[court.id,date,start,start+duration,players,key,JSON.stringify(pricing),sport,admin,names[(seed+index)%names.length]])).rows[0].id;
      for(const item of pricing.equipment)await db.query('INSERT INTO reservation_equipment(reservation_id,equipment_id,equipment_name,quantity) VALUES($1,$2,$3,$4)',[id,item.id,item.name,item.quantity]);
      // Deliberately no queueBookingEmail: generated guests must never receive mail.
      await db.query('COMMIT');stats.bookings++;
     }catch(error){await db.query('ROLLBACK');throw error;}
    }
   }
  }
  return stats;
 }finally{
  if(locked)await db.query("SELECT pg_advisory_unlock(hashtextextended('igraem-seed-v1',0))");
  db.release();
 }
}
if(process.argv[1]&&resolve(process.argv[1])===__filename){
 const args=process.argv.slice(2);
 const invalid=args.some(arg=>!/^--days=\d+$/.test(arg))||args.length>1;
 (async()=>{
  try{
   if(invalid)throw Error('Используйте npm run seed:schedule -- --days=7');
   await initializeDatabase();
   const stats=await seedSchedule(pool,{days:args[0]?Number(args[0].slice(7)):7});
   console.log(JSON.stringify({...stats,message:'Расписание заполнено. Реальные записи сохранены, письма не создавались.'}));
  }finally{await pool.end();}
 })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
