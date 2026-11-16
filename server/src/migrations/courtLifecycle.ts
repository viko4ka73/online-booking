import type {Pool} from 'pg';
export async function migrateCourtLifecycle(pool:Pool){
  const db=await pool.connect();
  try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
    if(!(await db.query("SELECT 1 FROM schema_migrations WHERE version='014_court_lifecycle'")).rowCount)await db.query(`
      ALTER TABLE courts ADD COLUMN deleted_at TIMESTAMPTZ,ADD COLUMN deleted_by UUID REFERENCES app_users(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX courts_unit_number_idx ON courts(hall_id,resource_number) WHERE resource_number IS NOT NULL AND kind<>'whole' AND deleted_at IS NULL;
      CREATE UNIQUE INDEX courts_hall_number_idx ON courts(resource_number) WHERE resource_number IS NOT NULL AND kind='whole' AND deleted_at IS NULL;
      CREATE OR REPLACE VIEW court_sport_options AS
        SELECT c.id AS court_id,s.id AS sport_id,COALESCE(cs.display_name,c.name) AS name,s.min_players,c.hourly_surcharge
        FROM courts c JOIN halls h ON h.id=c.hall_id CROSS JOIN sports s
        LEFT JOIN court_sports cs ON cs.court_id=c.id AND cs.sport_id=s.id
        WHERE c.deleted_at IS NULL AND (s.id=c.sport_id OR cs.court_id IS NOT NULL OR
          (h.rental_mode='whole' AND EXISTS(SELECT 1 FROM hall_sports hs WHERE hs.hall_id=h.id AND hs.sport_id=s.id)));
      INSERT INTO schema_migrations(version) VALUES('014_court_lifecycle');
    `);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
