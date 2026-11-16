import test from "node:test";
import assert from "node:assert/strict";
import { calendarCompatibleSports,isCalendarStartFree,calendarBounds,calendarWindow,clipCalendarBooking,getAdminBookingStatus,type AdminBooking } from "../../client/src/lib/adminBookings";

const booking:AdminBooking={id:"fixture",version:1,courtId:1,courtName:"Площадка №1",sport:"Бадминтон",hall:"Зал №1",date:"2026-11-20",start:"10:00",end:"11:00",status:"active",players:2,equipment:[],pricing:null,canModify:true,customer:{name:"Игрок",email:null,phone:null}};
test("calendar bounds include saved games outside updated hours but ignore cancelled games",()=>{
  const hours={opensAt:480,closesAt:1380};
  assert.deepEqual(calendarBounds(hours,[]),{start:480,end:1380});
  assert.deepEqual(calendarBounds(hours,[{...booking,start:"07:30",end:"08:30"},{...booking,start:"23:00",end:"24:00"}]),{start:420,end:1440});
  assert.deepEqual(calendarBounds(hours,[{...booking,start:"01:00",end:"03:00",status:"cancelled"}]),{start:480,end:1380});
  assert.deepEqual(calendarBounds(null,[booking]),{start:600,end:660});
});
test("calendar differentiates future, ongoing, completed and cancelled reservations",()=>{
  assert.equal(getAdminBookingStatus(booking,new Date("2026-11-20T09:59:00+03:00").getTime()).label,"Подтверждено");
  assert.equal(getAdminBookingStatus(booking,new Date("2026-11-20T10:00:00+03:00").getTime()).label,"Идёт игра");
  assert.equal(getAdminBookingStatus(booking,new Date("2026-11-20T11:00:00+03:00").getTime()).label,"Завершено");
  assert.equal(getAdminBookingStatus({...booking,status:"cancelled"},0).label,"Отменено");
});

test('calendar opens the relevant time period and respects opening hours',()=>{
  const bounds={start:480,end:1380};
  assert.equal(calendarWindow(bounds,'auto',779).id,'morning');
  assert.equal(calendarWindow(bounds,'auto',780).id,'day');
  assert.equal(calendarWindow(bounds,'auto',1080).id,'evening');
  assert.deepEqual({...calendarWindow(bounds,'all',900),periods:undefined},{id:'all',start:480,end:1380,periods:undefined});
  const shortDay=calendarWindow({start:600,end:660},'evening',1200);
  assert.equal(shortDay.id,'morning');assert.equal(shortDay.start,600);assert.equal(shortDay.end,660);
  const late=calendarWindow({start:1080,end:1440},'auto',200);
  assert.equal(late.id,'evening');assert.equal(late.end,1440);
});
test('bookings crossing a period boundary remain visible and are clipped inside each grid',()=>{
  const cross={...booking,start:'12:30',end:'13:30'};
  assert.deepEqual(clipCalendarBooking(cross,{start:480,end:780}),{start:750,end:780});
  assert.deepEqual(clipCalendarBooking(cross,{start:780,end:1080}),{start:780,end:810});
  assert.equal(clipCalendarBooking({...cross,end:'13:00'},{start:780,end:1080}),null);
  assert.equal(clipCalendarBooking({...cross,start:'18:00',end:'19:00'},{start:780,end:1080}),null);
});

test('clickable calendar cells reject occupied time, half-hour gaps and closing time',()=>{
 const hours={opensAt:480,closesAt:1380};
 assert.equal(isCalendarStartFree(600,hours,[booking]),false);
 assert.equal(isCalendarStartFree(690,hours,[booking]),false);
 assert.equal(isCalendarStartFree(720,hours,[booking]),true);
 assert.equal(isCalendarStartFree(510,hours,[booking]),false);
 assert.equal(isCalendarStartFree(480,hours,[booking]),true);
 assert.equal(isCalendarStartFree(1350,hours,[]),false);
 assert.equal(isCalendarStartFree(1320,hours,[]),true);
 assert.equal(isCalendarStartFree(600,null,[]),false);
 assert.equal(isCalendarStartFree(600,hours,[{...booking,status:'cancelled'}]),true);
});

test('technical blocks prevent overlap but allow adjacent rentals',()=>{const hours={opensAt:480,closesAt:1380},blocks=[{start:'12:00',end:'12:30'}];assert.equal(isCalendarStartFree(690,hours,[],60,blocks),false);assert.equal(isCalendarStartFree(750,hours,[],60,blocks),true);assert.equal(isCalendarStartFree(660,hours,[],60,blocks),true);});

test('calendar creation chooses a compatible sport in adjacent halls',()=>{
 const courts=[{id:6,name:'Зал №6',sport:'Теннис',hall:'Зал №6',kind:'whole',resourceNumber:6,sports:['Теннис','Футбол']},{id:7,name:'Зал №7',sport:'Теннис',hall:'Зал №7',kind:'whole',resourceNumber:7,sports:['Теннис','Футбол','Баскетбол']}];
 const linked=courts.map(c=>({...c,adjacency:c.id===7?[{courtId:6,allowedPairs:[['tennis','tennis'],['football','football'],['basketball','football']] as [string,string][]}]:[]}));
 const game={...booking,courtId:6,sportId:'tennis',sport:'Теннис'};
 assert.deepEqual(calendarCompatibleSports(linked[1],linked,[game],600),['Теннис']);
 assert.deepEqual(calendarCompatibleSports(linked[1],linked,[{...game,sportId:'football',sport:'Футбол'}],600),['Футбол','Баскетбол']);
 assert.deepEqual(calendarCompatibleSports(linked[1],linked,[game],660),courts[1].sports);
 assert.deepEqual(calendarCompatibleSports(linked[1],linked,[{...game,status:'cancelled'}],600),courts[1].sports);
});
