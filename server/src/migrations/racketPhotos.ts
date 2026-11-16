import type {Pool} from 'pg';
export async function migrateRacketPhotos(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='021_racket_photos'")).rowCount){
   const rows=(await db.query("SELECT id,hall_id,resource_number,is_vip FROM courts WHERE hall_id IN ('badminton-hall','table-tennis-hall') AND image IN ('/images/home/badminton.png','/images/home/table-tennis.png')")).rows;
   for(const court of rows){
    const number=Math.max(1,court.resource_number??1);
    const image=court.hall_id==='badminton-hall'?`/images/badminton/court-${(number-1)%6+1}.jpg`:`/images/table-tennis/table-${court.is_vip?(number-1)%2+1:((Math.max(3,number)-3)%7)+3}.jpg`;
    await db.query('UPDATE courts SET image=$2,edit_version=edit_version+1 WHERE id=$1',[court.id,image]);
   }
   await db.query("UPDATE halls SET image='/images/badminton/court-1.jpg' WHERE id='badminton-hall' AND image='/images/home/badminton.png'");
   await db.query("UPDATE halls SET image='/images/table-tennis/table-3.jpg' WHERE id='table-tennis-hall' AND image='/images/home/table-tennis.png'");
   await db.query("INSERT INTO schema_migrations(version) VALUES('021_racket_photos')");
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
