import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {Pool} from 'pg';

test('profile rejects invalid dates and partial phones without losing saved data',async()=>{
 const bootstrap=new Pool({connectionString:process.env.DATABASE_URL});
 const schema='profile_test_'+randomUUID().replaceAll('-','');await bootstrap.query('CREATE SCHEMA '+schema);
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();
 const {pool,initializeDatabase}=await import('../src/db');let server:Server|undefined;
 try{
  await initializeDatabase();const {default:auth}=await import('../src/routes/auth');
  const id=randomUUID(),email=id+'@example.invalid';
  await pool.query("INSERT INTO app_users(id,name,email,password_hash) VALUES($1,'Test player',$2,'test-only')",[id,email]);
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/auth',auth);
  server=await new Promise<Server>(done=>{const instance=app.listen(0,'127.0.0.1',()=>done(instance));});const address=server.address();assert.ok(address&&typeof address!=='string');
  const cookie='sport_booking_session='+jwt.sign({},process.env.JWT_SECRET!,{subject:id,issuer:'sport-booking-api',audience:'sport-booking-client',expiresIn:'5m'});
  const core={name:'Test player',email,phone:'+7 (999)(123)(45)(67)',birthDate:'2002-06-02',profilePhoto:null};
  const save=async(changes:object={})=>{const response=await fetch('http://127.0.0.1:'+address.port+'/api/auth/me',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({...core,...changes})});return {status:response.status,data:await response.json()};};
  const valid=await save();assert.equal(valid.status,200);assert.equal(valid.data.user.birthDate,'2002-06-02');
  for(const birthDate of ['0000-01-01','2002-13-01','2002-02-30','not-a-date','2999-01-01'])assert.equal((await save({birthDate})).status,400,birthDate);
  for(const phone of ['+7 (123)(456)','+7','1234567','+799912345678'])assert.equal((await save({phone})).status,400,phone);
  const stored=(await pool.query("SELECT phone,to_char(birth_date,'YYYY-MM-DD') AS date FROM app_users WHERE id=$1",[id])).rows[0];assert.equal(stored.phone,core.phone);assert.equal(stored.date,core.birthDate);
  assert.equal((await save({birthDate:'2000-02-29'})).status,200);
  assert.equal((await save({phone:'',birthDate:''})).status,200);
 }finally{
  if(server){server.closeAllConnections();await new Promise<void>(done=>server!.close(()=>done()));}
  await pool.end();await bootstrap.query('DROP SCHEMA '+schema+' CASCADE');await bootstrap.end();
 }
});
