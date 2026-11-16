import type {Pool} from 'pg';
export async function migrateHallPhotos(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='020_hall_photos'")).rowCount){
   for(let number=1;number<=7;number++){
    const image=`/images/halls/hall-${number}.jpg`,hallId=`hall-${number}`;
    // Only replace the original shared photo; preserve uploaded administrator photos.
    await db.query("UPDATE courts SET image=$2,edit_version=edit_version+1 WHERE hall_id=$1 AND kind='whole' AND image='/images/home/volleyball.png'",[hallId,image]);
    await db.query("UPDATE halls SET image=$2 WHERE id=$1 AND image='/images/home/volleyball.png'",[hallId,image]);
   }
   await db.query("INSERT INTO schema_migrations(version) VALUES('020_hall_photos')");
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
