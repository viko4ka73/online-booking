import {scheduleError,formatTime,localDate} from './booking.ts';
const localClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const word=value=>typeof value==='string'&&value.trim().length>0;
const minute=value=>Number.isInteger(value)&&value>=0&&value<=1440&&value%30===0;
function requireValue(condition,message){if(!condition)throw new TypeError(message);}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function prepare(input){
 requireValue(object(input)&&object(input.request),'Input and request must be objects');
 requireValue(typeof input.now==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(input.now),'now must specify its time zone');
 const now=new Date(input.now);requireValue(Number.isFinite(now.getTime()),'Invalid current time');
 const {date,duration,sportId}=input.request;
 const error=scheduleError(date,duration,now);requireValue(error===null,error??'Invalid request');requireValue(word(sportId),'sportId is required');
 const {openingHours:hours,courts,bookings,blocks,adjacency}=input;
 requireValue(hours===null||(object(hours)&&minute(hours.opensAt)&&minute(hours.closesAt)&&hours.opensAt<hours.closesAt),'Invalid opening hours');
 for(const [name,rows] of Object.entries({courts,bookings,blocks,adjacency}))requireValue(Array.isArray(rows),name+' must be an array');
 const ids=new Set();
 for(const c of courts){
  requireValue(object(c)&&Number.isSafeInteger(c.id)&&c.id>0&&!ids.has(c.id),'Court IDs must be positive and unique');ids.add(c.id);
  requireValue(Array.isArray(c.sports)&&c.sports.length>0&&c.sports.every(word)&&new Set(c.sports).size===c.sports.length,'Invalid court sports');
 }
 for(const [kind,rows] of [['booking',bookings],['block',blocks]])for(const b of rows){
  requireValue(object(b)&&ids.has(b.courtId)&&validDate(b.date)&&minute(b.startMinute)&&minute(b.endMinute)&&b.endMinute-b.startMinute>=(kind==='booking'?60:30),'Invalid '+kind+' interval or resource');
  requireValue((kind==='booking'?['active','cancelled']:['active','released']).includes(b.status),'Invalid '+kind+' status');
  if(kind==='booking')requireValue(word(b.sportId),'Booking sportId is required');
 }
 const pairs=new Set();
 for(const link of adjacency){
  requireValue(object(link)&&ids.has(link.courtA)&&ids.has(link.courtB)&&link.courtA!==link.courtB,'Invalid adjacency resources');
  const key=[link.courtA,link.courtB].sort((a,b)=>a-b).join('|');requireValue(!pairs.has(key),'Duplicate adjacency');pairs.add(key);
  requireValue(Array.isArray(link.allowedPairs)&&link.allowedPairs.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(word)),'Invalid allowed sport pairs');
 }
 const [hour,min]=localClock.format(now).split(':').map(Number);
 return {date,duration,sportId,hours,courts:courts.filter(c=>c.sports.includes(sportId)).slice().sort((a,b)=>a.id-b.id),
  bookings:bookings.filter(b=>b.status==='active'&&b.date===date),blocks:blocks.filter(b=>b.status==='active'&&b.date===date),adjacency,
  earliest:date===localDate.format(now)?hour*60+min:-1};
}
function compatible(link,requestCourt,sportId,neighborSport){
 return link.allowedPairs.some(([a,b])=>link.courtA===requestCourt?a===sportId&&b===neighborSport:a===neighborSport&&b===sportId);
}
const overlap=(start,end,row)=>start<row.endMinute&&end>row.startMinute;

// Algorithm 1: check each candidate against lists of occupying intervals.
export function findAvailableScan(input){
 const p=prepare(input);if(p.hours===null)return [];
 const result=[];
 for(const court of p.courts){
  const own=p.bookings.filter(b=>b.courtId===court.id),blocks=p.blocks.filter(b=>b.courtId===court.id);
  const neighbors=p.bookings.filter(b=>p.adjacency.some(link=>
   ((link.courtA===court.id&&link.courtB===b.courtId)||(link.courtB===court.id&&link.courtA===b.courtId))&&!compatible(link,court.id,p.sportId,b.sportId)));
  for(let start=p.hours.opensAt;start+p.duration<=p.hours.closesAt;start+=30){
   if(start<=p.earliest)continue;
   const end=start+p.duration;
   if(own.some(b=>overlap(start,end,b)||start-b.endMinute===30||b.startMinute-end===30))continue;
   if(blocks.some(b=>overlap(start,end,b)))continue;
   if(neighbors.some(b=>overlap(start,end,b)))continue;
   result.push({courtId:court.id,start:formatTime(start),end:formatTime(end)});
  }
 }
 return result;
}
function byCourt(rows){
 const index=new Map();for(const row of rows){if(!index.has(row.courtId))index.set(row.courtId,[]);index.get(row.courtId).push(row);}return index;
}
function intervalMask(start,end){return ((1n<<BigInt((end-start)/30))-1n)<<BigInt(start/30);}
// Algorithm 2: compile half-hour occupancy into a 48-bit BigInt mask.
// Forbidden starts encode only the own-court 30-minute-gap rule; do not expand masks.
export function findAvailableMasks(input){
 const p=prepare(input);if(p.hours===null)return [];
 const reservations=byCourt(p.bookings),blocks=byCourt(p.blocks),links=new Map();
 for(const link of p.adjacency)for(const id of [link.courtA,link.courtB]){if(!links.has(id))links.set(id,[]);links.get(id).push(link);}
 const durationMask=(1n<<BigInt(p.duration/30))-1n;
 const result=[];
 for(const court of p.courts){
  let occupied=0n;const forbiddenStarts=new Set();
  for(const own of reservations.get(court.id)??[]){
   occupied|=intervalMask(own.startMinute,own.endMinute);
   forbiddenStarts.add(own.endMinute+30);forbiddenStarts.add(own.startMinute-p.duration-30);
  }
  for(const block of blocks.get(court.id)??[])occupied|=intervalMask(block.startMinute,block.endMinute);
  for(const link of links.get(court.id)??[]){
   const other=link.courtA===court.id?link.courtB:link.courtA;
   for(const booking of reservations.get(other)??[]){
    if(!compatible(link,court.id,p.sportId,booking.sportId))occupied|=intervalMask(booking.startMinute,booking.endMinute);
   }
  }
  for(let start=p.hours.opensAt;start+p.duration<=p.hours.closesAt;start+=30){
   if(start<=p.earliest||forbiddenStarts.has(start))continue;
   const end=start+p.duration;
   const candidateMask=durationMask<<BigInt(start/30);
   if((occupied&candidateMask)===0n)result.push({courtId:court.id,start:formatTime(start),end:formatTime(end)});
  }
 }
 return result;
}
