export type WaitlistEntry={id:string;courtId:number|null;sportId:string;sport:string;courtName:string|null;date:string;start:string;end:string;duration:number;status:'waiting'|'notified'|'cancelled'|'expired'|'fulfilled';version:number;notifiedCourtId:number|null;notifiedCourtName:string|null;notifiedAt:string|null;deliveryStatus:string|null};
export function isFutureWaitlistStart(date:string,start:string,now=Date.now()){
 const timestamp=new Date(date+'T'+start+':00+03:00').getTime();
 return Number.isFinite(timestamp)&&timestamp>now;
}
export function waitlistBookingUrl(entry:Pick<WaitlistEntry,'courtId'|'notifiedCourtId'|'sportId'|'sport'|'date'|'start'|'duration'>){
 const courtId=entry.notifiedCourtId??entry.courtId;
 const params=new URLSearchParams({sport:courtId?entry.sportId:entry.sport,date:entry.date,start:entry.start,duration:String(entry.duration)});
 return (courtId?'/courts/'+courtId:'/courts')+'?'+params;
}
