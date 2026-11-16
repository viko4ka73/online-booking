import type {Pool} from 'pg';
export async function migrateAdminReservations(pool:Pool){
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='015_admin_reservations'")).rowCount)await db.query(`
   ALTER TABLE court_reservations ADD COLUMN created_by UUID REFERENCES app_users(id), ADD COLUMN guest_name VARCHAR(100), ADD COLUMN guest_phone VARCHAR(24);
   CREATE UNIQUE INDEX court_reservations_admin_request_idx ON court_reservations(created_by,request_key) WHERE created_by IS NOT NULL;
   INSERT INTO schema_migrations(version) VALUES('015_admin_reservations');
  `);await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
