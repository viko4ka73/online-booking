import AppLink from "./AppLink";
import {useEffect,useState,type FormEvent} from 'react';
import {FiBell,FiMail} from 'react-icons/fi';
import BookingDialog from './BookingDialog';
import {isFutureWaitlistStart,waitlistBookingUrl} from '../lib/waitlist';
const field='mt-2 h-12 w-full min-w-0 rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm font-medium text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20';
type Props={court:{id:number;name:string;sportId?:string};date:string;duration:number;onClose:()=>void;onSaved:(message:string)=>void};
type Options={slots:{start:string;end:string}[];sportId:string;courtName:string};
export default function WaitlistDialog({court,date,duration,onClose,onSaved}:Props){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  const update=()=>{if(document.visibilityState==='visible')setNow(Date.now);};
  const timer=window.setInterval(update,1000);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};
 },[]);
 const [scope,setScope]=useState('court'),[start,setStart]=useState(''),[refresh,setRefresh]=useState(0);
 const [result,setResult]=useState<{key:string;data?:Options;error?:string}|null>(null);
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[available,setAvailable]=useState<{courtId:number;sportId:string;start:string}|null>(null);
 const query=new URLSearchParams({courtId:String(court.id),date,duration:String(duration),scope,...(court.sportId?{sport:court.sportId}:{})}).toString(),key=query+'|'+refresh;
 const options=result?.key.startsWith(query+'|')?result.data:null;
 const futureSlots=options?.slots.filter(slot=>isFutureWaitlistStart(date,slot.start,now))??[];
 const selected=futureSlots.find(slot=>slot.start===start);
 const selectedExpired=Boolean(start&&!isFutureWaitlistStart(date,start,now));
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/waitlist/options?'+query,{credentials:'include',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setResult({key,data});}).catch(err=>{if(!controller.signal.aborted)setResult({key,error:err.message||'Не удалось загрузить время.'});});
  return()=>controller.abort();
 },[query,key]);
 useEffect(()=>{
  if(pending)return;
  const update=()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);};
  const timer=window.setInterval(update,15000);document.addEventListener('visibilitychange',update);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[pending]);
 async function submit(event:FormEvent){
  event.preventDefault();if(!selected||!options||pending)return;
  if(!isFutureWaitlistStart(date,selected.start)){setNow(Date.now);setError('Начало интервала уже прошло. Выберите будущее время.');return;}
  setPending(true);setError('');setAvailable(null);
  try{
   const response=await fetch('/api/waitlist',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({courtId:court.id,sportId:options.sportId,date,duration,start:selected.start,scope})});
   const data=await response.json();
   if(!response.ok){setNow(Date.now);if(data.availableCourtId){setAvailable({courtId:data.availableCourtId,sportId:data.sportId,start:selected.start});setRefresh(value=>value+1);}throw Error(data.error||'Не удалось оставить заявку.');}
   onSaved(data.existing?'Эта заявка уже есть в вашем листе ожидания.':'Заявка добавлена. Когда время освободится, сообщим на почту из профиля.');
  }catch(err){setError(err instanceof Error?err.message:'Не удалось сохранить заявку.');}finally{setPending(false);}
 }
 return <BookingDialog open pending={pending} onClose={onClose} title="Лист ожидания"><form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
  <div className="rounded-2xl bg-[#e8eddf] p-4"><p className="font-semibold">{court.name}</p><p className="mt-2 text-sm">{date.split('-').reverse().join('.')} · {Math.floor(duration/60)} ч{duration%60?" 30 мин":""}</p></div>
  <fieldset disabled={pending} className="space-y-4"><legend className="sr-only">Условия ожидания</legend>
   <label className="block text-sm font-semibold">Какая площадка подойдёт<select value={scope} onChange={e=>{setScope(e.target.value);setStart('');setError('');setAvailable(null);}} className={field}><option value="court">Только эта площадка</option><option value="sport">Любая площадка этого вида спорта</option></select></label>
   {options?futureSlots.length?<label className="block text-sm font-semibold">Ожидаемое время<select aria-label="Ожидаемое время" className={field} value={selected?.start??""} onChange={e=>{setStart(e.target.value);setError('');setAvailable(null);}}><option value="" disabled>Выберите занятый интервал</option>{futureSlots.map(slot=><option key={slot.start} value={slot.start}>{slot.start}–{slot.end}</option>)}</select><span className="mt-2 block text-xs font-normal leading-relaxed text-[#748074]">Только будущие интервалы, занятые бронью или техническим перерывом. Прошедшее и свободное время скрыто.</span></label>:<p role="status" className="rounded-xl bg-[#eff2e8] p-4 text-sm leading-relaxed">На эту дату нет будущих занятых интервалов для выбранных условий. Выберите другое время в календаре или воспользуйтесь подбором свободных площадок.</p>:result?.key===key&&result.error?<div role="alert" className="text-sm text-[#84523c]">{result.error}<button type="button" onClick={()=>setRefresh(value=>value+1)} className="mt-2 block underline">Попробовать снова</button></div>:<p role="status" className="text-sm">Загружаем интервалы…</p>}
  </fieldset>
  <p className="flex gap-2 rounded-xl border border-[#d8dbce] p-4 text-xs leading-relaxed text-[#536354]"><FiMail size={17} className="shrink-0"/>Письмо придёт на почту из профиля. Место не закрепляется: после уведомления нужно самостоятельно подтвердить бронь. Управлять заявкой можно в личном кабинете.</p>
  {start&&options&&!selected&&<p role="status" className="text-sm text-[#536354]">{selectedExpired?'Начало выбранного интервала уже прошло. Выберите будущее время.':'Выбранный интервал больше не занят. Выберите другое время.'}</p>}
  {error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}
  {available&&isFutureWaitlistStart(date,available.start,now)&&<AppLink href={waitlistBookingUrl({courtId:available.courtId,notifiedCourtId:null,sportId:available.sportId,sport:'',date,start:available.start,duration})} className="block text-sm font-semibold underline!">Перейти к свободному времени</AppLink>}
  <div className="flex flex-wrap justify-end gap-3 border-t border-[#dedfd2] pt-4"><button type="button" disabled={pending} onClick={onClose} className="px-4 text-sm">Закрыть</button><button disabled={pending||!selected} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 text-sm font-semibold text-white disabled:opacity-40"><FiBell/>{pending?'Сохраняем…':'Сообщить, когда освободится'}</button></div>
 </form></BookingDialog>;
}
