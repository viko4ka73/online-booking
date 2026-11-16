import {useEffect,useState} from 'react';
import {FiLock,FiUnlock} from 'react-icons/fi';
import BookingDialog from '../BookingDialog';
import {getBookingDateRange} from '../../lib/bookingDates';
import {timeMinutes,type AdminCourt,type AdminBooking,type OpeningHours,type TimeBlock} from '../../lib/adminBookings';
import {minuteTime} from '../../lib/time';

const field='h-12 w-full min-w-0 rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20';
const primary='inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 text-sm font-semibold text-white disabled:opacity-40';
type Schedule={courts:AdminCourt[];bookings:AdminBooking[];blocks:TimeBlock[];openingHours:OpeningHours|null};
export default function AdminTimeBlockDialog({initialDate,initialCourtId,onClose,onSaved}:{initialDate:string;initialCourtId?:number;onClose:()=>void;onSaved:(block:TimeBlock,court:AdminCourt)=>void}){
 const range=getBookingDateRange();
 const [date,setDate]=useState(initialDate>=range.today&&initialDate<=range.lastDate?initialDate:range.today);
 const [courtId,setCourtId]=useState(initialCourtId??0);
 const [now]=useState(()=>new Date());
 const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const earliest=Math.floor(timeMinutes(localTime)/30)*30;
 const initialMinute=date===range.today?earliest:600;
 const [start,setStart]=useState(()=>minuteTime(initialMinute)),[end,setEnd]=useState(()=>minuteTime(Math.min(1440,initialMinute+30)));
 const [reason,setReason]=useState('Уборка');
 const [schedule,setSchedule]=useState<{date:string;data:Schedule}|null>(null);
 const [error,setError]=useState(''),[pending,setPending]=useState(false);
 const [requestKey]=useState(()=>crypto.randomUUID());
 const data=schedule?.date===date?schedule.data:null;
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/admin/schedule?date='+date,{credentials:'include',signal:controller.signal}).then(async response=>{
   const payload=await response.json();if(!response.ok)throw Error(payload.error||'Не удалось загрузить расписание.');
   if(!controller.signal.aborted)setSchedule({date,data:payload});
  }).catch(err=>{if(!controller.signal.aborted)setError(err.message);});
  return ()=>controller.abort();
 },[date]);
 const court=data?.courts.find(item=>item.id===(courtId||initialCourtId))??data?.courts[0];
 const hours=data?.openingHours;
 const times=hours?Array.from({length:(hours.closesAt-hours.opensAt)/30+1},(_,index)=>minuteTime(hours.opensAt+index*30)):[];
 const conflicts=data&&court?[...data.bookings.filter(item=>item.status==='active'),...(data.blocks??[])].some(item=>item.courtId===court.id&&timeMinutes(start)<timeMinutes(item.end)&&timeMinutes(end)>timeMinutes(item.start)):false;
 const past=date===range.today&&timeMinutes(start)<earliest;
 const valid=Boolean(!past&&court&&hours&&timeMinutes(start)>=hours.opensAt&&timeMinutes(end)<=hours.closesAt&&timeMinutes(end)>timeMinutes(start)&&reason.trim().length>=3&&!conflicts);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(!valid||pending)return;setPending(true);setError('');
  try{
   const response=await fetch('/api/admin/blocks',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({courtId:court!.id,date,start,end,reason,requestKey})});
   const payload=await response.json();if(!response.ok)throw Error(payload.error||'Не удалось закрыть время.');
   onSaved(payload.block,court!);
  }catch(err){setError(err instanceof Error?err.message:'Не удалось закрыть время.');}finally{setPending(false);}
 }
 return <BookingDialog open pending={pending} onClose={onClose} title="Закрыть время">
  <form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
   <p className="rounded-xl bg-[#f3ecdc] p-4 text-sm leading-relaxed text-[#745c30]">Технический перерыв без посетителя и оплаты. У универсального зала время закроется сразу для всех видов спорта.</p>
   <label className="block text-sm font-semibold">Площадка<select required disabled={!data||pending} className={field+' mt-2'} value={court?.id??''} onChange={event=>setCourtId(Number(event.target.value))}>{data?.courts.map(item=><option key={item.id} value={item.id}>{item.name+' · '+item.sport}</option>)}</select></label>
   <label className="block text-sm font-semibold">Дата<input required type="date" min={range.today} max={range.lastDate} value={date} disabled={pending} onChange={event=>{setDate(event.target.value);setError('');}} className={field+' mt-2'}/></label>
   {!data?<p role="status" className="text-sm">Загружаем расписание…</p>:!hours?<p role="alert" className="text-sm">В этот день комплекс закрыт.</p>:<div className="grid grid-cols-2 gap-4">
    <label className="min-w-0 text-sm font-semibold">Начало<select className={field+' mt-2'} value={start} disabled={pending} onChange={event=>{setStart(event.target.value);if(timeMinutes(end)<=timeMinutes(event.target.value))setEnd(minuteTime(timeMinutes(event.target.value)+30));}}>{!times.includes(start)&&<option value={start}>{start}</option>}{times.slice(0,-1).filter(time=>date!==range.today||timeMinutes(time)>=earliest).map(time=><option key={time}>{time}</option>)}</select></label>
    <label className="min-w-0 text-sm font-semibold">Окончание<select className={field+' mt-2'} value={end} disabled={pending} onChange={event=>setEnd(event.target.value)}>{!times.includes(end)&&<option value={end}>{end}</option>}{times.filter(time=>timeMinutes(time)>timeMinutes(start)).map(time=><option key={time}>{time}</option>)}</select></label>
    <button type="button" disabled={pending} onClick={()=>setEnd(minuteTime(hours.closesAt))} className="col-span-2 justify-self-end text-xs font-semibold text-[#69774b] underline">До закрытия · {minuteTime(hours.closesAt)}</button>
   </div>}
   <div><p className="text-sm font-semibold">Причина</p><div className="my-2 flex flex-wrap gap-2">{['Уборка','Ремонт','Мероприятие'].map(value=><button key={value} type="button" disabled={pending} aria-pressed={reason===value} onClick={()=>setReason(value)} className={'rounded-full border px-3 py-2 text-xs '+(reason===value?'border-[#293d30] bg-[#293d30] text-white':'border-[#cdd2c3]')}>{value}</button>)}</div><textarea aria-label="Причина блокировки" required minLength={3} maxLength={300} disabled={pending} value={reason} onChange={event=>setReason(event.target.value)} rows={3} className={field+' h-auto! resize-y py-3'}/></div>
   {past&&<p role="alert" className="text-sm text-[#84523c]">Выберите текущий или будущий интервал.</p>}
   {conflicts&&<p role="alert" className="rounded-xl bg-[#f4e9e2] p-3 text-sm text-[#84523c]">В этом интервале уже есть запись или блокировка. Выберите другое время.</p>}
   {error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}
   <div className="flex flex-wrap justify-end gap-3 border-t border-[#dedfd2] pt-4"><button type="button" disabled={pending} onClick={onClose} className="px-4 text-sm">Отмена</button><button disabled={!valid||pending} className={primary}><FiLock/>{pending?'Сохраняем…':'Закрыть время'}</button></div>
  </form>
 </BookingDialog>;
}

export function AdminTimeBlockDetails({block,onClose,onReleased}:{block:TimeBlock;onClose:()=>void;onReleased:()=>void}){
 const [pending,setPending]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
 const [now]=useState(()=>Date.now());
 const canRelease=new Date(block.date+'T'+block.end+':00+03:00').getTime()>now;
 async function release(){
  setPending(true);setError('');
  try{const response=await fetch('/api/admin/blocks/'+block.id+'/release',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:block.version})});const payload=await response.json();if(!response.ok)throw Error(payload.error);onReleased();}
  catch(err){setError(err instanceof Error?err.message:'Не удалось снять блокировку.');}finally{setPending(false);}
 }
 return <BookingDialog open pending={pending} onClose={onClose} title="Технический перерыв"><div className="space-y-5 p-5 sm:p-7">
  <div className="rounded-2xl bg-[#f3ecdc] p-5"><p className="font-semibold">{block.courtName}</p><p className="mt-2 text-sm">{block.date.split('-').reverse().join('.')} · {block.start}–{block.end}</p></div>
  <p className="whitespace-pre-wrap break-words text-sm">{block.reason}</p><p className="text-xs text-[#748074]">Добавил: {block.createdBy??'Администратор'}</p>
  {error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}
  {canRelease?(confirm?<div className="space-y-3 border-t border-[#dedfd2] pt-4"><p className="text-sm">Снять блокировку? Время станет доступно для бронирования.</p><div className="flex flex-wrap gap-3"><button disabled={pending} onClick={release} className={primary}>{pending?'Снимаем…':'Да, открыть время'}</button><button disabled={pending} onClick={()=>setConfirm(false)} className="text-sm">Назад</button></div></div>:<button onClick={()=>setConfirm(true)} className={primary}><FiUnlock/>Снять блокировку</button>):<p className="text-sm text-[#748074]">Интервал завершён. Запись сохранена в истории.</p>}
 </div></BookingDialog>;
}
