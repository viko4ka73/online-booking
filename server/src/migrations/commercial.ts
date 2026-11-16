import type {Pool} from 'pg';
export async function migrateCommercial(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='017_commercial'")).rowCount){
   await db.query("CREATE TABLE commercial_settings(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),version INTEGER NOT NULL DEFAULT 1); INSERT INTO commercial_settings DEFAULT VALUES; INSERT INTO schema_migrations(version) VALUES('017_commercial')");
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
