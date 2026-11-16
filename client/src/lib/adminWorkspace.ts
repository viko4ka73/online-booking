import { sports } from './catalog';
import type { CalendarPeriod } from './adminBookings';
import type { AdminCourt } from './adminBookings';
export type AdminView='calendar'|'list'|'courts'|'prices'|'equipment';
export type AdminStatus='all'|'upcoming'|'past'|'cancelled';
export type AdminSort='nearest'|'date-asc'|'date-desc';
export type AdminFilters={date:string;sport:string;status:AdminStatus;page:number;sort:AdminSort;search?:string};
export type AdminCalendarGroup='badminton'|'table-tennis'|'halls';
export type AdminSettings=AdminFilters & {view:AdminView;calendarGroup:AdminCalendarGroup;calendarPeriod:CalendarPeriod};
export function calendarGroupForSport(sport:string):AdminCalendarGroup {
  return sport==='Бадминтон'?'badminton':sport==='Настольный теннис'?'table-tennis':'halls';
}
export function getCalendarCourtGroup(court:AdminCourt):AdminCalendarGroup {
  if(court.kind==='whole' || court.rentalMode==='whole')return 'halls';
  const options=court.sports ?? [court.sport];
  if(options.includes('Бадминтон'))return 'badminton';
  if(options.includes('Настольный теннис'))return 'table-tennis';
  return 'halls';
}
export function parseAdminSettings(raw:string|null,today:string):AdminSettings{
  const defaults:AdminSettings={view:'calendar',date:today,sport:'Бадминтон',status:'all',page:1,sort:'nearest',calendarGroup:'badminton',calendarPeriod:'auto'};
  try{
    const value=JSON.parse(raw??'null');if(!value || value.version!==1)return defaults;
    const view:AdminView=['calendar','list','courts','prices','equipment'].includes(value.view)?value.view:'calendar';
    const date=value.date===''? (view==='calendar'?today:'') : typeof value.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && value.date>='0001-01-01' && Number.isFinite(new Date(value.date+'T00:00:00Z').getTime()) && new Date(value.date+'T00:00:00Z').toISOString().slice(0,10)===value.date?value.date:today;
    const sport=value.sport==='' || sports.some(s=>s.name===value.sport)?value.sport:defaults.sport;
    return {view,date,sort:['nearest','date-asc','date-desc'].includes(value.sort)?value.sort:'nearest',calendarPeriod:['auto','morning','day','evening','all'].includes(value.calendarPeriod)?value.calendarPeriod:'auto',calendarGroup:['badminton','table-tennis','halls'].includes(value.calendarGroup)?value.calendarGroup:calendarGroupForSport(sport),sport,
      status:['all','upcoming','past','cancelled'].includes(value.status)?value.status:'all',
      page:Number.isSafeInteger(value.page)&&value.page>=1&&value.page<=1000000?value.page:1};
  }catch{return defaults;}
}
