import type {Pool} from 'pg';
export async function migrateTimeBlocks(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='016_time_blocks'")).rowCount)await db.query(
   "CREATE TABLE court_time_blocks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),court_id INT NOT NULL REFERENCES courts(id),play_date DATE NOT NULL,start_minute SMALLINT NOT NULL CHECK(start_minute>=0 AND start_minute<1440 AND start_minute%30=0),end_minute SMALLINT NOT NULL CHECK(end_minute<=1440 AND end_minute%30=0),reason VARCHAR(300) NOT NULL CHECK(length(trim(reason))>=3),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),version INT NOT NULL DEFAULT 1,created_by UUID NOT NULL REFERENCES app_users(id),request_key UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),released_by UUID REFERENCES app_users(id),released_at TIMESTAMPTZ,CHECK(end_minute-start_minute>=30),UNIQUE(created_by,request_key));"+
   "CREATE INDEX court_time_blocks_schedule_idx ON court_time_blocks(court_id,play_date,start_minute) WHERE status='active';"+
   "INSERT INTO schema_migrations(version) VALUES('016_time_blocks');"
  );
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
