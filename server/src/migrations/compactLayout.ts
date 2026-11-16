import type { Pool } from 'pg';

export async function migrateCompactLayout(pool:Pool){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
    if((await db.query("SELECT 1 FROM schema_migrations WHERE version='013_compact_layout'")).rowCount){await db.query('COMMIT');return;}
    await db.query('LOCK TABLE courts,halls,court_reservations,user_favorite_courts IN SHARE ROW EXCLUSIVE MODE');
    const removed=(await db.query<{id:number}>(`SELECT id FROM courts WHERE
      (hall_id='badminton-hall' AND resource_number>6) OR
      (hall_id='table-tennis-hall' AND resource_number>8) OR hall_id IN ('hall-8','hall-9')`)).rows.map(row=>row.id);
    const protectedRows=await db.query(`SELECT 1 FROM court_reservations WHERE court_id=ANY($1::int[])
      UNION ALL SELECT 1 FROM user_favorite_courts WHERE court_id=ANY($1::int[]) LIMIT 1`,[removed]);
    if(protectedRows.rowCount)throw new Error('На исключаемых площадках есть записи или избранное. Требуется сохранить их перед изменением структуры.');
    await db.query('DELETE FROM court_equipment WHERE court_id=ANY($1::int[])',[removed]);
    await db.query('DELETE FROM court_sports WHERE court_id=ANY($1::int[])',[removed]);
    await db.query('DELETE FROM court_creation_requests WHERE court_id=ANY($1::int[])',[removed]);
    await db.query('DELETE FROM courts WHERE id=ANY($1::int[])',[removed]);
    await db.query("DELETE FROM halls WHERE id IN ('hall-8','hall-9')");
    await db.query(`UPDATE halls SET description='6 площадок для бадминтона. №6 также используется как теннисная стенка: у двух форматов общее расписание.',dimensions='6 игровых площадок' WHERE id='badminton-hall'`);
    await db.query(`UPDATE halls SET description='8 столов для настольного тенниса. №1–2 расположены отдельно в просторных VIP-зонах, №3–8 — в общем игровом ряду.',dimensions='8 столов · 2 VIP-зоны' WHERE id='table-tennis-hall'`);
    await db.query(`UPDATE courts SET name='Бадминтон №6 · стенка',description='Площадка №6 для бадминтона и занятий у теннисной стенки. Бронь одного формата закрывает время для другого.',edit_version=edit_version+1 WHERE hall_id='badminton-hall' AND resource_number=6`);
    await db.query(`UPDATE court_sports cs SET display_name='Теннисная стенка №6' FROM courts c WHERE cs.court_id=c.id AND c.hall_id='badminton-hall' AND c.resource_number=6 AND cs.sport_id='tennis'`);
    await db.query(`UPDATE courts SET description='Стол в общем игровом ряду №3–8. Подходит для одиночной и парной игры.',edit_version=edit_version+1 WHERE hall_id='table-tennis-hall' AND resource_number BETWEEN 3 AND 8`);
    for(let n=1;n<=7;n++){
      const hallId=`hall-${n}`,team=[4,5,7].includes(n);
      const sports=team?['tennis','football','volleyball','basketball']:['tennis','football'];
      await db.query('DELETE FROM hall_sports WHERE hall_id=$1',[hallId]);
      await db.query('INSERT INTO hall_sports SELECT $1,unnest($2::text[])',[hallId,sports]);
      const description=`Универсальный зал №${n}: теннис и мини-футбол${team?', волейбол и баскетбол':''}. Все виды спорта используют одно пространство и общее расписание.`;
      await db.query('UPDATE halls SET description=$2 WHERE id=$1',[hallId,description]);
      await db.query('UPDATE courts SET description=$2,edit_version=edit_version+1 WHERE hall_id=$1',[hallId,description]);
      if(team)await db.query(`INSERT INTO court_equipment(court_id,equipment_id,max_quantity) SELECT c.id,e.id,2 FROM courts c CROSS JOIN equipment e WHERE c.hall_id=$1 AND e.id='volley-ball' ON CONFLICT DO NOTHING`,[hallId]);
    }
    await db.query("INSERT INTO schema_migrations(version) VALUES('013_compact_layout')");await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
