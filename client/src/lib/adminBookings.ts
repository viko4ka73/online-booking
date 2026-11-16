import type { Booking } from "./bookings";

export type AdminBooking = Booking & { customer: { name: string | null; email: string | null; phone: string | null } };
export type AdminCourt = { adjacency?:import("./adjacency").CourtAdjacency[]; id: number; name: string; sport: string; hall: string; sports?:string[];kind?:string;rentalMode?:string;hallId?:string;resourceNumber?:number };
export type TimeBlock={id:string;courtId:number;courtName:string;date:string;start:string;end:string;reason:string;version:number;createdBy:string|null};
export type OpeningHours = { opensAt: number; closesAt: number };

export function getAdminBookingStatus(booking: AdminBooking, now = Date.now()) {
  if (booking.status === "cancelled") return { label: "Отменено", style: "bg-[#f4e9e2] text-[#84523c]" };
  if (new Date(`${booking.date}T${booking.end}:00+03:00`).getTime() <= now) return { label: "Завершено", style: "bg-[#edf0eb] text-[#647064]" };
  if (new Date(`${booking.date}T${booking.start}:00+03:00`).getTime() <= now) return { label: "Идёт игра", style: "bg-[#dce8e8] text-[#315c60]" };
  return { label: "Подтверждено", style: "bg-[#e8eddf] text-[#405640]" };
}


export const adminSportColors = [
  {id:'badminton',name:'Бадминтон',backgroundColor:'#e3efdf',borderColor:'#6e9264',color:'#2f5130'},
  {id:'table-tennis',name:'Настольный теннис',backgroundColor:'#e4eef8',borderColor:'#7196bc',color:'#2e4f70'},
  {id:'volleyball',name:'Волейбол',backgroundColor:'#ece6f6',borderColor:'#a08abf',color:'#584278'},
  {id:'basketball',name:'Баскетбол',backgroundColor:'#faeadb',borderColor:'#cf9862',color:'#7b4f29'},
  {id:'football',name:'Футбол',backgroundColor:'#dff0ec',borderColor:'#6eaaa0',color:'#2c6159'},
  {id:'tennis',name:'Теннис',backgroundColor:'#f6e3e9',borderColor:'#be8198',color:'#793c54'},
] as const;
export function getAdminSportColor(booking:Pick<Booking,'sport'|'sportId'>){
  return adminSportColors.find(item=>item.id===booking.sportId)
    ?? adminSportColors.find(item=>item.name===booking.sport)
    ?? {backgroundColor:'#edf0eb',borderColor:'#a2aca0',color:'#526052'};
}

export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function calendarBounds(hours: OpeningHours | null, bookings: Pick<AdminBooking,'status'|'start'|'end'>[]) {
  const active = bookings.filter(booking => booking.status === "active");
  const starts = active.map(booking => timeMinutes(booking.start));
  const ends = active.map(booking => timeMinutes(booking.end));
  const start = Math.floor(Math.min(hours?.opensAt ?? starts[0] ?? 480, ...starts) / 60) * 60;
  const end = Math.ceil(Math.max(hours?.closesAt ?? ends[0] ?? 1080, ...ends) / 60) * 60;
  return { start, end: Math.max(start + 60, end) };
}

export type CalendarPeriod='auto'|'morning'|'day'|'evening'|'all';
export function calendarWindow(bounds:{start:number;end:number},period:CalendarPeriod,anchor:number){
  const periods=[
    {id:'morning' as const,start:bounds.start,end:Math.min(bounds.end,780)},
    {id:'day' as const,start:Math.max(bounds.start,780),end:Math.min(bounds.end,1080)},
    {id:'evening' as const,start:Math.max(bounds.start,1080),end:bounds.end},
  ];
  if(period==='all')return {id:'all' as const,...bounds,periods};
  const valid=periods.filter(item=>item.end>item.start);
  const point=Math.max(bounds.start,Math.min(bounds.end-1,anchor));
  const selected=(period==='auto'?valid.find(item=>point>=item.start&&point<item.end):valid.find(item=>item.id===period))??valid[0];
  return {...selected,periods};
}
export function clipCalendarBooking(booking:Pick<AdminBooking,'start'|'end'>,bounds:{start:number;end:number}){
  const start=Math.max(timeMinutes(booking.start),bounds.start);
  const end=Math.min(timeMinutes(booking.end),bounds.end);
  return end>start?{start,end}:null;
}

export function isCalendarStartFree(start:number,hours:OpeningHours|null,bookings:Pick<AdminBooking,'start'|'end'|'status'>[],duration=60,blocks:Pick<TimeBlock,'start'|'end'>[]=[]){
 const end=start+duration;
 return Boolean(hours&&start>=hours.opensAt&&end<=hours.closesAt&&!blocks.some(block=>start<timeMinutes(block.end)&&end>timeMinutes(block.start))&&!bookings.some(booking=>{
  if(booking.status!=='active')return false;
  const from=timeMinutes(booking.start),to=timeMinutes(booking.end);
  return (start<to&&end>from)||start-to===30||from-end===30;
 }));
}

// Return compatible sports for a new, separate booking in the adjoining halls.
export function calendarCompatibleSports(court:AdminCourt,courts:AdminCourt[],bookings:AdminBooking[],start:number,duration=60){
 const sports=court.sports?.length?court.sports:[court.sport];
 return sports.filter(sport=>{
  const sportId=adminSportColors.find(s=>s.name===sport)?.id??sport;
  return (court.adjacency??[]).every(link=>!courts.some(c=>c.id===link.courtId)||bookings.filter(b=>b.courtId===link.courtId&&b.status==='active'&&start<timeMinutes(b.end)&&start+duration>timeMinutes(b.start)).every(b=>link.allowedPairs.some(([a,other])=>a===sportId&&other===(b.sportId??adminSportColors.find(s=>s.name===b.sport)?.id??b.sport))));
 });
}
