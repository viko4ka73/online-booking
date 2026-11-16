import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyHallTarget,type Court} from '../../client/src/lib/catalog';
const court=(id:number,hallId:string,sportId:string,sport:string,others:{id:string;name:string}[]=[]):Court=>({
 id,hallId,sportId,sport,name:'Fixture',image:'',players:12,minPlayers:2,hourlyRate:100,extraPlayerHourlyRate:0,hall:'Fixture',description:'',dimensions:'',surface:'',equipment:'',
 sports:[{id:sportId,name:sport,minPlayers:2,hourlyRate:100},...others.map(s=>({...s,minPlayers:2,hourlyRate:100}))]
});
const courts=[court(1,'badminton-hall','badminton','Бадминтон'),court(6,'badminton-hall','badminton','Бадминтон',[{id:'tennis',name:'Теннис'}]),court(7,'hall-1','tennis','Теннис',[{id:'football',name:'Футбол'}])];
test('saved hall links preserve the selected court, sport and booking interval',()=>{
 const target=new URL(legacyHallTarget(courts,'badminton-hall','?sport=Бадминтон&court=6&date=2026-11-20&start=10%3A00&duration=90&repeat=fixture'),'http://localhost');
 assert.equal(target.pathname,'/courts/6');assert.equal(target.searchParams.get('sport'),'badminton');assert.equal(target.searchParams.get('date'),'2026-11-20');assert.equal(target.searchParams.get('start'),'10:00');assert.equal(target.searchParams.get('duration'),'90');assert.equal(target.searchParams.get('repeat'),'fixture');assert.equal(target.searchParams.has('court'),false);
});
test('multi-court halls open a sport catalog and a single resource opens its schedule',()=>{
 assert.equal(legacyHallTarget(courts,'badminton-hall','?sport=badminton&repeat=fixture'),'/courts?sport=badminton');
 assert.equal(legacyHallTarget(courts,'badminton-hall','?sport=tennis'),'/courts/6?sport=tennis');
 assert.equal(legacyHallTarget(courts,'hall-1','?sport=Футбол'),'/courts/7?sport=football');
});
test('unknown halls and incompatible saved court IDs cannot redirect outside the catalog',()=>{
 assert.equal(legacyHallTarget(courts,'missing','?sport=football'),'/courts');
 assert.equal(legacyHallTarget(courts,'%broken',''),'/courts');
 assert.equal(legacyHallTarget(courts,'badminton-hall','?sport=badminton&court=7'),'/courts?sport=badminton');
});
