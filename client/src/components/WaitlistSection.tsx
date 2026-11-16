import AppLink from "./AppLink";
import {useEffect,useRef,useState} from 'react';
import {FiBell,FiChevronLeft,FiChevronRight,FiRefreshCw,FiTrash2} from 'react-icons/fi';
import BookingDialog from './BookingDialog';
import {waitlistBookingUrl,type WaitlistEntry} from '../lib/waitlist';
type Result={entries:WaitlistEntry[];page:number;total:number;totalPages:number};
const labels={waiting:'Ожидаем время',notified:'Письмо отправлено',cancelled:'Заявка удалена',expired:'Заявка завершена',fulfilled:'Время забронировано'};
export default function WaitlistSection(){
 const section=useRef<HTMLElement>(null);
 useEffect(()=>{if(window.location.hash==='#waitlist')section.current?.scrollIntoView({block:'start'});},[]);
 const [view,setView]=useState('active'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
 const [result,setResult]=useState<{key:string;data?:Result;error?:string}|null>(null);
 const [cancelling,setCancelling]=useState<WaitlistEntry|null>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const query=new URLSearchParams({view,page:String(page)}).toString(),key=query+'|'+refresh;
 const data=result?.key===key?result.data:null;
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/waitlist/mine?'+query,{credentials:'include',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setResult({key,data});}).catch(err=>{if(!controller.signal.aborted)setResult({key,error:err.message||'Не удалось загрузить заявки.'});});
  return()=>controller.abort();
 },[key,query]);
 useEffect(()=>{if(cancelling)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);},30000);return()=>window.clearInterval(timer);},[cancelling]);
 async function cancel(){
  if(!cancelling||pending)return;setPending(true);setError('');
  try{
   const response=await fetch('/api/waitlist/'+cancelling.id+'/cancel',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:cancelling.version})});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   setCancelling(null);setRefresh(value=>value+1);
  }catch(err){setError(err instanceof Error?err.message:'Не удалось удалить заявку.');}finally{setPending(false);}
 }
 return <section ref={section} id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-5 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-5 sm:p-9">
  <div className="flex items-start justify-between gap-3"><div><h2 id="waitlist-title" className="font-serif text-3xl">Лист ожидания</h2><p className="mt-2 text-sm leading-relaxed text-[#748074]">Сообщим на почту, когда нужное время освободится.</p></div><FiBell className="mt-1 shrink-0 text-[#7e8c62]" size={27} aria-hidden="true"/></div>
  <div className="mt-5 flex flex-wrap items-center gap-2">{[{id:'active',label:'Активные'},{id:'history',label:'История'}].map(item=><button key={item.id} type="button" aria-pressed={view===item.id} onClick={()=>{setView(item.id);setPage(1);}} className={'min-h-10 rounded-full border px-4 text-xs font-semibold '+(view===item.id?'border-[#293d30] bg-[#293d30] text-white':'border-[#cdd2c3] text-[#536354]')}>{item.label}</button>)}<button type="button" onClick={()=>setRefresh(value=>value+1)} aria-label="Обновить лист ожидания" className="ml-auto rounded-full border border-[#cdd2c3] p-2.5"><FiRefreshCw aria-hidden="true"/></button></div>
  {!data?result?.key===key&&result.error?<p role="alert" className="mt-4 text-sm text-[#84523c]">{result.error}</p>:<p role="status" className="mt-4 text-sm">Загружаем заявки…</p>:!data.entries.length?<div className="mt-4 rounded-2xl bg-[#eff2e8] p-5 text-sm leading-relaxed"><p className="font-semibold">{view==='active'?'Активных заявок пока нет':'История заявок пока пуста'}</p><p className="mt-2 text-[#536354]">Если нужное время занято, откройте календарь площадки и нажмите «Лист ожидания».</p><AppLink href="/courts" className="mt-3 inline-block font-semibold underline!">Выбрать площадку</AppLink></div>:<>
   <p role="status" className="mt-4 text-xs text-[#748074]">Заявки {(data.page-1)*3+1}–{Math.min(data.page*3,data.total)} из {data.total}</p>
   <ul className="mt-3 space-y-3">{data.entries.map(entry=><li key={entry.id} className="rounded-2xl border border-[#d8dbce] p-4"><span className={'inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold '+(entry.status==='notified'?'bg-[#dff0ec] text-[#2c6159]':'bg-[#e8eddf] text-[#536354]')}>{labels[entry.status]}</span><h3 className="mt-3 font-semibold">{entry.courtName??'Любая площадка'} · {entry.sport}</h3><p className="mt-2 text-sm tabular-nums">{entry.date.split('-').reverse().join('.')} · {entry.start}–{entry.end}</p>{entry.notifiedCourtName&&entry.status==='notified'&&<p className="mt-2 text-xs text-[#536354]">В письме: {entry.notifiedCourtName}. Доступность проверяется при бронировании.</p>}{entry.deliveryStatus==='failed'&&entry.status==='waiting'&&<p role="alert" className="mt-2 text-xs text-[#84523c]">Не удалось отправить письмо. Можно удалить заявку и добавить её заново для повторной отправки.</p>}{['waiting','notified'].includes(entry.status)&&<div className="mt-4 flex flex-wrap items-center gap-3"><AppLink href={waitlistBookingUrl(entry)} className="min-h-10 rounded-full bg-[#293d30] px-4 py-2.5 text-xs font-semibold text-white!">{entry.status==='notified'?'Перейти к бронированию':'Проверить расписание'}</AppLink><button type="button" onClick={()=>{setCancelling(entry);setError('');}} aria-label={'Удалить заявку: '+entry.sport+', '+entry.date+', '+entry.start} className="inline-flex min-h-10 items-center gap-1.5 px-1 text-xs font-semibold text-[#84523c]"><FiTrash2 aria-hidden="true"/>Удалить</button></div>}</li>)}</ul>
   {data.totalPages>1&&<nav aria-label="Страницы листа ожидания" className="mt-4 flex items-center justify-center gap-3"><button type="button" disabled={data.page<=1} onClick={()=>setPage(data.page-1)} aria-label="Предыдущие заявки" className="rounded-full border border-[#cdd2c3] p-2.5 disabled:opacity-30"><FiChevronLeft/></button><span className="text-xs">{data.page} / {data.totalPages}</span><button type="button" disabled={data.page>=data.totalPages} onClick={()=>setPage(data.page+1)} aria-label="Следующие заявки" className="rounded-full border border-[#cdd2c3] p-2.5 disabled:opacity-30"><FiChevronRight/></button></nav>}
  </>}
  {cancelling&&<BookingDialog open pending={pending} onClose={()=>{if(!pending)setCancelling(null);}} title="Удалить заявку?"><div className="space-y-4 p-5 sm:p-7"><p className="text-sm leading-relaxed">Перестанем уведомлять об этом интервале. Бронирования останутся без изменений.</p><p className="rounded-xl bg-[#e8eddf] p-4 text-sm">{cancelling.sport} · {cancelling.date.split('-').reverse().join('.')} · {cancelling.start}–{cancelling.end}</p>{error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={pending} onClick={()=>setCancelling(null)} className="px-4 text-sm">Оставить</button><button type="button" disabled={pending} onClick={cancel} className="min-h-12 rounded-xl bg-[#293d30] px-5 text-sm font-semibold text-white">{pending?'Удаляем…':'Да, удалить заявку'}</button></div></div></BookingDialog>}
 </section>;
}
