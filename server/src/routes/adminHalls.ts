import {AdjacencyError,lockAdjacencyConfig,saveAdjacency} from "../adjacency";
import { createHash,randomUUID } from "node:crypto";
import { Router } from "express";
import { pool } from "../db";
import { listAdminCourts } from "../adminCourts";
import { parseCourtFields } from "../courtInput";
import { decodeCourtImage,storeCourtImage,discardCourtImage,isPresetCourtImage } from "../courtImages";

const router=Router();
const hallSelect=`SELECT h.id,h.name,h.rental_mode AS "rentalMode",COALESCE(w.image,h.image) AS image,
  COALESCE(w.description,h.description) AS description,COALESCE(w.dimensions,h.dimensions) AS dimensions,
  COALESCE(w.surface,h.surface) AS surface,w.id AS "resourceId",
  (SELECT count(*)::int FROM courts c WHERE c.hall_id=h.id) AS "resourceCount",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name)
    FROM hall_sports hs JOIN sports s ON s.id=hs.sport_id WHERE hs.hall_id=h.id),'[]') AS sports
  FROM halls h LEFT JOIN courts w ON w.hall_id=h.id AND w.kind='whole'`;
router.post("/",async(req,res)=>{
  const body=req.body;
  const allowed=['name','rentalMode','sportIds','image','capacity','description','dimensions','surface','equipmentDescription','requestKey','resourceNumber','adjacency'];
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key)) || !['units','whole'].includes(body.rentalMode) || !Array.isArray(body.sportIds) || !body.sportIds.length || body.sportIds.length>20 || body.sportIds.some((id:unknown)=>typeof id!=='string') || new Set(body.sportIds).size!==body.sportIds.length) return res.status(400).json({error:"Выберите формат аренды и виды спорта зала."});
  const parsed=parseCourtFields({...body,sportId:body.sportIds[0],hallId:'new'},['rentalMode','sportIds','requestKey','resourceNumber','adjacency']);
  if('error' in parsed)return res.status(400).json({error:parsed.error});
  const key=typeof body.requestKey==='string'?body.requestKey.toLowerCase():'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key))return res.status(400).json({error:"Обновите форму создания зала."});
  const number=body.resourceNumber;
  if(number!==undefined&&(!Number.isSafeInteger(number)||number<1||number>9999))return res.status(400).json({error:'Укажите номер от 1 до 9999.'});
  const image=decodeCourtImage(parsed.image);if(!image&&!isPresetCourtImage(parsed.image))return res.status(400).json({error:"Добавьте фото JPG, PNG или WebP до 2 МБ."});
  const hash=createHash('sha256').update(JSON.stringify({...parsed.values,capacity:parsed.capacity,image:parsed.image,mode:body.rentalMode,resourceNumber:number??null,sports:[...body.sportIds].sort(),adjacency:body.adjacency??[]})).digest('hex');
  const db=await pool.connect();let uploaded:string|undefined;
  try{
    await db.query('BEGIN');
    await lockAdjacencyConfig(db);
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`hall-create|${res.locals.adminId}|${key}`]);
    const prior=(await db.query('SELECT hall_id,payload_hash FROM hall_creation_requests WHERE user_id=$1 AND request_key=$2',[res.locals.adminId,key])).rows[0];
    if(prior){if(prior.payload_hash!==hash){await db.query('ROLLBACK');return res.status(409).json({error:"Этот зал уже создан. Обновите список."});}const hall=(await db.query(hallSelect+' WHERE h.id=$1',[prior.hall_id])).rows[0];const court=hall.resourceId?(await listAdminCourts(db,hall.resourceId))[0]:undefined;if(hall.resourceId&&!court){await db.query('ROLLBACK');return res.status(409).json({error:'Площадка уже удалена. Откройте новую форму.'});}await db.query('COMMIT');return res.json({hall,court});}
    const sports=await db.query<{id:string;min_players:number}>('SELECT id,min_players FROM sports WHERE id=ANY($1::text[]) FOR SHARE',[body.sportIds]);
    if(sports.rows.length!==body.sportIds.length){await db.query('ROLLBACK');return res.status(400).json({error:"Выберите существующие виды спорта."});}
    if(body.rentalMode==='whole' && parsed.capacity<Math.max(...sports.rows.map(s=>s.min_players))){await db.query('ROLLBACK');return res.status(400).json({error:"Вместимость должна подходить для всех выбранных видов спорта."});}
    const rate=(await db.query('SELECT hourly_rate,extra_player_hourly_rate FROM sport_time_rates WHERE sport_id=$1 ORDER BY hourly_rate LIMIT 1 FOR SHARE',[body.sportIds[0]])).rows[0];
    if(body.rentalMode==='whole' && (!rate || Number((await db.query('SELECT count(DISTINCT sport_id)::int AS count FROM sport_time_rates WHERE sport_id=ANY($1::text[])',[body.sportIds])).rows[0].count)!==body.sportIds.length)){await db.query('ROLLBACK');return res.status(409).json({error:"Для выбранного спорта ещё не задан прайс."});}
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('whole-hall-number',0))");
    const resourceNumber=number??Number((await db.query("SELECT COALESCE(max(resource_number),0)+1 AS next FROM courts WHERE kind='whole'")).rows[0].next);
    if(body.rentalMode==='whole'&&(await db.query("SELECT 1 FROM courts WHERE kind='whole' AND resource_number=$1 AND deleted_at IS NULL",[resourceNumber])).rowCount){await db.query('ROLLBACK');return res.status(409).json({error:'Этот номер зала уже занят. Выберите другой номер.'});}
    const stored=isPresetCourtImage(parsed.image)?{url:parsed.image,path:undefined}:await storeCourtImage(image!);uploaded=stored.path;
    const id=`hall-${randomUUID()}`,v=parsed.values;
    await db.query('INSERT INTO halls(id,name,rental_mode,image,description,dimensions,surface) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,v.name,body.rentalMode,stored.url,v.description,v.dimensions,v.surface]);
    await db.query('INSERT INTO hall_sports(hall_id,sport_id) SELECT $1,unnest($2::text[])',[id,body.sportIds]);
    if(body.rentalMode==='whole')await db.query(`INSERT INTO courts(name,hall_id,sport_id,kind,image,capacity,description,dimensions,surface,equipment_description,hourly_rate,extra_player_hourly_rate,resource_number)
      VALUES($1,$2,$3,'whole',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[v.name,id,body.sportIds[0],stored.url,parsed.capacity,v.description,v.dimensions,v.surface,v.equipmentDescription,rate.hourly_rate,rate.extra_player_hourly_rate,resourceNumber]);
    if(body.rentalMode==='whole'){const created=(await db.query("SELECT id FROM courts WHERE hall_id=$1 AND kind='whole'",[id])).rows[0];await saveAdjacency(db,created.id,body.adjacency);}
    await db.query('INSERT INTO hall_creation_requests(user_id,request_key,hall_id,payload_hash) VALUES($1,$2,$3,$4)',[res.locals.adminId,key,id,hash]);
    const hall=(await db.query(hallSelect+' WHERE h.id=$1',[id])).rows[0];const court=hall.resourceId?(await listAdminCourts(db,hall.resourceId))[0]:undefined;await db.query('COMMIT');return res.status(201).json({hall,court});
  }catch(error){await db.query('ROLLBACK');if(uploaded)await discardCourtImage(uploaded);if(error instanceof AdjacencyError)return res.status(400).json({error:error.message});if(typeof error==='object'&&error&&'code'in error&&error.code==='23505')return res.status(409).json({error:"Зал с таким названием уже существует."});throw error;}finally{db.release();}
});
export default router;
