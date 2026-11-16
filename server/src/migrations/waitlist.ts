import type {Pool} from 'pg';
export async function migrateWaitlist(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='018_waitlist'")).rowCount)await db.query(`
   CREATE TABLE waitlist_entries(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    court_id INTEGER REFERENCES courts(id),sport_id TEXT NOT NULL REFERENCES sports(id),play_date DATE NOT NULL,
    start_minute SMALLINT NOT NULL CHECK(start_minute>=0 AND start_minute<1440 AND start_minute%30=0),
    duration SMALLINT NOT NULL CHECK(duration BETWEEN 60 AND 300 AND duration%30=0),CHECK(start_minute+duration<=1440),
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','notified','cancelled','expired','fulfilled')),
    version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),checked_at TIMESTAMPTZ,
    notified_at TIMESTAMPTZ,notified_court_id INTEGER REFERENCES courts(id));
   CREATE UNIQUE INDEX waitlist_active_unique ON waitlist_entries(user_id,sport_id,COALESCE(court_id,0),play_date,start_minute,duration) WHERE status IN ('waiting','notified');
   CREATE INDEX waitlist_user_idx ON waitlist_entries(user_id,created_at DESC);
   CREATE INDEX waitlist_pending_idx ON waitlist_entries(checked_at,created_at) WHERE status='waiting';
   CREATE TABLE waitlist_notifications(
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,waitlist_id UUID NOT NULL UNIQUE REFERENCES waitlist_entries(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','skipped','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),sent_at TIMESTAMPTZ,last_error TEXT);
   CREATE INDEX waitlist_mail_pending_idx ON waitlist_notifications(next_attempt_at,id) WHERE status='pending';
   INSERT INTO schema_migrations(version) VALUES('018_waitlist');
  `);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
