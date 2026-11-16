import {useEffect,useRef,useState,type FormEvent,type SelectHTMLAttributes} from 'react';
import {FiArrowLeft,FiArrowRight,FiChevronDown,FiUser,FiCalendar,FiCheck,FiMail,FiPhone,FiClock} from 'react-icons/fi';
import {emailError} from '../../lib/email';
import {formatRussianPhone} from '../../lib/phone';
import EmailInput from "../EmailInput";
import PhoneInput from '../PhoneInput';
import BookingDialog from '../BookingDialog';
import BookingForm,{type AdminCustomer} from '../BookingForm';
import {courtForSport,sports,type Court} from '../../lib/catalog';
import {getBookingDateRange,bookingDurations as durations} from '../../lib/bookingDates';
import type {Booking} from '../../lib/bookings';

type Slot={start:string;end:string};
type Details={court:Court;date:string;duration:number;slot:Slot;customer:AdminCustomer;visitorName?:string};
const field='mt-1.5 block h-12 w-full min-w-0 rounded-xl border border-[#d8dbce] appearance-none bg-white px-3.5 py-3 text-sm font-normal leading-5 transition shadow-[0_1px_2px_rgba(32,49,38,0.03)] text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20 disabled:bg-[#f0f1ea] disabled:text-[#86907f]';
const label='block min-w-0 text-xs font-semibold text-[#536354]';
function Select({children,...props}:SelectHTMLAttributes<HTMLSelectElement>){return <span className="relative block"><select {...props} className={`${field} appearance-none pr-9`}>{children}</select><FiChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"/></span>;}
export default function AdminCreateBookingDialog({initialDate,initialSport,initialCourtId,initialStart,onClose,onCreated}:{initialDate:string;initialSport:string;initialCourtId?:number;initialStart?:string;onClose:()=>void;onCreated:(booking:Booking,message:string)=>void}){
 const {today,lastDate}=getBookingDateRange();
 const [date,setDate]=useState(initialDate>=today&&initialDate<=lastDate?initialDate:today);
 const [sport,setSport]=useState(sports.some(item=>item.name===initialSport)?initialSport:'Бадминтон');
 const [courtId,setCourtId]=useState(initialCourtId??0),[duration,setDuration]=useState(60);
 const [catalog,setCatalog]=useState<{courts?:Court[];error?:string}|null>(null),[attempt,setAttempt]=useState(0);
 const [availability,setAvailability]=useState<{key:string;slots?:Slot[];error?:string}|null>(null);
 const [choice,setChoice]=useState<{key:string;start:string}|null>(null);
 const [mode,setMode]=useState<'account'|'guest'>('account');
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState('');
 const [lookupAttempt,setLookupAttempt]=useState(0);
 const [lookup,setLookup]=useState<{key:string;customer?:{id:string;name:string;email:string;phone:string|null}|null;error?:string}|null>(null);
 const lookupKey=email+'|'+lookupAttempt;
 const validEmail=Boolean(email&&!emailError(email));
 const account=mode==='account'&&lookup?.key===lookupKey?lookup:null;
 useEffect(()=>{
  if(mode!=='account'||!validEmail)return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   fetch('/api/admin/customers/lookup?'+new URLSearchParams({email}),{credentials:'include',signal:controller.signal}).then(async response=>{
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Не удалось найти аккаунт.');
    if(!controller.signal.aborted)setLookup({key:lookupKey,customer:payload.customer});
   }).catch(error=>{if(!controller.signal.aborted)setLookup({key:lookupKey,error:error instanceof Error?error.message:'Не удалось загрузить данные посетителя.'});});
  },350);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[email,lookupKey,validEmail,mode]);
 const [details,setDetails]=useState<Details|null>(null),[pending,setPending]=useState(false);
 const [formError,setFormError]=useState('');
 const stepHeader=useRef<HTMLDivElement>(null);
 useEffect(()=>{stepHeader.current?.closest('.booking-dialog__body')?.scrollTo({top:0,behavior:'instant'});},[details]);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/courts',{signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error();if(!controller.signal.aborted)setCatalog({courts:payload.courts});}).catch(()=>{if(!controller.signal.aborted)setCatalog({error:'Не удалось загрузить площадки.'});});
  return()=>controller.abort();
 },[attempt]);
 const courts=(catalog?.courts??[]).flatMap(court=>{const selected=courtForSport(court,sport);return selected?[selected]:[];}).sort((a,b)=>(a.resourceNumber??a.id)-(b.resourceNumber??b.id));
 const court=courts.find(item=>item.id===courtId)??courts[0];
 const selectedCourtId=court?.id;
 const selectedSportId=court?.sportId;
 const availabilityKey=`${court?.id??0}|${selectedSportId??sport}|${date}|${duration}|${attempt}`;
 const current=availability?.key===availabilityKey?availability:null;
 const [useInitialStart,setUseInitialStart]=useState(true);
 const slot=choice?.key===availabilityKey?current?.slots?.find(item=>item.start===choice.start):useInitialStart&&date===initialDate&&duration===60&&court?.id===initialCourtId?current?.slots?.find(item=>item.start===initialStart):undefined;
 useEffect(()=>{
  if(!selectedCourtId||date<today||date>lastDate)return;
  const controller=new AbortController();
  const query=new URLSearchParams({date,duration:String(duration),...(selectedSportId?{sport:selectedSportId}:{})});
  fetch(`/api/courts/${selectedCourtId}/availability?${query}`,{signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error);if(!controller.signal.aborted)setAvailability({key:availabilityKey,slots:payload.slots});}).catch(error=>{if(!controller.signal.aborted)setAvailability({key:availabilityKey,error:error instanceof Error&&error.message?error.message:'Не удалось загрузить свободное время.'});});
  return()=>controller.abort();
 },[selectedCourtId,selectedSportId,date,duration,availabilityKey,today,lastDate]);
 function next(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!court||!slot||(mode==='account'&&!account?.customer))return;setFormError('');
  if(mode==='guest'&&(name.trim().length<2||!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)){setFormError('Проверьте имя и телефон посетителя: номер должен содержать от 10 до 15 цифр.');return;}
  setDetails({court,date,duration,slot,visitorName:account?.customer?.name,customer:mode==='account'?{mode,email:email.trim()}:{mode,name:name.trim(),phone:phone.trim()}});
 }
 function tomorrow(){const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);setDate(next.toISOString().slice(0,10));}
 return <BookingDialog wide open pending={pending} onClose={onClose} title="Создание записи">
  <div ref={stepHeader} className="px-5 pt-4 sm:px-7">
   <nav aria-label="Шаги создания записи" className="grid grid-cols-2 gap-2 rounded-xl bg-[#eef0e7] p-1">
    <button type="button" aria-current={!details?'step':undefined} disabled={!details||pending} onClick={()=>setDetails(null)} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition disabled:opacity-100 sm:text-sm ${!details?'bg-white text-[#293d30] shadow-sm':'text-[#697567] hover:bg-white/60'}`}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${!details?'bg-[#293d30] text-white':'bg-[#dce5d0] text-[#536b40]'}`}>{details?<FiCheck aria-hidden="true"/>:'1'}</span>Посетитель и время</button>
    <span aria-current={details?'step':undefined} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${details?'bg-white text-[#293d30] shadow-sm':'text-[#86907f]'}`}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${details?'bg-[#293d30] text-white':'border border-[#cdd2c3]'}`}>2</span>Игроки и стоимость</span>
   </nav>
  </div>
  {details?<><div className="px-5 pt-4 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce2d2] bg-[#f1f5ea] px-3.5 py-3"><p className="flex min-w-0 items-center gap-2 break-all text-xs font-semibold text-[#536354]"><FiUser className="shrink-0" aria-hidden="true"/>{details.customer.mode==='account'?[details.visitorName,details.customer.email].filter(Boolean).join(' · '):`${details.customer.name} · ${details.customer.phone}`}</p><button type="button" disabled={pending} onClick={()=>setDetails(null)} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 text-xs font-semibold text-[#536354] underline underline-offset-4 disabled:opacity-40"><FiArrowLeft aria-hidden="true"/>Изменить</button></div></div>
   <BookingForm courtId={details.court.id} sportId={details.court.sportId} date={details.date} start={details.slot.start} end={details.slot.end} duration={details.duration} adminCustomer={details.customer} signedIn onLogin={()=>{}} onPendingChange={setPending} onRefresh={()=>{setDetails(null);setChoice(null);setUseInitialStart(false);setAttempt(value=>value+1);}} onBooked={(message,booking)=>{if(booking)onCreated(booking,message);}}/>
  </>:<form onSubmit={next} onChange={()=>setFormError('')}><div className="grid items-start gap-4 p-5 sm:p-7 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
   <section aria-labelledby="new-booking-visitor" className="min-w-0 space-y-4 rounded-2xl border border-[#dce0d2] bg-white/50 p-4">
    <h3 id="new-booking-visitor" className="flex items-center gap-2 text-sm font-semibold"><FiUser className="text-[#697b52]" aria-hidden="true"/>Посетитель</h3>
    <fieldset className="min-w-0"><legend className="sr-only">Для кого запись</legend><div className="grid grid-cols-2 gap-2">{([{id:'account',text:'Есть аккаунт'},{id:'guest',text:'Без аккаунта'}] as const).map(item=><label key={item.id} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-2 py-2 text-xs font-semibold leading-5 transition ${mode===item.id?'border-[#91a17d] bg-[#e8eddf] text-[#293d30]':'border-[#d8dbce] bg-white text-[#6e7a65] hover:border-[#9eac8e]'}`}><input type="radio" name="customer-mode" checked={mode===item.id} onChange={()=>setMode(item.id)} className="size-3.5 shrink-0 accent-[#536b50]"/>{item.text}</label>)}</div></fieldset>
    {mode==='account'?<div className="space-y-3"><label className={label}>Почта аккаунта<span className="relative block"><FiMail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86907f]"/><EmailInput required autoComplete="off" value={email} onValueChange={setEmail} className={`${field} pl-10`} placeholder="name@example.ru"/></span></label>{validEmail&&(!account?<p role="status" className="text-xs text-[#748074]">Ищем аккаунт…</p>:account.error?<div role="alert" className="rounded-xl bg-[#faf0e9] p-3 text-xs text-[#84523c]">{account.error}<button type="button" onClick={()=>setLookupAttempt(value=>value+1)} className="ml-2 font-semibold underline">Повторить</button></div>:account.customer?<div role="status" className="space-y-3 rounded-xl border border-[#d4dec7] bg-[#eef2e7] p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-[#536b40]"><FiCheck aria-hidden="true"/>Аккаунт найден</p><label className={label}>ФИО<input readOnly value={account.customer.name} className={field}/></label><label className={label}>Телефон<input readOnly value={account.customer.phone?formatRussianPhone(account.customer.phone):'Не указан'} className={field}/></label><p className="text-[11px] leading-5 text-[#748074]">Данные из профиля посетителя. Запись и письма будут доступны в его аккаунте.</p></div>:<p role="status" className="rounded-xl bg-[#faf0e9] p-3 text-xs leading-5 text-[#84523c]">Аккаунт не найден. Проверьте почту или выберите «Без аккаунта».</p>)}
{!validEmail&&<p className="rounded-xl bg-[#eef2e7] p-3 text-xs leading-5 text-[#697567]">Введите почту аккаунта — ФИО и телефон подгрузятся автоматически.</p>}</div>:<div className="space-y-3"><label className={label}>Имя посетителя<input required minLength={2} maxLength={100} value={name} onChange={event=>setName(event.target.value)} autoComplete="off" className={field} placeholder="Имя и фамилия"/></label><label className={label}>Телефон<span className="relative block"><FiPhone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86907f]"/><PhoneInput required minLength={10} value={phone} onValueChange={setPhone} autoComplete="off" className={`${field} pl-10`}/></span></label><p className="rounded-xl bg-[#eef2e7] p-3 text-xs leading-5 text-[#697567]">Имя и телефон сохранятся в записи. Для посетителя без аккаунта письма не отправляются.</p></div>}
   </section>
   <section aria-labelledby="new-booking-time" className="min-w-0 space-y-4 rounded-2xl border border-[#dce0d2] bg-white/50 p-4">
    <h3 id="new-booking-time" className="flex items-center gap-2 text-sm font-semibold"><FiCalendar className="text-[#697b52]" aria-hidden="true"/>Площадка и время</h3>
    <div className="grid gap-3 sm:grid-cols-2"><label className={label}>Вид спорта<Select value={sport} onChange={event=>setSport(event.target.value)}>{sports.map(item=><option key={item.name}>{item.name}</option>)}</Select></label><label className={label}>Площадка<Select value={court?.id??''} disabled={!courts.length} onChange={event=>setCourtId(Number(event.target.value))}>{courts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label></div>
    {catalog?.error?<div role="alert" className="rounded-xl bg-[#faf0e9] p-3 text-xs text-[#84523c]">{catalog.error}<button type="button" onClick={()=>{setCatalog(null);setAttempt(value=>value+1);}} className="ml-2 underline">Повторить</button></div>:!catalog?<p role="status" className="text-xs text-[#748074]">Загружаем площадки…</p>:!courts.length?<p role="status" className="text-xs text-[#748074]">Для этого спорта нет действующих площадок.</p>:null}
    <div className="grid gap-3 sm:grid-cols-2"><label className={label}>Дата игры<input type="date" required min={today} max={lastDate} value={date} onChange={event=>setDate(event.target.value)} className={`${field} admin-booking-date`}/></label><label className={label}>Длительность<Select value={duration} onChange={event=>setDuration(Number(event.target.value))}>{durations.map(minutes=><option key={minutes} value={minutes}>{Math.floor(minutes/60)} ч{minutes%60?' 30 мин':''}</option>)}</Select></label></div>
    <div className="flex items-center gap-2 text-xs"><button type="button" onClick={()=>setDate(today)} aria-pressed={date===today} className={`rounded-full border px-3 py-1.5 font-semibold transition ${date===today?'border-[#a8b696] bg-[#e8eddf]':'border-[#d8dbce] hover:bg-[#eef1e7]'}`}>Сегодня</button><button type="button" onClick={tomorrow} className="rounded-full border border-[#d8dbce] px-3 py-1.5 font-semibold transition hover:bg-[#eef1e7]">Завтра</button></div>
    <label className={label}>Свободное время<Select required value={slot?.start??''} disabled={!current?.slots?.length} onChange={event=>setChoice({key:availabilityKey,start:event.target.value})}><option value="">{!current?'Загружаем интервалы…':current.slots?.length?'Выберите интервал':'Нет доступных интервалов'}</option>{current?.slots?.map(item=><option key={item.start} value={item.start}>{item.start}–{item.end}</option>)}</Select></label>
    {current?.error&&<div role="alert" className="rounded-xl bg-[#faf0e9] p-3 text-xs text-[#84523c]">{current.error}<button type="button" onClick={()=>setAttempt(value=>value+1)} className="ml-2 underline">Повторить</button></div>}
    {current?.slots?.length===0&&<p role="status" className="text-xs leading-5 text-[#748074]">Свободного времени нет. Выберите другую площадку, дату или длительность.</p>}
    <p className="flex items-start gap-1.5 text-[11px] leading-5 text-[#748074]"><FiClock className="mt-1 shrink-0" aria-hidden="true"/>Время Санкт-Петербурга · от 1 до 5 часов · до 40 дней вперёд</p>
   </section>
  </div><div className="sticky bottom-0 space-y-3 border-t border-[#dedfd2] bg-[#fcfaf4]/95 px-5 py-4 backdrop-blur sm:px-7">
    {formError&&<p role="alert" className="rounded-xl bg-[#faf0e9] p-3 text-sm text-[#84523c]">{formError}</p>}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 text-xs text-[#697567]">{slot&&court?<><p className="truncate font-semibold text-[#405640]">{court.name}</p><p className="mt-1 tabular-nums">{date.split('-').reverse().join('.')} · {slot.start}–{slot.end}</p></>:<p>Выберите свободный интервал</p>}</div><button type="submit" disabled={!slot||(mode==='account'&&!account?.customer)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 text-sm font-semibold text-white transition hover:bg-[#536b50] disabled:opacity-40">Продолжить<FiArrowRight aria-hidden="true"/></button></div>
  </div></form>}
 </BookingDialog>;
}
