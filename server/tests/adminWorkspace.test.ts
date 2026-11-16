import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdminSettings,getCalendarCourtGroup,calendarGroupForSport} from '../../client/src/lib/adminWorkspace';
const today='2026-11-11';
test('admin workspace preserves the selected date, sport, view, status and page',()=>{
  const saved={version:1,view:'list',date:'2026-11-18',sport:'Футбол',status:'cancelled',page:3};
  assert.deepEqual(parseAdminSettings(JSON.stringify(saved),today),{view:'list',date:'2026-11-18',sport:'Футбол',status:'cancelled',page:3,calendarGroup:'halls',calendarPeriod:'auto',sort:'nearest'});
  assert.equal(parseAdminSettings(JSON.stringify({...saved,date:'',sport:''}),today).date,'');
  assert.equal(parseAdminSettings(JSON.stringify({...saved,date:'',view:'calendar'}),today).date,today);
});
test('admin workspace recovers from invalid stored filters without opening every court',()=>{
  for(const raw of [null,'broken','null','{}',JSON.stringify({version:2,view:'courts',sport:''})]){
    const value=parseAdminSettings(raw,today);assert.equal(value.sport,'Бадминтон');assert.equal(value.date,today);assert.equal(value.view,'calendar');
  }
  const bad=parseAdminSettings(JSON.stringify({version:1,view:'unknown',date:'2026-02-30',sport:'unknown',status:'unknown',page:-1}),today);
  assert.deepEqual(bad,{view:'calendar',date:today,sport:'Бадминтон',status:'all',page:1,calendarGroup:'badminton',calendarPeriod:'auto',sort:'nearest'});
});

test('calendar separates physical groups without duplicating universal halls or the tennis wall',()=>{
  const base={id:1,name:'Площадка',sport:'Бадминтон',hall:'Зал'};
  assert.equal(getCalendarCourtGroup({...base,sports:['Бадминтон','Теннис'],kind:'court'}),'badminton');
  assert.equal(getCalendarCourtGroup({...base,sport:'Настольный теннис',kind:'table'}),'table-tennis');
  assert.equal(getCalendarCourtGroup({...base,kind:'whole',sports:['Футбол','Теннис','Волейбол','Баскетбол']}),'halls');
  assert.equal(calendarGroupForSport('Волейбол'),'halls');
  const saved=parseAdminSettings(JSON.stringify({version:1,sport:'Бадминтон',calendarGroup:'halls',calendarPeriod:'auto',sort:'nearest'}),today);
  assert.equal(saved.calendarGroup,'halls');assert.equal(saved.sport,'Бадминтон');
});

test('calendar period survives navigation and invalid stored values fall back safely',()=>{
  for(const calendarPeriod of ['auto','morning','day','evening','all'])assert.equal(parseAdminSettings(JSON.stringify({version:1,calendarPeriod}),today).calendarPeriod,calendarPeriod);
  assert.equal(parseAdminSettings(JSON.stringify({version:1,calendarPeriod:'invalid'}),today).calendarPeriod,'auto');
});

test('reservation sort is preserved and old or invalid settings use nearest games',()=>{
 for(const sort of ['nearest','date-asc','date-desc'])assert.equal(parseAdminSettings(JSON.stringify({version:1,sort}),today).sort,sort);
 for(const sort of [undefined,'unknown',[],null])assert.equal(parseAdminSettings(JSON.stringify({version:1,sort}),today).sort,'nearest');
});

test('commercial admin sections survive returning to the workspace',()=>{for(const view of ['prices','equipment'])assert.equal(parseAdminSettings(JSON.stringify({version:1,view}),'2026-11-12').view,view);});
