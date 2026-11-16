import type {Pool} from 'pg';
export async function migrateAdjacency(pool:Pool){
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  await db.query(`CREATE TABLE IF NOT EXISTS court_adjacency (
   court_a integer NOT NULL REFERENCES courts(id),court_b integer NOT NULL REFERENCES courts(id),
   allowed_pairs jsonb NOT NULL DEFAULT '[]',PRIMARY KEY(court_a,court_b),CHECK(court_a<court_b),CHECK(jsonb_typeof(allowed_pairs)='array'))`);
  if(!(await db.query("SELECT 1 FROM schema_migrations WHERE version='023_adjacency'")).rowCount){
   await db.query(`INSERT INTO court_adjacency(court_a,court_b,allowed_pairs)
    SELECT LEAST(a.id,b.id),GREATEST(a.id,b.id),COALESCE((SELECT jsonb_agg(CASE WHEN a.id<b.id THEN jsonb_build_array(sa.sport_id,sb.sport_id) ELSE jsonb_build_array(sb.sport_id,sa.sport_id) END)
     FROM court_sport_options sa CROSS JOIN court_sport_options sb WHERE sa.court_id=a.id AND sb.court_id=b.id AND ((sa.sport_id='tennis')=(sb.sport_id='tennis'))),'[]'::jsonb)
    FROM courts a JOIN courts b ON b.kind='whole' AND b.resource_number=7 AND b.deleted_at IS NULL
    WHERE a.kind='whole' AND a.resource_number=6 AND a.deleted_at IS NULL ON CONFLICT DO NOTHING`);
   await db.query("INSERT INTO schema_migrations(version) VALUES('023_adjacency')");
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
