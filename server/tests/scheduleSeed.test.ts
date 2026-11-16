import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
test('generated schedule respects real occupancy, survives repeats and creates no customer mail',async()=>{
 const bootstrap=new Pool({connectionString:process.env.DATABASE_URL});
 const schema='schedule_test_'+randomUUID().replaceAll('-','');
 await bootstrap.query('CREATE SCHEMA '+schema);
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();
 const {pool,initializeDatabase}=await import('../src/db');
 try{
  await initializeDatabase();
  const admin=randomUUID();await pool.query("INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Fixture administrator',$2,'test-only','admin')",[admin,admin+'@example.invalid']);
  const {localDate}=await import('../src/booking');
  const next=new Date(localDate.format(new Date())+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const date=next.toISOString().slice(0,10);
  const realId=randomUUID();await pool.query("INSERT INTO court_reservations(id,court_id,play_date,start_minute,end_minute,players,sport_id,guest_name) VALUES($1,1,$2,600,660,2,'badminton','Existing fixture')",[realId,date]);
  const {seedSchedule}=await import('../scripts/seed-schedule');
  const result=await seedSchedule(pool,{days:2,firstDate:date});
  assert.ok(result.bookings>0);assert.ok(result.blocks>0);assert.equal(result.courts,21);
  const snapshots=(await pool.query('SELECT id,court_id,play_date,start_minute,end_minute,status,guest_name FROM court_reservations WHERE id=$1',[realId])).rows[0];
  assert.equal(snapshots.start_minute,600);assert.equal(snapshots.end_minute,660);assert.equal(snapshots.status,'active');assert.equal(snapshots.guest_name,'Existing fixture');
  const count=async(sql:string)=>(await pool.query(sql)).rows[0].n;
  assert.equal(await count("SELECT count(*)::int AS n FROM court_reservations a JOIN court_reservations b ON a.id<b.id AND a.court_id=b.court_id AND a.play_date=b.play_date WHERE a.status='active' AND b.status='active' AND a.start_minute<b.end_minute AND a.end_minute>b.start_minute"),0);
  assert.equal(await count("SELECT count(*)::int AS n FROM court_reservations a JOIN court_reservations b ON a.id<>b.id AND a.court_id=b.court_id AND a.play_date=b.play_date WHERE a.status='active' AND b.status='active' AND a.start_minute-b.end_minute=30"),0);
  assert.equal(await count("SELECT count(*)::int AS n FROM court_reservations r JOIN court_time_blocks b ON r.court_id=b.court_id AND r.play_date=b.play_date WHERE r.status='active' AND b.status='active' AND r.start_minute<b.end_minute AND r.end_minute>b.start_minute"),0);
  assert.equal(await count("SELECT count(*)::int AS n FROM court_reservations r JOIN sports s ON s.id=r.sport_id JOIN courts c ON c.id=r.court_id WHERE r.request_key IS NOT NULL AND (r.user_id IS NOT NULL OR r.end_minute-r.start_minute NOT BETWEEN 60 AND 300 OR r.players<s.min_players OR r.players>c.capacity OR r.pricing IS NULL)"),0);
  assert.equal(await count('SELECT count(*)::int AS n FROM email_notifications'),0);
  const again=await seedSchedule(pool,{days:2,firstDate:date});
  assert.equal(again.bookings,0);assert.equal(again.blocks,0);assert.ok(again.skipped>0);
  assert.equal(await count('SELECT count(*)::int AS n FROM court_reservations'),result.bookings+1);
 }finally{await pool.end();await bootstrap.query('DROP SCHEMA '+schema+' CASCADE');await bootstrap.end();}
});
