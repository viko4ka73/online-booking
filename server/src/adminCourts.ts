import {attachAdjacency} from "./adjacency";
import type { PoolClient } from "pg";
export async function listAdminCourts(db: Pick<PoolClient,"query">, id: number|null = null) {
  const {rows} = await db.query(`SELECT c.id,c.name,c.resource_number AS "resourceNumber",c.hourly_surcharge AS "hourlySurcharge",c.kind,c.is_vip AS "isVip",(SELECT jsonb_agg(jsonb_build_object('id',s2.id,'name',s2.name) ORDER BY s2.name) FROM court_sport_options o JOIN sports s2 ON s2.id=o.sport_id WHERE o.court_id=c.id) AS sports,h.rental_mode AS "rentalMode",c.sport_id AS "sportId",s.name AS sport,EXISTS(SELECT 1 FROM court_sports cs WHERE cs.court_id=c.id) AS "hasSportVariants",(SELECT max(o.min_players) FROM court_sport_options o WHERE o.court_id=c.id) AS "minPlayers",
    c.hall_id AS "hallId",h.name AS hall,c.image,c.capacity,c.description,c.dimensions,c.surface,
    c.equipment_description AS "equipmentDescription",c.edit_version AS version,
    (SELECT count(*)::int FROM court_reservations ur WHERE ur.court_id=c.id AND ur.status='active' AND (ur.play_date+ur.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')) AS "upcomingReservations",
    (SELECT count(*)::int FROM court_time_blocks b WHERE b.court_id=c.id AND b.status='active' AND (b.play_date+b.end_minute*interval '1 minute')>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')) AS "upcomingBlocks",
    EXISTS(SELECT 1 FROM court_reservations r WHERE r.court_id=c.id) AS "hasReservations",
    EXISTS(SELECT 1 FROM court_equipment ce WHERE ce.court_id=c.id) AS "hasEquipment"
    FROM courts c JOIN sports s ON s.id=c.sport_id JOIN halls h ON h.id=c.hall_id
    WHERE c.deleted_at IS NULL AND ($1::int IS NULL OR c.id=$1) ORDER BY c.id`,[id]);
  return attachAdjacency(db,rows);
}
