export const fixedNow='2026-11-24T12:00:00+03:00';
export function baseInput(){return {now:fixedNow,request:{sportId:'badminton',date:'2026-11-25',duration:60},openingHours:{opensAt:480,closesAt:600},courts:[{id:1,name:'Бадминтон №1',sports:['badminton']}],bookings:[],blocks:[],adjacency:[]};}
export const row=(start,end)=>({courtId:1,date:'2026-11-25',startMinute:start,endMinute:end,sportId:'badminton',status:'active'});
export const slot=(start,end,courtId=1)=>({courtId,start,end});
export function makeCase(change){const data=baseInput();change(data);return data;}
export const searchCases=[
 ['FREE',baseInput(),[slot('08:00','09:00'),slot('08:30','09:30'),slot('09:00','10:00')]],
 ['CLOSED',makeCase(x=>x.openingHours=null),[]],
 ['TOO-SHORT',makeCase(x=>x.request.duration=180),[]],
 ['OTHER-SPORT',makeCase(x=>x.request.sportId='football'),[]],
 ['NO-COURTS',makeCase(x=>x.courts=[]),[]],
 ['TODAY',makeCase(x=>{x.request.date='2026-11-24';x.openingHours={opensAt:690,closesAt:810};}),[slot('12:30','13:30')]],
 ['SECOND-BEFORE',makeCase(x=>{x.now='2026-11-24T11:59:59+03:00';x.request.date='2026-11-24';x.openingHours={opensAt:720,closesAt:780};}),[slot('12:00','13:00')]],
 ['MOSCOW-MIDNIGHT',makeCase(x=>{x.now='2026-11-24T21:05:00Z';x.request.date='2026-11-25';x.openingHours={opensAt:0,closesAt:90};}),[slot('00:30','01:30')]],
 ['OWN-OVERLAP',makeCase(x=>{x.bookings=[row(480,540)];}),[slot('09:00','10:00')]],
 ['TOUCH-BEFORE',makeCase(x=>{x.openingHours={opensAt:780,closesAt:840};x.bookings=[row(840,900)];}),[slot('13:00','14:00')]],
 ['GAP-AFTER',makeCase(x=>{x.openingHours={opensAt:930,closesAt:990};x.bookings=[row(840,900)];}),[]],
 ['GAP-BEFORE',makeCase(x=>{x.openingHours={opensAt:750,closesAt:810};x.bookings=[row(840,900)];}),[]],
 ['CANCELED',makeCase(x=>{x.bookings=[{...row(480,540),status:'cancelled'}];}),[slot('08:00','09:00'),slot('08:30','09:30'),slot('09:00','10:00')]],
 ['OTHER-DAY',makeCase(x=>{x.bookings=[{...row(480,540),date:'2026-11-23'}];}),[slot('08:00','09:00'),slot('08:30','09:30'),slot('09:00','10:00')]],
 ['BLOCK',makeCase(x=>{x.blocks=[row(480,540)];}),[slot('09:00','10:00')]],
 ['RELEASED',makeCase(x=>{x.blocks=[{...row(480,540),status:'released'}];}),[slot('08:00','09:00'),slot('08:30','09:30'),slot('09:00','10:00')]],
 ['BLOCK-NO-GAP-RULE',makeCase(x=>{x.openingHours={opensAt:570,closesAt:630};x.blocks=[row(480,540)];}),[slot('09:30','10:30')]],
 ['UNIVERSAL',makeCase(x=>{x.courts[0].sports.push('tennis');x.request.sportId='tennis';x.bookings=[row(480,540)];}),[slot('09:00','10:00')]],
 ['NUMERIC-ORDER',makeCase(x=>{x.openingHours={opensAt:480,closesAt:540};x.courts=[10,2,1].map(id=>({id,sports:['badminton']}));}),[slot('08:00','09:00',1),slot('08:00','09:00',2),slot('08:00','09:00',10)]],
 ['FULL-FIVE-HOURS',makeCase(x=>{x.openingHours={opensAt:480,closesAt:780};x.request.duration=300;}),[slot('08:00','13:00')]],
 ['NINETY-MINUTES',makeCase(x=>x.request.duration=90),[slot('08:00','09:30'),slot('08:30','10:00')]],
 ['CLOSING-MIDNIGHT',makeCase(x=>x.openingHours={opensAt:1380,closesAt:1440}),[slot('23:00','24:00')]],
 ['LAST-DAY',makeCase(x=>x.request.date='2027-01-03'),[slot('08:00','09:00'),slot('08:30','09:30'),slot('09:00','10:00')]],
];
function adjacent(requestSport,bookedSport,allowed,reverse=false){
 const x=baseInput();x.request.sportId=requestSport;x.openingHours={opensAt:840,closesAt:900};
 x.courts=[{id:6,sports:['tennis','football','basketball']},{id:7,sports:['tennis','football','basketball']}];
 x.bookings=[{...row(840,900),courtId:reverse?7:6,sportId:bookedSport}];
 x.adjacency=[{courtA:6,courtB:7,allowedPairs:allowed}];return x;
}
searchCases.push(
 ['NEIGHBOR-INCOMPATIBLE',adjacent('football','tennis',[['tennis','tennis']]),[]],
 ['NEIGHBOR-REVERSE',adjacent('football','tennis',[['tennis','tennis']],true),[]],
 ['NEIGHBOR-COMPATIBLE',adjacent('tennis','tennis',[['tennis','tennis']]),[slot('14:00','15:00',7)]],
 ['NEIGHBOR-DIRECTION',adjacent('basketball','football',[['football','basketball']]),[slot('14:00','15:00',7)]],
 ['NEIGHBOR-DIRECTION-REVERSE',adjacent('football','basketball',[['football','basketball']],true),[slot('14:00','15:00',6)]],
 ['NEIGHBOR-EMPTY-PAIRS',adjacent('football','football',[]),[]],
 ['NEIGHBOR-NO-GAP-RULE',(()=>{const x=adjacent('football','tennis',[]);x.openingHours={opensAt:930,closesAt:990};return x;})(),[slot('15:30','16:30',7)]],
 ['NEIGHBOR-TECHNICAL-NOT-SHARED',(()=>{const x=adjacent('football','tennis',[]);x.blocks=[x.bookings[0]];x.bookings=[];return x;})(),[slot('14:00','15:00',7)]],
);
// Deterministic generator; overlapping source bookings are allowed as stress inputs.
export function generatedInput(seed){
 let state=seed>>>0;const next=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
 const x=baseInput();const sports=['badminton','tennis','football'];
 x.courts=Array.from({length:1+next(8)},(_,i)=>({id:i+1,sports:[...sports]}));
 x.request.sportId=sports[next(3)];x.request.duration=[60,90,120,180,300][next(5)];x.openingHours={opensAt:480,closesAt:1380};
 for(let i=1;i<x.courts.length;i++)x.adjacency.push({courtA:i,courtB:i+1,allowedPairs:sports.flatMap(a=>sports.filter(()=>next(2)).map(b=>[a,b]))});
 for(let i=0;i<next(35)+5;i++){
  const start=480+next(26)*30,end=Math.min(1380,start+[60,90,120][next(3)]);
  x.bookings.push({courtId:1+next(x.courts.length),date:next(5)?'2026-11-25':'2026-11-26',startMinute:start,endMinute:end,sportId:sports[next(3)],status:next(4)?'active':'cancelled'});
 }
 for(let i=0;i<3;i++){const start=480+next(28)*30;x.blocks.push({courtId:1+next(x.courts.length),date:'2026-11-25',startMinute:start,endMinute:start+30,status:next(3)?'active':'released'});}
 return x;
}
