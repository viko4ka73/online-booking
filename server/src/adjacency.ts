import type {PoolClient} from 'pg';
type DB=Pick<PoolClient,'query'>;
export type Adjacency={courtId:number;courtName?:string;allowedPairs:[string,string][]};
export class AdjacencyError extends Error {}
export async function lockAdjacencyConfig(db:DB){await db.query("SELECT pg_advisory_xact_lock(hashtextextended('court-adjacency-config',0))");}
export async function loadAdjacency(db:DB,ids:number[]){
 const rows=(await db.query<{court_a:number;court_b:number;allowed_pairs:[string,string][];name_a:string;name_b:string}>(`SELECT x.*,a.name AS name_a,b.name AS name_b FROM court_adjacency x JOIN courts a ON a.id=x.court_a AND a.deleted_at IS NULL JOIN courts b ON b.id=x.court_b AND b.deleted_at IS NULL WHERE x.court_a=ANY($1::int[]) OR x.court_b=ANY($1::int[])`,[ids])).rows;
 const result=new Map<number,Adjacency[]>();
 for(const id of ids)result.set(id,rows.filter(x=>x.court_a===id||x.court_b===id).map(x=>({courtId:x.court_a===id?x.court_b:x.court_a,courtName:x.court_a===id?x.name_b:x.name_a,allowedPairs:x.court_a===id?x.allowed_pairs:x.allowed_pairs.map(([a,b])=>[b,a] as [string,string])})));
 return result;
}
export async function attachAdjacency<T extends {id:number}>(db:DB,courts:T[]){const links=await loadAdjacency(db,courts.map(c=>c.id));return courts.map(c=>({...c,adjacency:links.get(c.id)??[]}));}
export async function saveAdjacency(db:DB,id:number,input:unknown){
 if(input===undefined)return;
 if(!Array.isArray(input)||input.length>20)throw new AdjacencyError('Проверьте настройки смежных площадок.');
 const own=(await db.query<{sport_id:string}>('SELECT sport_id FROM court_sport_options WHERE court_id=$1',[id])).rows.map(s=>s.sport_id);
 const seen=new Set<number>();
 const normalized:Adjacency[]=[];
 for(const item of input){
  if(!item||typeof item!=='object'||!Number.isSafeInteger(item.courtId)||item.courtId===id||seen.has(item.courtId)||!Array.isArray(item.allowedPairs)||item.allowedPairs.length>36)throw new AdjacencyError('Выберите соседние площадки без повторений.');
  const neighbor=(await db.query<{sport_id:string}>('SELECT sport_id FROM court_sport_options WHERE court_id=$1',[item.courtId])).rows.map(s=>s.sport_id);
  if(!neighbor.length)throw new AdjacencyError('Соседняя площадка удалена или недоступна. Обновите список.');
  const pairs=new Set<string>();
  for(const pair of item.allowedPairs){if(!Array.isArray(pair)||pair.length!==2||!own.includes(pair[0])||!neighbor.includes(pair[1])||pairs.has(JSON.stringify(pair)))throw new AdjacencyError('Разрешите сочетания только доступных на площадках видов спорта, без повторений.');pairs.add(JSON.stringify(pair));}
  seen.add(item.courtId);normalized.push({courtId:item.courtId,allowedPairs:item.allowedPairs});
 }
 const previous=(await loadAdjacency(db,[id])).get(id)??[];
 for(const item of normalized){
  const a=Math.min(id,item.courtId),b=Math.max(id,item.courtId);
  const allowed=id===a?item.allowedPairs:item.allowedPairs.map(([x,y])=>[y,x]);
  // Existing violations may be resolved separately; do not introduce new conflicts.
  const old=previous.find(p=>p.courtId===item.courtId);
  const formerlyAllowed=old?(id===a?old.allowedPairs:old.allowedPairs.map(([x,y])=>[y,x])):null;
  const conflict=await db.query(`SELECT 1 FROM court_reservations ra JOIN courts ca ON ca.id=ra.court_id
   JOIN court_reservations rb ON rb.court_id=$2 AND rb.play_date=ra.play_date AND rb.status='active' JOIN courts cb ON cb.id=rb.court_id
   WHERE ra.court_id=$1 AND ra.status='active' AND ra.start_minute<rb.end_minute AND ra.end_minute>rb.start_minute
   AND (ra.play_date+LEAST(ra.end_minute,rb.end_minute)*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($3::jsonb) pair WHERE pair->>0=COALESCE(ra.sport_id,ca.sport_id) AND pair->>1=COALESCE(rb.sport_id,cb.sport_id))
   AND ($4::jsonb IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements($4::jsonb) pair WHERE pair->>0=COALESCE(ra.sport_id,ca.sport_id) AND pair->>1=COALESCE(rb.sport_id,cb.sport_id))) LIMIT 1`,[a,b,JSON.stringify(allowed),formerlyAllowed===null?null:JSON.stringify(formerlyAllowed)]);
  if(conflict.rowCount)throw new AdjacencyError('Эти ограничения создадут конфликт с текущими или предстоящими бронями. Сначала перенесите или отмените несовместимые записи.');
 }
 await db.query('DELETE FROM court_adjacency WHERE court_a=$1 OR court_b=$1',[id]);
 for(const item of normalized)await db.query('INSERT INTO court_adjacency(court_a,court_b,allowed_pairs) VALUES($1,$2,$3::jsonb)',[Math.min(id,item.courtId),Math.max(id,item.courtId),JSON.stringify(id<item.courtId?item.allowedPairs:item.allowedPairs.map(([a,b])=>[b,a]))]);
 const affected=[...new Set([...previous.map(p=>p.courtId),...normalized.map(p=>p.courtId)])];
 if(affected.length)await db.query('UPDATE courts SET edit_version=edit_version+1 WHERE id=ANY($1::int[])',[affected]);
}
