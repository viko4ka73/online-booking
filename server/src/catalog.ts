import {attachAdjacency} from "./adjacency";
import type { PoolClient } from 'pg';
import { pool } from './db';

type CatalogCourt={id:number;name:string;sportId:string;sport:string;hallId:string;hall:string;rentalMode:'units'|'whole';kind:string;image:string;players:number;minPlayers:number;hourlyRate:number;extraPlayerHourlyRate:number;hourlySurcharge:number;resourceNumber:number|null;description:string;dimensions:string;surface:string;equipment:string};
export async function listCourts(){
  const {rows}=await pool.query<CatalogCourt>(`SELECT c.id,c.name,s.id AS "sportId",s.name AS sport,h.id AS "hallId",h.name AS hall,h.rental_mode AS "rentalMode",c.kind,
    c.resource_number AS "resourceNumber",c.hourly_surcharge AS "hourlySurcharge",
    (SELECT jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name,'courtName',o.name,'minPlayers',o.min_players,
      'hourlyRate',COALESCE((SELECT min(sr.hourly_rate) FROM sport_time_rates sr WHERE sr.sport_id=sp.id),c.hourly_rate)+o.hourly_surcharge) ORDER BY sp.name)
     FROM court_sport_options o JOIN sports sp ON sp.id=o.sport_id WHERE o.court_id=c.id) AS sports,
    c.image,c.capacity AS players,s.min_players AS "minPlayers",
    COALESCE((SELECT min(hourly_rate) FROM sport_time_rates WHERE sport_id=c.sport_id),c.hourly_rate)+c.hourly_surcharge AS "hourlyRate",
    c.extra_player_hourly_rate AS "extraPlayerHourlyRate",c.description,c.dimensions,c.surface,
    COALESCE(NULLIF(c.equipment_description,''),'Инвентарь не указан') AS equipment
    FROM courts c JOIN sports s ON s.id=c.sport_id JOIN halls h ON h.id=c.hall_id
    WHERE c.deleted_at IS NULL
    ORDER BY CASE WHEN h.id='badminton-hall' THEN 1 WHEN h.id='table-tennis-hall' THEN 2 ELSE 3 END,h.name,c.resource_number NULLS LAST,c.id`);
  return attachAdjacency(pool,rows);
}
export async function getCourtOptions(id:number,db:Pick<PoolClient,'query'>=pool,selectedSport?:string){
  const result=await db.query<{id:number;name:string;sportId:string;capacity:number;minPlayers:number;hourlyRate:number;extraPlayerHourlyRate:number;hourlySurcharge:number}>(`
    SELECT c.id,o.name,s.id AS "sportId",c.capacity,o.min_players AS "minPlayers",o.hourly_surcharge AS "hourlySurcharge",
      COALESCE((SELECT min(hourly_rate) FROM sport_time_rates WHERE sport_id=s.id),c.hourly_rate)+o.hourly_surcharge AS "hourlyRate",
      c.extra_player_hourly_rate AS "extraPlayerHourlyRate"
    FROM courts c JOIN court_sport_options o ON o.court_id=c.id JOIN sports s ON s.id=o.sport_id
    WHERE c.id=$1 AND (($2::text IS NULL AND s.id=c.sport_id) OR s.id=$2 OR s.name=$2)`,[id,selectedSport??null]);
  const court=result.rows[0];if(!court)return null;
  const equipment=await db.query<{id:string;name:string;max:number;unitPrice:number}>(`
    SELECT e.id,e.name,ce.max_quantity AS max,e.unit_price AS "unitPrice" FROM court_equipment ce JOIN equipment e ON e.id=ce.equipment_id
    WHERE ce.court_id=$1 AND (NOT EXISTS(SELECT 1 FROM equipment_sports es WHERE es.equipment_id=e.id)
      OR EXISTS(SELECT 1 FROM equipment_sports es WHERE es.equipment_id=e.id AND es.sport_id=$2)) ORDER BY e.id`,[id,court.sportId]);
  const rates=await db.query<{dayType:'weekday'|'weekend';startMinute:number;endMinute:number;hourlyRate:number;extraPlayerHourlyRate:number}>(`
    SELECT day_type AS "dayType",start_minute AS "startMinute",end_minute AS "endMinute",hourly_rate+$2::int AS "hourlyRate",
      extra_player_hourly_rate AS "extraPlayerHourlyRate" FROM sport_time_rates WHERE sport_id=$1 ORDER BY day_type,start_minute`,[court.sportId,court.hourlySurcharge]);
  return {...court,equipment:equipment.rows,rates:rates.rows};
}
export async function listPrices(){
  const [courts,equipment,sports]=await Promise.all([listCourts(),pool.query(`
    SELECT e.id,e.name,e.unit_price AS "unitPrice",array_agg(DISTINCT s.name ORDER BY s.name) AS sports
    FROM equipment e JOIN court_equipment ce ON ce.equipment_id=e.id
    JOIN court_sport_options o ON o.court_id=ce.court_id JOIN sports s ON s.id=o.sport_id
    WHERE NOT EXISTS(SELECT 1 FROM equipment_sports es WHERE es.equipment_id=e.id)
      OR EXISTS(SELECT 1 FROM equipment_sports es WHERE es.equipment_id=e.id AND es.sport_id=s.id)
    GROUP BY e.id ORDER BY e.name`),pool.query(`
    SELECT s.id,s.name,s.min_players AS "minPlayers",EXISTS(SELECT 1 FROM court_sport_options o WHERE o.sport_id=s.id) AS "hasCourts",
      CASE WHEN s.id='table-tennis' THEN jsonb_build_array(jsonb_build_object('hourlySurcharge',(SELECT vip_hourly_surcharge FROM commercial_settings))) ELSE '[]'::jsonb END AS supplements,
      jsonb_agg(jsonb_build_object('dayType',r.day_type,'startMinute',r.start_minute,'endMinute',r.end_minute,'hourlyRate',r.hourly_rate,'extraPlayerHourlyRate',r.extra_player_hourly_rate) ORDER BY r.day_type,r.start_minute) AS rates
    FROM sports s JOIN sport_time_rates r ON r.sport_id=s.id GROUP BY s.id ORDER BY s.name`)]);
  return {courts,equipment:equipment.rows,sports:sports.rows};
}
export async function lockCourtPricing(id:number,db:Pick<PoolClient,'query'>,selectedSport?:string){
  await db.query('SELECT id FROM courts WHERE id=$1 FOR SHARE',[id]);
  const options=await getCourtOptions(id,db,selectedSport);if(!options)return;
  await db.query('SELECT id FROM sports WHERE id=$1 FOR SHARE',[options.sportId]);
  await db.query('SELECT e.id FROM court_equipment ce JOIN equipment e ON e.id=ce.equipment_id WHERE ce.court_id=$1 FOR SHARE OF e,ce',[id]);
  await db.query('SELECT sport_id FROM sport_time_rates WHERE sport_id=$1 FOR SHARE',[options.sportId]);
}
