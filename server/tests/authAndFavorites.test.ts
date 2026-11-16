import 'dotenv/config';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import type {Server} from 'node:http';import {Pool} from 'pg';import express from 'express';import cookieParser from 'cookie-parser';import bcrypt from 'bcryptjs';
test('registration, sessions, profile and favorites keep user data isolated and do not grant admin rights',async()=>{
 const bootstrap=new Pool({connectionString:process.env.DATABASE_URL}),schema='account_audit_'+randomUUID().replaceAll('-','');await bootstrap.query('CREATE SCHEMA '+schema);
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.toString();
 const {pool,initializeDatabase}=await import('../src/db');let server:Server|undefined;
 try{
  await initializeDatabase();const [{default:auth},{default:favorites},{default:admin}]=await Promise.all([import('../src/routes/auth'),import('../src/routes/favorites'),import('../src/routes/admin')]);
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/auth',auth);app.use('/api/favorites',favorites);app.use('/api/admin',admin);
  server=await new Promise<Server>(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});const addr=server.address();assert.ok(addr&&typeof addr!=='string');const origin='http://127.0.0.1:'+addr.port;
  const api=async(path:string,method='GET',body?:unknown,cookie='')=>{const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};};
  const email=randomUUID()+'@example.invalid',password='Fixture-'+randomUUID();
  assert.equal((await api('/api/auth/register','POST',{name:'Игрок',email,password:'short'})).status,400);
  const register=await api('/api/auth/register','POST',{name:'Игрок',email:' '+email.toUpperCase()+' ',password,role:'admin'});assert.equal(register.status,201);assert.equal(register.data.user.email,email);assert.equal(register.data.user.role,'user');assert.equal(register.data.user.password_hash,undefined);assert.equal(register.headers.get('cache-control'),'no-store');assert.match(register.headers.get('set-cookie')??'',/HttpOnly/i);assert.match(register.headers.get('set-cookie')??'',/SameSite=Lax/i);
  const hash=(await pool.query('SELECT password_hash FROM app_users WHERE id=$1',[register.data.user.id])).rows[0].password_hash;assert.notEqual(hash,password);assert.equal(await bcrypt.compare(password,hash),true);
  assert.equal((await api('/api/auth/register','POST',{name:'Ещё игрок',email,password})).status,409);
  assert.equal((await api('/api/auth/login','POST',{email,password:'incorrect'})).status,401);
  const login=await api('/api/auth/login','POST',{email,password});assert.equal(login.status,200);const cookie=login.cookie;
  assert.equal((await api('/api/auth/me','GET',undefined,cookie)).data.user.id,register.data.user.id);
  assert.equal((await api('/api/auth/me')).data.user,null);assert.equal((await api('/api/auth/me','GET',undefined,cookie+'corrupted')).data.user,null);
  assert.equal((await api('/api/admin/courts','GET',undefined,cookie)).status,403);
  const profile={name:'Новое имя',email,phone:'+7 (999) 123-45-67',birthDate:'2002-06-02',profilePhoto:null};
  assert.equal((await api('/api/auth/me','PATCH',profile)).status,401);const changed=await api('/api/auth/me','PATCH',profile,cookie);assert.equal(changed.status,200);assert.equal(changed.data.user.birthDate,'2002-06-02');assert.equal((await api('/api/auth/me','GET',undefined,cookie)).data.user.birthDate,'2002-06-02');
  assert.equal((await api('/api/favorites')).status,401);assert.equal((await api('/api/favorites/1','PUT',undefined,cookie)).status,200);assert.equal((await api('/api/favorites/1','PUT',undefined,cookie)).status,200);assert.deepEqual((await api('/api/favorites','GET',undefined,cookie)).data.courtIds,[1]);
  const other=await api('/api/auth/register','POST',{name:'Другой игрок',email:randomUUID()+'@example.invalid',password});assert.equal(other.status,201);assert.deepEqual((await api('/api/favorites','GET',undefined,other.cookie)).data.courtIds,[]);
  assert.equal((await api('/api/auth/me','PATCH',{...profile,email:other.data.user.email},cookie)).status,409);
  assert.equal((await api('/api/favorites/999999','PUT',undefined,cookie)).status,404);assert.equal((await api('/api/favorites/1','DELETE',undefined,cookie)).status,200);assert.deepEqual((await api('/api/favorites','GET',undefined,cookie)).data.courtIds,[]);
  const logout=await api('/api/auth/logout','POST',{},cookie);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie')??'',/Expires=Thu, 01 Jan 1970/i);
 }finally{if(server)await new Promise<void>((done,fail)=>{server!.close(e=>e?fail(e):done());server!.closeAllConnections();});await pool.end();await bootstrap.query('DROP SCHEMA '+schema+' CASCADE');await bootstrap.end();}
});
