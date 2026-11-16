import type {Pool} from 'pg';
export async function migrateVipPricing(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='019_vip_pricing'")).rowCount){
   await db.query(`ALTER TABLE courts ADD COLUMN is_vip BOOLEAN NOT NULL DEFAULT false;
    UPDATE courts SET is_vip=true WHERE kind='table' AND (resource_number IN (1,2) OR hourly_surcharge>0);
    ALTER TABLE commercial_settings ADD COLUMN vip_hourly_surcharge INTEGER NOT NULL DEFAULT 3000 CHECK(vip_hourly_surcharge BETWEEN 0 AND 100000000);
    UPDATE commercial_settings SET vip_hourly_surcharge=COALESCE((SELECT hourly_surcharge FROM courts WHERE is_vip AND deleted_at IS NULL ORDER BY resource_number,id LIMIT 1),3000);
    UPDATE courts SET hourly_surcharge=(SELECT vip_hourly_surcharge FROM commercial_settings) WHERE is_vip;
    UPDATE courts SET description=regexp_replace(description,' Доплата к обычному тарифу — [0-9]+ ₽ в час[.]','','g') WHERE is_vip;
    INSERT INTO schema_migrations(version) VALUES('019_vip_pricing');`);
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
