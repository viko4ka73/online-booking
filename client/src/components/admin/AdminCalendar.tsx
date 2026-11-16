import AppLink from "../AppLink";
import { useEffect, useRef, useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock, FiRefreshCw, FiPlus, FiLock, FiPlayCircle, FiCheckCircle } from "react-icons/fi";
import { getBookingDateRange } from "../../lib/bookingDates";
import { calendarCompatibleSports,adminSportColors,getAdminSportColor,isCalendarStartFree,calendarBounds, calendarWindow, clipCalendarBooking, getAdminBookingStatus, type CalendarPeriod,  timeMinutes, type AdminBooking, type AdminCourt, type OpeningHours, type TimeBlock } from "../../lib/adminBookings";
import { minuteTime } from "../../lib/time";
import {AdminTimeBlockDetails} from "./AdminTimeBlockDialog";
import AdminBookingDetails from "./AdminBookingDetails";
import { useAdminAutoRefresh } from "../../lib/useAdminAutoRefresh";
import { getCalendarCourtGroup,type AdminFilters,type AdminCalendarGroup } from "../../lib/adminWorkspace";
import { GiShuttlecock,GiPingPongBat,GiBasketballBall } from "react-icons/gi";

type Schedule = { date: string; courts: AdminCourt[]; bookings: AdminBooking[]; blocks:TimeBlock[]; openingHours: OpeningHours | null };
const groups = [
  {id:'badminton',label:'Бадминтон',icon:GiShuttlecock,description:'Отдельные площадки. У совмещённой теннисной стенки и бадминтона общий календарь.'},
  {id:'table-tennis',label:'Настольный теннис',icon:GiPingPongBat,description:'Обычные столы и отдельные VIP-зоны.'},
  {id:'halls',label:'Залы и корты',icon:GiBasketballBall,description:'Общая занятость каждого зала: теннис, футбол, а в подходящих залах — волейбол и баскетбол.'},
] as const;
const rowHeight = 26;
const headerHeight = 48;
const dateFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const control = "h-10 min-w-0 rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm font-medium text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20";
const arrow = "grid size-10 shrink-0 place-items-center rounded-xl border border-[#cdd2c3] bg-white hover:bg-[#e8eddf] disabled:opacity-35";

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0001-01-01") return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export default function AdminCalendar({paused,onBlock,filters,group,onGroupChange,onFiltersChange,period,onPeriodChange,onCreate,onNotice}:{paused:boolean;onBlock:(court:AdminCourt)=>void;onCreate:(court:AdminCourt,start:string,sport?:string)=>void;onNotice:(message:string)=>void;period:CalendarPeriod;onPeriodChange:(period:CalendarPeriod)=>void;filters:AdminFilters;group:AdminCalendarGroup;onGroupChange:(group:AdminCalendarGroup)=>void;onFiltersChange:(changes:Partial<AdminFilters>)=>void}) {
  const {date}=filters;
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [response, setResponse] = useState<{ key: string; date:string; updatedAt?:string; data?: Schedule; error?: string; denied?: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBlockId,setSelectedBlockId]=useState<string|null>(null);
  const board = useRef<HTMLDivElement>(null);
  const dateValid = validDate(date);
  const requestKey = `${date}-${refresh}`;
  const result = response?.key === requestKey ? response : null;
  const data = response?.date===date ? response.data : undefined;
  const focusedFilter=useRef('');
  useAdminAutoRefresh(setRefresh,!paused && !selectedBlockId && !selectedId && !response?.denied);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!validDate(date)) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date });
    fetch(`/api/admin/schedule?${query}`, { credentials: "include", signal: controller.signal })
      .then(async http => {
        const payload = await http.json();
        if (controller.signal.aborted) return;
        if (!http.ok) {
          const denied=http.status===401 || http.status===403;
          setResponse(previous=>({key:requestKey,date,error:payload.error || 'Не удалось обновить расписание.',denied,data:!denied&&previous?.date===date?previous.data:undefined,updatedAt:previous?.updatedAt}));
          return;
        }
        setResponse({ key: requestKey,date, data: payload,updatedAt:new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date()) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse(previous=>({key:requestKey,date,error:'Не удалось обновить расписание. Повторим автоматически.',data:previous?.date===date?previous.data:undefined,updatedAt:previous?.updatedAt}));
      });
    return () => controller.abort();
  }, [date, requestKey]);

  const courts=(data?.courts??[]).filter(court=>getCalendarCourtGroup(court)===group);
  const visibleIds=new Set(courts.map(court=>court.id));
  const bookings=(data?.bookings??[]).filter(booking=>visibleIds.has(booking.courtId));
  const blocks=(data?.blocks??[]).filter(block=>visibleIds.has(block.courtId));
  const selectedBlock=blocks.find(block=>block.id===selectedBlockId);
  const active=bookings.filter(booking=>booking.status==='active');
  const cancelled=bookings.filter(booking=>booking.status==='cancelled');
  const incompatible=active.filter(booking=>{const court=courts.find(c=>c.id===booking.courtId);return Boolean(court?.adjacency?.length)&&!calendarCompatibleSports({...court!,sports:[booking.sport]},data?.courts??[],data?.bookings??[],timeMinutes(booking.start),timeMinutes(booking.end)-timeMinutes(booking.start)).includes(booking.sport);});
  const selected=bookings.find(booking=>booking.id===selectedId);
  const hours=data?.openingHours??null;
  const fullBounds=calendarBounds(hours,[...active,...blocks.map(block=>({...block,status:"active" as const}))]);
  const {today,lastDate}=getBookingDateRange(clock);
  const currentTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(clock);
  const nowMinute=timeMinutes(currentTime);
  const firstStart=active[0]?.start;
  const range=calendarWindow(fullBounds,period,date===today?nowMinute:firstStart?timeMinutes(firstStart):fullBounds.start);
  const {start,end}=range;
  const visible=active.filter(booking=>clipCalendarBooking(booking,range));
  const lastStartPassed=date===today&&Boolean(hours)&&nowMinute>=hours!.closesAt-60;
  const height=(end-start)/30*rowHeight;
  const ticks=Array.from({length:(end-start)/30},(_,index)=>start+index*30);
  const freeStarts=new Map(courts.map(court=>[court.id,date>=today&&date<=lastDate?ticks.filter(minute=>(date!==today||minute>nowMinute)&&calendarCompatibleSports(court,data?.courts??[],data?.bookings??[],minute).length>0&&isCalendarStartFree(minute,hours,active.filter(booking=>booking.courtId===court.id),60,blocks.filter(block=>block.courtId===court.id))):[]] as const));
  const hasFreeStarts=[...freeStarts.values()].some(values=>values.length>0);
  const showNow=date===today&&nowMinute>=start&&nowMinute<end;
  const nextBooking=active.filter(booking=>new Date(`${booking.date}T${booking.end}:00+03:00`).getTime()>clock.getTime()).sort((a,b)=>timeMinutes(a.start)-timeMinutes(b.start))[0];
  const focusKey=`${date}|${group}|${range.id}`;
  const scheduleReady=Boolean(data&&courts.length&&(hours||active.length||blocks.length));
  useEffect(()=>{
    if(!scheduleReady||!board.current||focusedFilter.current===focusKey)return;
    focusedFilter.current=focusKey;
    const target=showNow?nowMinute:firstStart?Math.max(start,Math.min(end-30,timeMinutes(firstStart))):start;
    board.current.scrollTo({top:Math.max(0,(target-start-30)/30*rowHeight),left:0,behavior:'instant'});
  },[scheduleReady,focusKey,showNow,nowMinute,firstStart,start,end]);
  function chooseDate(value:string){onFiltersChange({date:value});setSelectedId(null);}
  function moveDate(offset:number){
    if(!dateValid)return;
    const next=new Date(`${date}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+offset);
    const value=next.toISOString().slice(0,10);if(validDate(value))chooseDate(value);
  }
  function chooseTomorrow(){const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);chooseDate(next.toISOString().slice(0,10));}
  function scrollToNow(){onPeriodChange('auto');board.current?.scrollTo({top:Math.max(0,(nowMinute-start-30)/30*rowHeight),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}

  return <main className="mx-auto w-full max-w-[1600px] px-5 pb-8 pt-4 md:px-10 lg:px-16">
    <section aria-label="Управление календарём" className="overflow-hidden rounded-2xl border border-[#d8dbce] bg-[#fcfaf4]">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        <div role="group" aria-label="Группы календаря" className="inline-flex flex-wrap gap-1 rounded-xl bg-[#eff1e8] p-1">
          {groups.map(({id,label,icon:Icon,description})=><button key={id} type="button" aria-pressed={group===id} title={description} onClick={()=>{onGroupChange(id);setSelectedId(null);}} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${group===id?'bg-[#293d30] text-white':'text-[#536354] hover:bg-[#e2e8d9]'}`}><Icon size={16} aria-hidden="true"/>{label}{data&&<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${group===id?'bg-white/15':'bg-white/70'}`}>{data.courts.filter(court=>getCalendarCourtGroup(court)===id).length}</span>}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-label="Предыдущий день" disabled={!dateValid||date==='0001-01-01'} onClick={()=>moveDate(-1)} className={arrow}><FiChevronLeft aria-hidden="true"/></button>
          <label><span className="sr-only">Дата расписания</span><input type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={event=>chooseDate(event.target.value)} className={`${control} w-36`}/></label>
          <button type="button" aria-label="Следующий день" disabled={!dateValid||date==='9999-12-31'} onClick={()=>moveDate(1)} className={arrow}><FiChevronRight aria-hidden="true"/></button>
          <button type="button" onClick={()=>chooseDate(today)} className={`${control} px-3! text-xs! hover:bg-[#e8eddf]`}>Сегодня</button>
          <button type="button" onClick={chooseTomorrow} className={`${control} px-3! text-xs! hover:bg-[#e8eddf]`}>Завтра</button>
          <button type="button" aria-label="Обновить расписание" title="Обновить расписание" disabled={!dateValid||!result} onClick={()=>setRefresh(value=>value+1)} className={arrow}><FiRefreshCw size={15} aria-hidden="true"/></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e6dc] px-3 py-2 sm:px-4">
        <div role="group" aria-label="Период расписания" className="inline-flex flex-wrap gap-1">
          {range.periods.map(item=>{const count=active.filter(booking=>clipCalendarBooking(booking,item)).length;return <button key={item.id} type="button" disabled={item.end<=item.start} title={`${minuteTime(item.start)}–${minuteTime(item.end)}`} aria-pressed={range.id===item.id} onClick={()=>onPeriodChange(item.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-30 ${range.id===item.id?'bg-[#dfe7d3] text-[#293d30]':'text-[#748074] hover:bg-[#eff1e8]'}`}>{item.id==='morning'?'Утро':item.id==='day'?'День':'Вечер'}{count>0&&<span className="ml-1.5 text-[10px]">{count}</span>}</button>;})}
          <button type="button" aria-pressed={range.id==='all'} onClick={()=>onPeriodChange('all')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${range.id==='all'?'bg-[#dfe7d3] text-[#293d30]':'text-[#748074] hover:bg-[#eff1e8]'}`}>Весь день</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {date===today&&<button type="button" onClick={scrollToNow} className="inline-flex items-center gap-1.5 font-semibold text-[#536354] hover:underline"><FiClock size={14} aria-hidden="true"/>Сейчас · {currentTime}</button>}
          {nextBooking&&<button type="button" onClick={()=>setSelectedId(nextBooking.id)} className="max-w-full truncate rounded-full bg-[#293d30] px-3 py-2 text-xs font-semibold text-white">Ближайшая · {nextBooking.start} · {nextBooking.courtName}</button>}
        </div>
      </div>
    </section>
    {result?.error&&data&&<p role="alert" className="mt-3 rounded-xl bg-[#faf2e8] p-3 text-xs text-[#754d32]">{result.error} Показана последняя загруженная версия.</p>}
    {!dateValid?<p role="alert" className="py-8 text-sm text-[#84523c]">Выберите корректную дату расписания.</p>:result?.error&&!data?<div role="alert" className="mt-4 rounded-2xl bg-[#faf2e8] p-5 text-sm text-[#754d32]"><p>{result.error}</p>{result.denied?<AppLink href="/account" className="mt-3 inline-block underline!">Вернуться в личный кабинет</AppLink>:<button type="button" onClick={()=>setRefresh(value=>value+1)} className="mt-3 underline">Повторить загрузку</button>}</div>:!data?<p role="status" className="py-8 text-sm text-[#536354]">Загружаем календарь бронирований…</p>:<>
      {courts.length>0&&hours&&<div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8dfcc] bg-[#eef3e7] px-4 py-3 text-xs text-[#536354]"><p className="flex min-w-0 items-start gap-2"><FiPlus size={16} className="shrink-0" aria-hidden="true"/><span>{hasFreeStarts?'Нажмите + в свободной ячейке — площадка и время подставятся в новую запись.':lastStartPassed?'На сегодня уже нет времени для новой записи от 1 часа. Создание доступно на следующие дни.':date<today?'Это прошедшая дата. Создать запись можно на сегодня или будущие дни.':date>lastDate?'Создание записи доступно на 40 дней вперёд.':'В выбранном периоде нет свободного интервала от 1 часа. Выберите другой период или дату.'}</span></p>{!hasFreeStarts&&(lastStartPassed?<button type="button" onClick={chooseTomorrow} className="min-h-9 shrink-0 rounded-lg border border-[#b9c6a8] bg-white px-3 font-semibold hover:bg-[#e0e9d4]">Открыть завтра</button>:date<today||date>lastDate?<button type="button" onClick={()=>chooseDate(today)} className="min-h-9 shrink-0 rounded-lg border border-[#b9c6a8] bg-white px-3 font-semibold hover:bg-[#e0e9d4]">Открыть сегодня</button>:range.id!=='all'?<button type="button" onClick={()=>onPeriodChange('all')} className="min-h-9 shrink-0 rounded-lg border border-[#b9c6a8] bg-white px-3 font-semibold hover:bg-[#e0e9d4]">Весь день</button>:null)}</div>}
      {courts.some(c=>c.adjacency?.length)&&<p className="mt-3 text-xs leading-relaxed text-[#536354]">У смежных площадок учитываются разрешённые сочетания видов спорта. При создании записи подставится совместимая игра. Каждый объект бронируется отдельно.</p>}
      {incompatible.length>0&&<div role="alert" className="mt-3 rounded-xl border border-[#d5ad78] bg-[#fbf0df] px-4 py-3 text-sm text-[#79522d]"><p className="font-semibold">Несовместимые записи на смежных площадках</p><p className="mt-1 text-xs">Сочетание игр запрещено настройками смежности. Откройте запись, чтобы перенести или отменить её.</p><div className="mt-2 flex flex-wrap gap-2">{incompatible.map(booking=><button key={booking.id} type="button" onClick={()=>setSelectedId(booking.id)} className="rounded-lg border border-[#d5ad78] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#fff7ec]">{booking.courtName} · {booking.start}–{booking.end} · {booking.sport}</button>)}</div></div>}
      <h2 className="sr-only">{dateFormat.format(new Date(`${date}T00:00:00Z`))}</h2>
      <div className="mb-2 mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#748074]"><p role="status"><strong className="font-semibold text-[#536354]">{minuteTime(start)}–{minuteTime(end)}</strong> · Показано записей: {visible.length} из {active.length} за день · Перерывов: {blocks.length} · Время Санкт-Петербурга</p><div aria-label="Обозначения календаря" className="flex flex-wrap gap-3">{adminSportColors.map(item=><span key={item.id} className="inline-flex items-center gap-1"><span className="size-2.5 rounded border" style={{backgroundColor:item.backgroundColor,borderColor:item.borderColor}} aria-hidden="true"/>{item.name}</span>)}<span className="inline-flex items-center gap-1"><span className="size-2.5 rounded border border-[#bb9d60] bg-[#f3ecdc]" aria-hidden="true"/>Технический перерыв</span><span className="inline-flex items-center gap-1"><FiPlayCircle aria-hidden="true"/>Идёт игра</span><span className="inline-flex items-center gap-1"><FiCheckCircle aria-hidden="true"/>Завершено</span></div></div>
      {!courts.length?<p className="rounded-2xl border border-[#d8dbce] p-8 text-center text-sm">В этой группе пока нет площадок.</p>:!hours&&!active.length&&!blocks.length?<div className="rounded-2xl border border-[#d8dbce] p-8 text-center"><FiCalendar size={25} className="mx-auto text-[#7e8c62]" aria-hidden="true"/><p className="mt-3 text-sm">В этот день комплекс не работает.</p></div>:<>
        <div ref={board} role="region" aria-label="Календарь бронирований по площадкам" tabIndex={0} className={`relative overflow-auto rounded-2xl border border-[#cdd2c3] bg-white focus-visible:outline-2 focus-visible:outline-[#69774b] ${range.id==='all'?'max-h-[65dvh]':'max-h-[70dvh]'}`}>
          <div className="relative grid" style={{gridTemplateColumns:`56px repeat(${courts.length}, minmax(0,1fr))`,minWidth:56+courts.length*104}}>
            <div className="sticky left-0 top-0 z-40 flex items-center justify-center border-b border-r border-[#cdd2c3] bg-[#eff1e8] text-[10px] font-semibold text-[#748074]" style={{height:headerHeight}}>Время</div>
            {courts.map(court=><div key={court.id} title={court.name} className="sticky top-0 z-30 flex flex-col justify-center border-b border-r border-[#cdd2c3] bg-[#eff1e8] px-2 last:border-r-0" style={{height:headerHeight}}><div className="flex items-center justify-between gap-1"><p className="truncate text-xs font-semibold">{court.name}</p><button type="button" onClick={()=>onBlock(court)} aria-label={"Закрыть время: "+court.name} title="Закрыть время" className="rounded p-1 text-[#8b774d] hover:bg-[#e4e7dc]"><FiLock size={12}/></button></div><p className="mt-1 truncate text-[10px] text-[#748074]">{court.sport}</p></div>)}
            <div className="sticky left-0 z-20 border-r border-[#cdd2c3] bg-[#fcfaf4]" style={{height}}>{ticks.map(minute=><div key={minute} className={`absolute inset-x-0 border-t px-1.5 pt-1 text-right text-[10px] tabular-nums ${minute%60?'border-[#e7e9e1] text-[#9ba391]':'border-[#cdd2c3] font-semibold text-[#536354]'}`} style={{top:(minute-start)/30*rowHeight}}>{minuteTime(minute)}</div>)}</div>
            {courts.map(court=><div key={court.id} className="relative border-r border-[#cdd2c3] last:border-r-0" style={{height,backgroundImage:`repeating-linear-gradient(to bottom, #d8ddcf 0px, #d8ddcf 1px, transparent 1px, transparent ${rowHeight*2}px), repeating-linear-gradient(to bottom, #edf0e8 0px, #edf0e8 1px, transparent 1px, transparent ${rowHeight}px)`}}>
              {(freeStarts.get(court.id)??[]).map(minute=><button key={'free-'+minute} type="button" onClick={()=>onCreate(court,minuteTime(minute),calendarCompatibleSports(court,data?.courts??[],data?.bookings??[],minute)[0])} aria-label={'Создать запись: '+court.name+', '+date.split('-').reverse().join('.')+', '+minuteTime(minute)} title={'Создать запись на '+minuteTime(minute)} className="group/slot absolute inset-x-0 z-0 flex items-center justify-center text-[#697b52] transition hover:bg-[#e8eddf] focus-visible:z-20 focus-visible:bg-[#e8eddf] focus-visible:outline-2 focus-visible:outline-[#69774b]" style={{top:(minute-start)/30*rowHeight,height:rowHeight}}><FiPlus size={14} aria-hidden="true" className="opacity-0 group-hover/slot:opacity-100 group-focus-visible/slot:opacity-100"/></button>)}
              {visible.filter(booking=>booking.courtId===court.id).map(booking=>{
                const status=getAdminBookingStatus(booking,clock.getTime());
                const color=getAdminSportColor(booking);
                const clipped=clipCalendarBooking(booking,range)!;
                const top=(clipped.start-start)/30*rowHeight,blockHeight=(clipped.end-clipped.start)/30*rowHeight-4;
                return <button key={booking.id} type="button" onClick={()=>setSelectedId(booking.id)} aria-label={`${booking.start}–${booking.end}, ${court.name}, ${booking.customer.name??'Без аккаунта'}, ${booking.sport}, ${status.label}`} title={`${booking.start}–${booking.end} · ${booking.sport} · ${booking.customer.name??'Без аккаунта'} · ${status.label}`} className="absolute inset-x-0.5 z-10 overflow-hidden rounded-md border-l-[3px] border-y border-r px-1.5 py-0.5 text-left shadow-sm transition hover:brightness-95 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-[#69774b]" style={{top:top+2,height:blockHeight,backgroundColor:color.backgroundColor,borderColor:color.borderColor,color:color.color}}><span className="flex items-center justify-between gap-1 text-[11px] font-bold leading-[14px] tabular-nums"><span className="truncate">{booking.start}–{booking.end}</span>{status.label==="Идёт игра"?<FiPlayCircle className="shrink-0" size={12} aria-hidden="true"/>:status.label==="Завершено"?<FiCheckCircle className="shrink-0" size={12} aria-hidden="true"/>:null}</span>{blockHeight>=38&&<span className="block truncate text-[10px] font-semibold leading-[13px]">{booking.customer.name??'Без аккаунта'}</span>}{blockHeight>=46&&<span className="block truncate text-[9px] leading-[11px]">{booking.sport}</span>}</button>;
              })}
              {blocks.filter(block=>block.courtId===court.id).map(block=>{const clipped=clipCalendarBooking(block,range);if(!clipped)return null;const blockHeight=(clipped.end-clipped.start)/30*rowHeight-4;return <button key={block.id} type="button" onClick={()=>setSelectedBlockId(block.id)} aria-label={"Технический перерыв: "+court.name+", "+block.start+"–"+block.end+", "+block.reason} title={block.start+"–"+block.end+" · "+block.reason} className="absolute inset-x-0.5 z-10 overflow-hidden rounded-md border border-l-[3px] border-[#bb9d60] bg-[#f3ecdc] px-1.5 py-0.5 text-left text-[#745c30] shadow-sm hover:brightness-95" style={{top:(clipped.start-start)/30*rowHeight+2,height:blockHeight,backgroundImage:"repeating-linear-gradient(135deg,transparent,transparent 8px,rgba(187,157,96,.09) 8px,rgba(187,157,96,.09) 10px)"}}><span className="flex items-center gap-1 truncate text-[10px] font-bold"><FiLock className="shrink-0" size={10}/>{block.start}–{block.end}</span>{blockHeight>=38&&<span className="block truncate text-[10px]">{block.reason}</span>}</button>;})}
              {showNow&&<div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-[#b07355]" style={{top:(nowMinute-start)/30*rowHeight}} aria-hidden="true"/>}
            </div>)}
          </div>
        </div>
        {!visible.length&&!blocks.some(block=>clipCalendarBooking(block,range))&&<p role="status" className="mt-2 text-xs text-[#748074]">{active.length?'В этом периоде записей нет. Количество записей в других периодах указано на переключателях.':'На выбранный день записей нет.'}</p>}
      </>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#9ba391]"><span>Свободная ячейка — новая запись. Бронь — перенос или отмена.</span><span>Автообновление · 30 сек.{response?.updatedAt?` · ${response.updatedAt}`:''}</span></div>
      {cancelled.length>0&&<details className="mt-3 rounded-xl border border-[#d8dbce] bg-[#fcfaf4] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#84523c]">Отменённые записи · {cancelled.length}</summary><ul className="mt-3 space-y-2">{cancelled.map(booking=><li key={booking.id}><button type="button" onClick={()=>setSelectedId(booking.id)} className="flex w-full flex-wrap justify-between gap-2 rounded-lg border border-[#e3d6cb] px-3 py-2 text-left text-xs hover:bg-[#f4e9e2]"><span>{booking.start}–{booking.end} · {booking.courtName}</span><span>{booking.customer.name??'Без аккаунта'}</span></button></li>)}</ul></details>}
      {selectedBlock&&<AdminTimeBlockDetails block={selectedBlock} onClose={()=>setSelectedBlockId(null)} onReleased={()=>{setSelectedBlockId(null);setRefresh(value=>value+1);onNotice("Блокировка снята. Время доступно для бронирования.");}}/>}
      {selected&&<AdminBookingDetails booking={selected} onClose={()=>setSelectedId(null)} onSaved={message=>{setSelectedId(null);setRefresh(value=>value+1);onNotice(message);}}/>}
    </>}
  </main>;
}
