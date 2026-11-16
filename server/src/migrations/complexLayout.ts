import type { Pool } from 'pg';

// A one-time update of this complex, retaining physical resource IDs and their bookings.
export async function migrateComplexLayout(pool:Pool) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73190351)');
    if((await db.query("SELECT 1 FROM schema_migrations WHERE version='012_complex_layout'")).rowCount){await db.query('COMMIT');return;}
    await db.query('LOCK TABLE halls,courts,court_reservations IN SHARE ROW EXCLUSIVE MODE');
    const image={badminton:'/images/home/badminton.png',table:'/images/home/table-tennis.png',hall:'/images/home/volleyball.png'};
    const badDescription='10 отдельных площадок для бадминтона. Площадка №6 также используется для занятий у теннисной стенки №10: эти форматы имеют общее расписание.';
    const tableDescription='17 столов для настольного тенниса. Столы №1 и №2 расположены отдельно, с увеличенным пространством для игры. Столы №3–17 стоят в общем ряду.';
    for(const h of [{id:'badminton-hall',name:'Бадминтон',image:image.badminton,description:badDescription,dimensions:'10 игровых площадок',surface:'Спортивное покрытие ПВХ'},
      {id:'table-tennis-hall',name:'Настольный теннис',image:image.table,description:tableDescription,dimensions:'17 столов · 2 VIP-зоны',surface:'Спортивный линолеум'}]){
      await db.query(`INSERT INTO halls(id,name,rental_mode,image,description,dimensions,surface) VALUES($1,$2,'units',$3,$4,$5,$6)`,[h.id,h.name,h.image,h.description,h.dimensions,h.surface]);
    }
    await db.query("INSERT INTO hall_sports VALUES('badminton-hall','badminton'),('badminton-hall','tennis'),('table-tennis-hall','table-tennis')");
    // Reuse the existing badminton resources in order, including administrator-created courts.
    const badminton=(await db.query("SELECT id FROM courts WHERE sport_id='badminton' AND kind<>'whole' ORDER BY id")).rows;
    const tables=(await db.query("SELECT id,name FROM courts WHERE sport_id='table-tennis' AND kind<>'whole' ORDER BY id")).rows;
    if(badminton.length>10 || tables.length>17)throw new Error('Existing resources exceed the requested layout; manual mapping required.');
    const configure=async(id:number|null,name:string,sport:string,hall:string,kind:string,number:number,photo:string,capacity:number,description:string,dimensions:string,surface:string,equipment:string,surcharge=0)=>{
      if(id!==null){await db.query(`UPDATE courts SET name=$2,hall_id=$3,kind=$4,resource_number=$5,hourly_surcharge=$6,
        capacity=GREATEST(capacity,$7),description=$8,dimensions=$9,surface=$10,equipment_description=$11,edit_version=edit_version+1 WHERE id=$1`,[id,name,hall,kind,number,surcharge,capacity,description,dimensions,surface,equipment]);return id;}
      return (await db.query(`INSERT INTO courts(name,sport_id,hall_id,kind,resource_number,image,capacity,description,dimensions,surface,equipment_description,hourly_surcharge,hourly_rate,extra_player_hourly_rate)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,min(hourly_rate),min(extra_player_hourly_rate) FROM sport_time_rates WHERE sport_id=$2 RETURNING id`,[name,sport,hall,kind,number,photo,capacity,description,dimensions,surface,equipment,surcharge])).rows[0].id as number;
    };
    let wallId=0;
    for(let n=1;n<=10;n++){
      const id=await configure(badminton[n-1]?.id??null,`Бадминтон №${n}`,'badminton','badminton-hall','court',n,image.badminton,4,
        n===6?'Площадка для бадминтона, которая также используется как теннисная стенка №10. Бронь любого формата занимает всю площадку.':'Отдельная площадка для одиночной или парной игры в бадминтон.',
        '13,4 × 6,1 м','Спортивное покрытие ПВХ','Установлена сетка. Ракетки и воланы можно выбрать при бронировании.');
      await db.query("INSERT INTO court_equipment SELECT $1,id,CASE WHEN id='racket' THEN 4 ELSE 6 END FROM equipment WHERE id IN ('racket','shuttle') ON CONFLICT DO NOTHING",[id]);
      if(n===6)wallId=id;
    }
    await db.query("INSERT INTO court_sports(court_id,sport_id,display_name) VALUES($1,'tennis','Теннисная стенка №10')",[wallId]);
    const tableMap=new Map<number,number>();
    for(const t of tables){const requested=Number(t.name.match(/№\s*(\d+)/)?.[1]);let n=requested>=1&&requested<=17&&!tableMap.has(requested)?requested:1;while(tableMap.has(n))n++;tableMap.set(n,t.id);}
    for(let n=1;n<=17;n++){
      const vip=n<=2;
      const id=await configure(tableMap.get(n)??null,`Стол №${n}${vip?' · VIP':''}`,'table-tennis','table-tennis-hall','table',n,image.table,4,
        vip?'Отдельно расположенный стол с увеличенным пространством вокруг игровой зоны. Доплата к обычному тарифу — 30 ₽ в час.':'Стол в общем игровом ряду №3–17. Подходит для тренировки и одиночной или парной игры.',
        vip?'Отдельная просторная игровая зона':'Место в общем игровом ряду','Спортивный линолеум','Стол и сетка установлены. Ракетки и мячи можно добавить к бронированию.',vip?3000:0);
      await db.query("INSERT INTO court_equipment SELECT $1,id,CASE WHEN id='paddle' THEN 4 ELSE 6 END FROM equipment WHERE id IN ('paddle','table-ball') ON CONFLICT DO NOTHING",[id]);
    }
    // Preserve the existing volleyball resource (and every reservation on it) as hall 4.
    const oldVolley=(await db.query("SELECT id FROM courts WHERE sport_id='volleyball' AND kind<>'whole' ORDER BY id")).rows;
    if(oldVolley.length>3)throw new Error('Existing volleyball resources require manual mapping.');
    for(let n=1;n<=9;n++){
      const hallId=`hall-${n}`,sports=['tennis','football'];
      if([4,5,9].includes(n))sports.push('volleyball');if([4,7,9].includes(n))sports.push('basketball');
      const description=`Универсальный зал №${n}: теннис и мини-футбол${sports.includes('volleyball')?', волейбол':''}${sports.includes('basketball')?', баскетбол':''}. Все виды спорта используют одно пространство и общее расписание.`;
      await db.query(`INSERT INTO halls(id,name,rental_mode,image,description,dimensions,surface) VALUES($1,$2,'whole',$3,$4,'36 × 18 м','Спортивное покрытие')
        ON CONFLICT(id) DO UPDATE SET rental_mode='whole',image=EXCLUDED.image,description=EXCLUDED.description,dimensions=EXCLUDED.dimensions,surface=EXCLUDED.surface`,[hallId,`Зал №${n}`,image.hall,description]);
      await db.query('DELETE FROM hall_sports WHERE hall_id=$1',[hallId]);await db.query('INSERT INTO hall_sports SELECT $1,unnest($2::text[])',[hallId,sports]);
      const oldIndex=[4,5,9].indexOf(n);const old=oldIndex>=0?oldVolley[oldIndex]?.id:null;
      const id=await configure(old??null,`Зал №${n}`,old?'volleyball':'tennis',hallId,'whole',n,image.hall,12,description,'36 × 18 м','Спортивное покрытие','Оборудование подготавливается под выбранный вид спорта. Свой инвентарь можно принести с собой.');
      await db.query("INSERT INTO court_sports(court_id,sport_id,display_name) VALUES($1,'tennis',$2)",[id,`Корт №${n}`]);
      if(sports.includes('volleyball'))await db.query("INSERT INTO court_equipment SELECT $1,id,2 FROM equipment WHERE id='volley-ball' ON CONFLICT DO NOTHING",[id]);
    }
    await db.query("INSERT INTO schema_migrations(version) VALUES('012_complex_layout')");await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
