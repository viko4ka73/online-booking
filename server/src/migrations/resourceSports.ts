import type { Pool } from 'pg';

export async function migrateResourceSports(pool:Pool) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
    if (!(await db.query("SELECT 1 FROM schema_migrations WHERE version='011_resource_sports'")).rowCount) await db.query(`
      ALTER TABLE courts ADD COLUMN resource_number INTEGER CHECK(resource_number>0),
        ADD COLUMN hourly_surcharge INTEGER NOT NULL DEFAULT 0 CHECK(hourly_surcharge>=0);
      CREATE TABLE court_sports(court_id INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        sport_id TEXT NOT NULL REFERENCES sports(id),display_name TEXT,
        PRIMARY KEY(court_id,sport_id));
      CREATE TABLE equipment_sports(equipment_id TEXT NOT NULL REFERENCES equipment(id),sport_id TEXT NOT NULL REFERENCES sports(id),PRIMARY KEY(equipment_id,sport_id));
      INSERT INTO equipment_sports SELECT DISTINCT ce.equipment_id,c.sport_id FROM court_equipment ce JOIN courts c ON c.id=ce.court_id;
      CREATE VIEW court_sport_options AS
        SELECT c.id AS court_id,s.id AS sport_id,COALESCE(cs.display_name,c.name) AS name,
          s.min_players,c.hourly_surcharge
        FROM courts c JOIN halls h ON h.id=c.hall_id CROSS JOIN sports s
        LEFT JOIN court_sports cs ON cs.court_id=c.id AND cs.sport_id=s.id
        WHERE s.id=c.sport_id OR cs.court_id IS NOT NULL OR
          (h.rental_mode='whole' AND EXISTS(SELECT 1 FROM hall_sports hs WHERE hs.hall_id=h.id AND hs.sport_id=s.id));
      INSERT INTO schema_migrations(version) VALUES('011_resource_sports');
    `);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
