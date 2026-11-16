import {AdjacencyError,lockAdjacencyConfig,saveAdjacency} from "../adjacency";
import {fields,fromBookings,publicBooking,canAdminModify,type BookingRow} from "../reservationView";
import {blockFields,blockFrom,publicTimeBlock,type TimeBlockRow} from "../timeBlocks";
import { createHash } from "node:crypto";
import { Router } from "express";
import { pool } from "../db";
import { listAdminCourts } from "../adminCourts";
import { parseCourtFields } from "../courtInput";
import { decodeCourtImage,storeCourtImage,discardCourtImage,isPresetCourtImage } from "../courtImages";

// This router is mounted after the shared admin-role check in routes/admin.ts.
const router = Router();
router.get("/",async(_req,res)=>{
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const courts = await listAdminCourts(db);
    const sports = await db.query('SELECT id,name,min_players AS "minPlayers" FROM sports ORDER BY name');
    const halls = await db.query(`SELECT h.id,h.name,h.rental_mode AS "rentalMode",ARRAY(SELECT sport_id FROM hall_sports hs WHERE hs.hall_id=h.id) AS "sportIds" FROM halls h ORDER BY name`);
    const nextNumbers=(await db.query(`SELECT
      COALESCE(max(resource_number) FILTER(WHERE hall_id='badminton-hall'),0)+1 AS badminton,
      COALESCE(max(resource_number) FILTER(WHERE hall_id='table-tennis-hall'),0)+1 AS "table-tennis",
      COALESCE(max(resource_number) FILTER(WHERE kind='whole'),0)+1 AS whole FROM courts`)).rows[0];
    const settings=(await db.query('SELECT vip_hourly_surcharge AS "vipHourlySurcharge" FROM commercial_settings')).rows[0];
    await db.query("COMMIT");
    return res.json({courts,sports:sports.rows,halls:halls.rows,nextNumbers,vipHourlySurcharge:settings.vipHourlySurcharge});
  } catch(error) {await db.query("ROLLBACK");throw error;}
  finally {db.release();}
});
router.post("/",async(req,res)=>{
  const parsed = parseCourtFields(req.body,["requestKey","kind","resourceNumber","vip","adjacency"]);
  if ("error" in parsed) return res.status(400).json({error:parsed.error});
  const requestKey = typeof req.body.requestKey === "string" ? req.body.requestKey.toLowerCase() : null;
  if (typeof requestKey!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return res.status(400).json({error:"Обновите форму создания площадки."});
  const decoded = decodeCourtImage(parsed.image);
  if (!decoded && !isPresetCourtImage(parsed.image)) return res.status(400).json({error:"Добавьте фото JPG, PNG или WebP размером до 2 МБ."});
  const {values,capacity} = parsed;
  const number=req.body.resourceNumber;
  if(number!==undefined&&(!Number.isSafeInteger(number)||number<1||number>9999))return res.status(400).json({error:'Укажите номер от 1 до 9999.'});
  if(req.body.vip!==undefined&&typeof req.body.vip!=='boolean')return res.status(400).json({error:'Проверьте категорию стола.'});
  const userId = res.locals.adminId as string;
  const hash = createHash("sha256").update(JSON.stringify({...values,capacity,image:parsed.image,kind:req.body.kind ?? (values.sportId==='table-tennis' ? 'table' : 'court'),resourceNumber:number??null,vip:req.body.vip??false,adjacency:req.body.adjacency??[]})).digest("hex");
  const db = await pool.connect();
  let uploadedPath:string|undefined;
  try {
    await db.query("BEGIN");
    await lockAdjacencyConfig(db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`court-create|${userId}|${requestKey}`]);
    const reject = async(status:number,error:string)=>{await db.query("ROLLBACK");return res.status(status).json({error});};
    const existing = await db.query<{court_id:number;payload_hash:string}>("SELECT court_id,payload_hash FROM court_creation_requests WHERE user_id=$1 AND request_key=$2",[userId,requestKey]);
    if (existing.rows.length) {
      if (existing.rows[0].payload_hash!==hash) return await reject(409,"Площадка по этой попытке уже создана. Закройте форму и обновите список.");
      const court = (await listAdminCourts(db,existing.rows[0].court_id))[0];
      if(!court)return await reject(409,'Площадка по этому запросу уже удалена. Откройте новую форму.');
      await db.query("COMMIT");
      return res.json({court});
    }
    const vipSettings=(await db.query('SELECT vip_hourly_surcharge FROM commercial_settings FOR SHARE')).rows[0];
    const sport = (await db.query<{min_players:number}>("SELECT min_players FROM sports WHERE id=$1 FOR SHARE",[values.sportId])).rows[0];
    if (!sport || !(await db.query("SELECT id FROM halls WHERE id=$1 FOR SHARE",[values.hallId])).rowCount) return await reject(400,"Выберите существующий вид спорта и зал.");
    const parent=(await db.query<{rental_mode:string}>("SELECT rental_mode FROM halls WHERE id=$1 FOR SHARE",[values.hallId])).rows[0];
    if (parent.rental_mode==='whole') return await reject(409,"Этот зал арендуется целиком и уже имеет общий календарь. Добавлять в него отдельные площадки нельзя.");
    if (!(await db.query("SELECT 1 FROM hall_sports WHERE hall_id=$1 AND sport_id=$2",[values.hallId,values.sportId])).rowCount) return await reject(400,"Этот вид спорта не предусмотрен в выбранном зале.");
    const kind=req.body.kind ?? (values.sportId==='table-tennis' ? 'table' : 'court');
    if (!['court','table'].includes(kind)) return await reject(400,"Выберите корт или стол.");
    if (capacity<sport.min_players) return await reject(400,`Для этого вида спорта вместимость должна быть не меньше ${sport.min_players} игроков.`);
    const rates = await db.query<{hourly_rate:number;extra_player_hourly_rate:number}>("SELECT hourly_rate,extra_player_hourly_rate FROM sport_time_rates WHERE sport_id=$1 ORDER BY hourly_rate,start_minute LIMIT 1 FOR SHARE",[values.sportId]);
    if (!rates.rows.length) return await reject(409,"Для этого вида спорта ещё не задан прайс. Площадку пока нельзя открыть для бронирования.");
    if(req.body.vip&&kind!=='table')return await reject(400,'VIP-категория доступна только для столов.');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`court-number|${values.hallId}`]);
    const resourceNumber=number??Number((await db.query('SELECT COALESCE(max(resource_number),0)+1 AS next FROM courts WHERE hall_id=$1',[values.hallId])).rows[0].next);
    if((await db.query('SELECT 1 FROM courts WHERE hall_id=$1 AND resource_number=$2 AND deleted_at IS NULL',[values.hallId,resourceNumber])).rowCount)return await reject(409,'Этот номер площадки уже занят. Выберите другой номер.');
    const image = isPresetCourtImage(parsed.image)?{url:parsed.image,path:undefined}:await storeCourtImage(decoded!);uploadedPath=image.path;
    const inserted = await db.query<{id:number}>(`INSERT INTO courts(name,sport_id,hall_id,image,capacity,description,dimensions,surface,equipment_description,hourly_rate,extra_player_hourly_rate,kind,resource_number,hourly_surcharge,is_vip)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [values.name,values.sportId,values.hallId,image.url,capacity,values.description,values.dimensions,values.surface,values.equipmentDescription,rates.rows[0].hourly_rate,rates.rows[0].extra_player_hourly_rate,kind,resourceNumber,req.body.vip?vipSettings.vip_hourly_surcharge:0,req.body.vip??false]);
    const id = inserted.rows[0].id;
    await db.query("INSERT INTO court_creation_requests(user_id,request_key,court_id,payload_hash) VALUES($1,$2,$3,$4)",[userId,requestKey,id,hash]);
    await saveAdjacency(db,id,req.body.adjacency);
    const court = (await listAdminCourts(db,id))[0];
    await db.query("COMMIT");
    return res.status(201).json({court});
  } catch(error) {
    await db.query("ROLLBACK");
    if (uploadedPath) await discardCourtImage(uploadedPath);
    if(error instanceof AdjacencyError)return res.status(400).json({error:error.message});
    throw error;
  } finally {db.release();}
});

router.patch("/:courtId",async(req,res)=>{
  const id = Number(req.params.courtId);
  if (!/^[1-9]\d*$/.test(req.params.courtId) || !Number.isSafeInteger(id) || id>2147483647) return res.status(400).json({error:"Некорректный номер площадки."});
  const parsed = parseCourtFields(req.body,["version","kind","sportIds","adjacency"]);
  if ("error" in parsed) return res.status(400).json({error:parsed.error});
  const body = req.body;
  const {values} = parsed;
  const sportIds: string[]|undefined=body.sportIds;
  if(sportIds!==undefined&&(!Array.isArray(sportIds)||!sportIds.length||sportIds.length>6||sportIds.some(id=>typeof id!=='string')||new Set(sportIds).size!==sportIds.length||!sportIds.includes(values.sportId)))return res.status(400).json({error:'Выберите хотя бы один вид спорта и укажите основной среди выбранных.'});
  if (!Number.isSafeInteger(body.version) || body.version<1) return res.status(400).json({error:"Обновите данные площадки и повторите сохранение."});
  const db = await pool.connect();
  let uploadedPath:string|undefined;
  try {
    await db.query("BEGIN");
    await lockAdjacencyConfig(db);
    const existing = await db.query<{sport_id:string;hall_id:string;image:string;edit_version:number;kind:string}>("SELECT sport_id,hall_id,image,edit_version,kind FROM courts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    const current = existing.rows[0];
    const reject = async(status:number,error:string)=>{await db.query("ROLLBACK");return res.status(status).json({error});};
    if (!current) return await reject(404,"Площадка не найдена.");
    if (current.edit_version!==body.version) return await reject(409,"Площадку уже изменили. Закройте форму, обновите список и откройте её заново.");
    const sport = (await db.query<{min_players:number}>("SELECT min_players FROM sports WHERE id=$1 FOR SHARE",[values.sportId])).rows[0];
    if (!sport || !(await db.query("SELECT id FROM halls WHERE id=$1 FOR SHARE",[values.hallId])).rowCount) return await reject(400,"Выберите существующий вид спорта и зал.");
    if (body.capacity<sport.min_players) return await reject(400,`Для этого вида спорта вместимость должна быть не меньше ${sport.min_players} игроков.`);
    const metadata = (await listAdminCourts(db,id))[0];
    if (!sportIds && body.capacity<metadata.minPlayers) return await reject(400,`Для всех видов спорта зала нужна вместимость не меньше ${metadata.minPlayers} игроков.`);
    if (!sportIds && values.sportId!==current.sport_id && (metadata.hasReservations || metadata.hasEquipment || metadata.hasSportVariants)) return await reject(409,"Вид спорта связан с бронированиями или инвентарём. Его изменение для этой площадки недоступно.");
    if (values.hallId!==current.hall_id && (metadata.hasReservations || metadata.hasSportVariants)) return await reject(409,"Зал уже указан в бронированиях этой площадки. Его изменение недоступно.");
    const kind=body.kind ?? current.kind;
    if (metadata.hasSportVariants && kind!==current.kind) return await reject(409,"Тип объекта закреплён за общими вариантами использования.");
    if (!['court','table','whole'].includes(kind) || (current.kind==='whole' && (kind!==current.kind || values.hallId!==current.hall_id || (!sportIds && values.sportId!==current.sport_id)))) return await reject(409,"Зал целиком связан с одним общим объектом бронирования.");
    if (current.kind!=='whole' && (kind==='whole' || (await db.query("SELECT rental_mode FROM halls WHERE id=$1",[values.hallId])).rows[0].rental_mode==='whole')) return await reject(409,"Отдельный корт или стол нельзя перенести в зал, который арендуется целиком.");
    if (!sportIds && current.kind!=='whole' && !(await db.query("SELECT 1 FROM hall_sports WHERE hall_id=$1 AND sport_id=$2",[values.hallId,values.sportId])).rowCount) return await reject(400,"Этот вид спорта не предусмотрен в выбранном зале.");
    if(sportIds){
      if(values.hallId!==current.hall_id||kind!==current.kind)return await reject(409,'Сохраните виды спорта без изменения зала и типа объекта.');
      const selected=await db.query<{id:string;name:string;min_players:number}>('SELECT id,name,min_players FROM sports WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',[sportIds]);
      if(selected.rows.length!==sportIds.length)return await reject(400,'Выберите существующие виды спорта.');
      const min=Math.max(...selected.rows.map(sport=>sport.min_players));
      if(body.capacity<min)return await reject(400,`Для выбранных видов спорта нужна вместимость не меньше ${min} игроков.`);
      if(Number((await db.query('SELECT count(DISTINCT sport_id)::int AS n FROM sport_time_rates WHERE sport_id=ANY($1::text[])',[sportIds])).rows[0].n)!==sportIds.length)return await reject(409,'Для выбранного вида спорта ещё не задан прайс.');
      const occupied=await db.query<{name:string}>(`SELECT DISTINCT s.name FROM court_reservations r JOIN sports s ON s.id=COALESCE(r.sport_id,$3)
        WHERE r.court_id=$1 AND r.status='active' AND NOT(COALESCE(r.sport_id,$3)=ANY($2::text[]))
        AND (r.play_date+r.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')`,[id,sportIds,current.sport_id]);
      if(occupied.rows.length)return await reject(409,'Нельзя убрать виды спорта с текущими или предстоящими записями: '+occupied.rows.map(s=>s.name).join(', ')+'. Сначала перенесите или отмените эти записи.');
    }
    const maxPlayers = await db.query<{max:number|null}>(`SELECT max(players)::int AS max FROM court_reservations WHERE court_id=$1 AND status='active'
      AND (play_date+end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')`,[id]);
    if ((maxPlayers.rows[0].max ?? 0)>body.capacity) return await reject(409,`В предстоящих бронированиях уже записано до ${maxPlayers.rows[0].max} игроков. Уменьшить вместимость ниже этого числа нельзя.`);
    let image = current.image;
    if (body.image!==current.image) {
      const decoded = decodeCourtImage(body.image);
      if (!decoded && !isPresetCourtImage(body.image)) return await reject(400,"Загрузите фото в формате JPG, PNG или WebP размером до 2 МБ.");
      const stored = isPresetCourtImage(body.image)?{url:body.image,path:undefined}:await storeCourtImage(decoded!);image=stored.url;uploadedPath=stored.path;
    }
    if(sportIds&&values.sportId!==current.sport_id)await db.query('UPDATE court_reservations SET sport_id=$2 WHERE court_id=$1 AND sport_id IS NULL',[id,current.sport_id]);
    await db.query(`UPDATE courts SET name=$2,sport_id=$3,hall_id=$4,image=$5,capacity=$6,description=$7,
      dimensions=$8,surface=$9,equipment_description=$10,kind=$11,edit_version=edit_version+1 WHERE id=$1`,
      [id,values.name,values.sportId,values.hallId,image,body.capacity,values.description,values.dimensions,values.surface,values.equipmentDescription,kind]);
    if(sportIds){
      await db.query('DELETE FROM court_sports WHERE court_id=$1 AND NOT(sport_id=ANY($2::text[]))',[id,sportIds]);
      await db.query('INSERT INTO court_sports(court_id,sport_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[id,sportIds.filter(sport=>sport!==values.sportId)]);
      if(current.kind==='whole'){
        await db.query('DELETE FROM hall_sports WHERE hall_id=$1 AND NOT(sport_id=ANY($2::text[]))',[current.hall_id,sportIds]);
        await db.query('INSERT INTO hall_sports(hall_id,sport_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[current.hall_id,sportIds]);
      }
    }
    await saveAdjacency(db,id,req.body.adjacency);
    const court = (await listAdminCourts(db,id))[0];
    await db.query("COMMIT");
    return res.json({court});
  } catch(error) {
    await db.query("ROLLBACK");
    if (uploadedPath) await discardCourtImage(uploadedPath);
    if(error instanceof AdjacencyError)return res.status(400).json({error:error.message});
    throw error;
  } finally {db.release();}
});
// Fresh blockers and booking actions for the court-removal workflow.
router.get('/:courtId/deletion-review',async(req,res)=>{
 const id=Number(req.params.courtId);
 const pageValue=(value:unknown)=>value===undefined?1:typeof value==='string'&&/^[1-9][0-9]*$/.test(value)?Number(value):NaN;
 const requested=pageValue(req.query.page),requestedBlocks=pageValue(req.query.blockPage);
 if(!/^[1-9][0-9]*$/.test(req.params.courtId)||!Number.isSafeInteger(id)||id>2147483647||Object.keys(req.query).some(k=>!['page','blockPage'].includes(k))||![requested,requestedBlocks].every(n=>Number.isSafeInteger(n)&&n<=1000000))return res.status(400).json({error:'Проверьте площадку и страницу записей.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const court=(await listAdminCourts(db,id))[0];
  if(!court){await db.query('ROLLBACK');return res.status(404).json({error:'Площадка не найдена или уже удалена.'});}
  const pageSize=3,total=court.upcomingReservations,totalPages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requested,totalPages);
  const blockTotal=court.upcomingBlocks,blockTotalPages=Math.max(1,Math.ceil(blockTotal/pageSize)),blockPage=Math.min(requestedBlocks,blockTotalPages);
  const bookings=await db.query<BookingRow&{customer_name:string|null;customer_email:string|null;customer_phone:string|null}>(`SELECT ${fields},COALESCE(r.guest_name,u.name) AS customer_name,u.email AS customer_email,COALESCE(r.guest_phone,u.phone) AS customer_phone ${fromBookings} LEFT JOIN app_users u ON u.id=r.user_id
   WHERE r.court_id=$1 AND r.status='active' AND (r.play_date+r.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow') ORDER BY r.play_date,r.start_minute,r.id LIMIT $2 OFFSET $3`,[id,pageSize,(page-1)*pageSize]);
  const blocks=await db.query<TimeBlockRow>('SELECT '+blockFields+' '+blockFrom+" WHERE b.court_id=$1 AND b.status='active' AND (b.play_date+b.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow') ORDER BY b.play_date,b.start_minute,b.id LIMIT $2 OFFSET $3",[id,pageSize,(blockPage-1)*pageSize]);
  await db.query('COMMIT');
  return res.json({court,bookings:bookings.rows.map(row=>({...publicBooking(row),canModify:canAdminModify(row),customer:{name:row.customer_name,email:row.customer_email,phone:row.customer_phone}})),page,total,totalPages,blocks:blocks.rows.map(publicTimeBlock),blockPage,blockTotal,blockTotalPages});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});

router.delete('/:courtId',async(req,res)=>{
  const id=Number(req.params.courtId),version=req.body?.version;
  if(!/^[1-9]\d*$/.test(req.params.courtId)||!Number.isSafeInteger(id)||id>2147483647||!Number.isSafeInteger(version)||version<1)return res.status(400).json({error:'Обновите данные площадки и повторите удаление.'});
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    await lockAdjacencyConfig(db);
    const row=(await db.query('SELECT id,edit_version,deleted_at FROM courts WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row){await db.query('ROLLBACK');return res.status(404).json({error:'Площадка не найдена.'});}
    if((await db.query("SELECT 1 FROM court_time_blocks WHERE court_id=$1 AND status='active' AND (play_date+end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow') LIMIT 1",[id])).rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'Сначала снимите предстоящие технические блокировки площадки.'});}
    if(row.deleted_at){await db.query('COMMIT');return res.json({courtId:id,deleted:true});}
    if(row.edit_version!==version){await db.query('ROLLBACK');return res.status(409).json({error:'Площадка уже изменилась. Обновите список перед удалением.'});}
    const future=await db.query(`SELECT 1 FROM court_reservations WHERE court_id=$1 AND status='active'
      AND (play_date+end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow') LIMIT 1`,[id]);
    if(future.rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'На площадке есть текущие или предстоящие бронирования. Сначала перенесите или отмените их.'});}
    await db.query('UPDATE courts SET deleted_at=now(),deleted_by=$2,edit_version=edit_version+1 WHERE id=$1',[id,res.locals.adminId]);
    await db.query('COMMIT');return res.json({courtId:id,deleted:true});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
});

export default router;
