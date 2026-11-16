import type {Pool} from 'pg';
export async function migrateBadmintonTwo(pool:Pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
  if(!(await db.query("SELECT version FROM schema_migrations WHERE version='022_badminton_two'")).rowCount){
   await db.query(`UPDATE courts SET image='/images/badminton/court-2-v2.jpg',
    description='Светлая площадка у высоких окон для одиночной и парной игры. Зелёное спортивное покрытие с чёткой разметкой и установленная сетка помогают сосредоточиться на тренировке. От соседней площадки игровую зону отделяет сетчатая штора. Ракетки и воланы можно принести с собой или выбрать при бронировании.',
    edit_version=edit_version+1 WHERE hall_id='badminton-hall' AND resource_number=2 AND deleted_at IS NULL`);
   await db.query("INSERT INTO schema_migrations(version) VALUES('022_badminton_two')");
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
