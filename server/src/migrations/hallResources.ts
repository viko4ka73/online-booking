import type { Pool } from "pg";
export async function migrateHallResources(pool: Pool) {
  const db=await pool.connect();
  try {
    await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(73190351)");
    if (!(await db.query("SELECT version FROM schema_migrations WHERE version='010_hall_resources'")).rowCount) await db.query(`
      ALTER TABLE halls ADD COLUMN rental_mode TEXT NOT NULL DEFAULT 'units' CHECK(rental_mode IN ('units','whole')),
        ADD COLUMN image TEXT NOT NULL DEFAULT '', ADD COLUMN description TEXT NOT NULL DEFAULT '',
        ADD COLUMN dimensions TEXT NOT NULL DEFAULT '',ADD COLUMN surface TEXT NOT NULL DEFAULT '';
      UPDATE halls h SET image=c.image,description=c.description,dimensions=c.dimensions,surface=c.surface
        FROM courts c WHERE c.id=(SELECT min(c2.id) FROM courts c2 WHERE c2.hall_id=h.id);
      CREATE TABLE hall_sports(hall_id TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
        sport_id TEXT NOT NULL REFERENCES sports(id),PRIMARY KEY(hall_id,sport_id));
      -- Initial halls previously accepted all sports in the court editor.
      INSERT INTO hall_sports SELECT h.id,s.id FROM halls h CROSS JOIN sports s;
      ALTER TABLE courts ADD COLUMN kind TEXT NOT NULL DEFAULT 'court' CHECK(kind IN ('court','table','whole'));
      UPDATE courts SET kind='table' WHERE sport_id='table-tennis';
      CREATE UNIQUE INDEX courts_whole_hall_idx ON courts(hall_id) WHERE kind='whole';
      ALTER TABLE court_reservations ADD COLUMN sport_id TEXT REFERENCES sports(id);
      UPDATE court_reservations r SET sport_id=c.sport_id FROM courts c WHERE c.id=r.court_id;
      CREATE TABLE hall_creation_requests(user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        request_key UUID NOT NULL,hall_id TEXT NOT NULL UNIQUE REFERENCES halls(id) ON DELETE CASCADE,
        payload_hash TEXT NOT NULL,PRIMARY KEY(user_id,request_key));
      INSERT INTO schema_migrations(version) VALUES('010_hall_resources');
    `);
    await db.query("COMMIT");
  } catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
