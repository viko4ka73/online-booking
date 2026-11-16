import AppLink from "../AppLink";
import { useEffect,useState } from "react";
import { FiCalendar,FiCheckCircle,FiChevronDown,FiChevronLeft,FiChevronRight,FiClock,FiMail,FiMapPin,FiPhone,FiRefreshCw,FiSearch,FiRepeat,FiUser,FiXCircle } from "react-icons/fi";
import { useAdminAutoRefresh } from "../../lib/useAdminAutoRefresh";
import type { AdminFilters,AdminSort } from "../../lib/adminWorkspace";
import { getBookingDateRange } from "../../lib/bookingDates";
import { money } from "../../lib/money";
import { sports as sportOptions } from "../../lib/catalog";
import { getAdminSportColor,getAdminBookingStatus as bookingStatus, type AdminBooking } from "../../lib/adminBookings";

import BookingChangeDialog from "../BookingChangeDialog";

type View = "all" | "upcoming" | "past" | "cancelled";
type Result = {bookings:AdminBooking[];counts:Record<View,number>;total:number;page:number;pageSize:number;totalPages:number;courts:{id:number;name:string;sport:string;hall:string}[]};
const control = "mt-1.5 h-12 w-full min-w-0 rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm font-medium text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20";
const statusLabels: Record<View,string> = {all:"Все записи",upcoming:"Предстоящие и текущие",past:"Завершённые",cancelled:"Отменённые"};
const dateLabel = (date:string) => date.split("-").reverse().join(".");

export default function AdminReservations({paused=false,filters,onFiltersChange}:{paused?:boolean;filters:AdminFilters;onFiltersChange:(changes:Partial<AdminFilters>)=>void}) {
  const {page}=filters;
  const [action,setAction]=useState<{booking:AdminBooking;mode:"cancel"|"reschedule"}|null>(null);
  const [notice,setNotice]=useState("");
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
  const search=filters.search??'';
  const [searchDraft,setSearchDraft]=useState(search);
  useEffect(()=>{
    const next=searchDraft.trim();
    if(next===search)return;
    const timer=window.setTimeout(()=>onFiltersChange({search:next,page:1,...(!search&&next?{date:'',sport:'',status:'all' as const}:{})}),300);
    return()=>window.clearTimeout(timer);
  },[searchDraft,search,onFiltersChange]);
  const setPage=(page:number)=>onFiltersChange({page});
  const [refresh,setRefresh] = useState(0);
  const [snapshot,setSnapshot] = useState<{key:string;query:string;data?:Result;error?:string;denied?:boolean;updatedAt?:string}|null>(null);
  const query = new URLSearchParams({date:filters.date,sport:filters.sport,status:filters.status,sort:filters.sort,q:search,page:String(page)}).toString();
  const key = `${query}-${refresh}`;
  const result = snapshot?.key === key ? snapshot : null;
  const data = snapshot?.query===query?snapshot.data:undefined;
  useAdminAutoRefresh(setRefresh,!paused&&!action&&!snapshot?.denied);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/reservations?${query}`,{credentials:"include",signal:controller.signal})
      .then(async response => {
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {const denied=response.status===401||response.status===403;setSnapshot(previous=>({key,query,error:payload.error||'Не удалось обновить бронирования.',denied,data:!denied&&previous?.query===query?previous.data:undefined,updatedAt:previous?.updatedAt})); return;}
        setSnapshot({key,query,data:payload,updatedAt:new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit"}).format(new Date())});
      })
      .catch(() => {if (!controller.signal.aborted) setSnapshot(previous=>({key,query,error:'Не удалось обновить записи. Повторим автоматически.',data:previous?.query===query?previous.data:undefined,updatedAt:previous?.updatedAt}));});
    return () => controller.abort();
  },[query,key]);
  function clear() {setSearchDraft('');onFiltersChange({date:'',sport:'',status:'all',page:1,search:''});}
  const today=getBookingDateRange().today;
  function chooseTomorrow(){const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);onFiltersChange({date:next.toISOString().slice(0,10)});}
  const pageNumbers = data ? [...new Set([1,data.page-1,data.page,data.page+1,data.totalPages])].filter(number=>number>=1 && number<=data.totalPages).sort((a,b)=>a-b) : [];
  const summaries = [{id:"all",label:"Всего записей",icon:FiCalendar},{id:"upcoming",label:"Предстоящие и текущие",icon:FiClock},{id:"past",label:"Завершённые",icon:FiCheckCircle},{id:"cancelled",label:"Отменённые",icon:FiXCircle}] as const;
  const filterPanel=(<div role="group" aria-label="Фильтры бронирований" className="mt-5 grid items-end gap-4 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-5 sm:grid-cols-2 xl:grid-cols-3">
        <label className="min-w-0 text-xs font-semibold text-[#405640]">Дата игры<input type="date" value={filters.date} onChange={event=>onFiltersChange({date:event.target.value})} className={control} /><span className="mt-1 block text-[11px] font-normal text-[#748074]">Оставьте пустой для всех дат</span></label>
        <label className="min-w-0 text-xs font-semibold text-[#405640]">Вид спорта<select value={filters.sport} onChange={event=>onFiltersChange({sport:event.target.value})} className={control}><option value="">Все виды спорта</option>{sportOptions.map(({name})=><option key={name} value={name}>{name}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-[#748074]">Включая записи разных пользователей</span></label>
        <label className="min-w-0 text-xs font-semibold text-[#405640]">Статус<select value={filters.status} onChange={event=>onFiltersChange({status:event.target.value as View})} className={control}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-[#748074]">Отменённые записи сохраняются</span></label>
        <div className="flex flex-wrap items-center gap-2 xl:col-span-3"><button type="button" onClick={()=>onFiltersChange({date:today})} className="rounded-full border border-[#b9c0ae] px-4 py-2 text-xs font-semibold hover:bg-[#e8eddf]">Сегодня</button><button type="button" onClick={chooseTomorrow} className="rounded-full border border-[#b9c0ae] px-4 py-2 text-xs font-semibold hover:bg-[#e8eddf]">Завтра</button><button type="button" onClick={()=>onFiltersChange({date:''})} className="rounded-full border border-[#b9c0ae] px-4 py-2 text-xs font-semibold hover:bg-[#e8eddf]">Все даты</button><button type="button" onClick={clear} className="ml-auto text-xs font-semibold text-[#536354] underline underline-offset-4">Сбросить фильтры</button><p className="w-full pt-1 text-xs text-[#748074]">Фильтры применяются сразу · Автообновление каждые 30 секунд</p></div>
      </div>);
  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-7 md:px-10 lg:px-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-serif text-3xl">{search?"Результаты поиска":"Все бронирования"}</h2><p className="mt-1 text-sm text-[#748074]">{filters.date ? `За ${dateLabel(filters.date)}` : "За всё время"} · время Санкт-Петербурга</p></div>
        <button type="button" disabled={!result} onClick={()=>setRefresh(value=>value+1)} className="inline-flex items-center gap-2 rounded-full border border-[#b9c0ae] bg-[#fcfaf4] px-4 py-2.5 text-sm font-semibold hover:bg-[#e8eddf] disabled:opacity-50"><FiRefreshCw size={16} aria-hidden="true" />Обновить</button>
      </div>
      {notice&&<p role="status" className="mt-4 rounded-xl bg-[#e8eddf] p-4 text-sm text-[#405640]">{notice}</p>}
      <div role="search" aria-label="Поиск записей пользователя" className="mt-5 rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-4 sm:p-5">
        <label htmlFor="admin-booking-search" className="text-xs font-semibold text-[#405640]">Найти запись пользователя</label>
        <div className="mt-2 flex flex-wrap items-center gap-3"><span className="relative block min-w-0 flex-1"><FiSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7e8c62]" aria-hidden="true"/><input id="admin-booking-search" type="search" value={searchDraft} maxLength={100} onChange={event=>setSearchDraft(event.target.value)} placeholder="Имя, телефон, почта или номер брони" autoComplete="off" className="h-12 w-full rounded-xl border border-[#cdd2c3] bg-white pl-11 pr-4 text-sm outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20"/></span>{searchDraft&&<button type="button" onClick={()=>{setSearchDraft('');onFiltersChange({search:'',page:1});}} className="text-xs font-semibold text-[#536354] underline underline-offset-4">Очистить поиск</button>}</div>
        <p className="mt-2 text-xs leading-relaxed text-[#748074]">Поиск начинается автоматически по всем записям. Затем можно уточнить дату, вид спорта и статус.</p>
        {searchDraft.trim()!==search&&<p role="status" className="mt-2 text-xs text-[#536354]">Ищем записи…</p>}
      </div>
      {search ? <details className="mt-4"><summary className="w-fit cursor-pointer rounded-full border border-[#b9c0ae] px-4 py-2.5 text-xs font-semibold text-[#536354]">Уточнить поиск: дата, вид спорта и статус</summary>{filterPanel}</details> : filterPanel}
      {result?.error && data && <p role="alert" className="mt-4 rounded-xl bg-[#faf2e8] p-3 text-xs text-[#754d32]">{result.error} Показана последняя загруженная версия.</p>}
      {result?.error && !data ? <div role="alert" className="mt-5 rounded-2xl border border-[#decbb5] bg-[#faf2e8] p-5 text-sm text-[#754d32]"><p>{result.error}</p>{result.denied ? <AppLink href="/account" className="mt-3 inline-block font-semibold underline!">Вернуться в личный кабинет</AppLink> : <button type="button" onClick={()=>setRefresh(value=>value+1)} className="mt-3 font-semibold underline">Повторить загрузку</button>}</div>
      : !data ? <p role="status" className="py-8 text-sm text-[#536354]">Загружаем бронирования…</p> : <>
        {!search&&<>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaries.map(({id,label,icon:Icon})=><div key={id} className="rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-4 sm:p-5"><Icon size={18} className="text-[#7e8c62]" aria-hidden="true" /><p className="mt-3 font-display text-3xl font-bold tabular-nums">{data.counts[id]}</p><p className="mt-1 text-xs text-[#536354]">{label}</p></div>)}
        </div>
        <p className="mt-3 text-xs text-[#748074]">Сводка учитывает поиск, дату и вид спорта, до фильтра по статусу.</p>
        </>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-[#405640]">Сортировка<span className="relative block"><select value={filters.sort} onChange={event=>onFiltersChange({sort:event.target.value as AdminSort})} className="h-11 w-full appearance-none rounded-xl border border-[#cdd2c3] bg-white pl-3 pr-9 text-sm font-medium text-[#203126] focus-visible:outline-2 focus-visible:outline-[#69774b]"><option value="nearest">Ближайшие игры</option><option value="date-asc">Дата: сначала ранние</option><option value="date-desc">Дата: сначала поздние</option></select><FiChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#748074]"/></span></label>{filters.sort==='nearest'&&<p className="text-xs text-[#748074]">Сначала текущие и предстоящие игры, затем завершённые и отменённые.</p>}</div>
        <div role="status" className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-[#536354]"><span>{data.total ? `Записи ${(data.page-1)*data.pageSize+1}–${Math.min(data.page*data.pageSize,data.total)} из ${data.total}` : "Записей не найдено"}</span><span>Обновлено в {snapshot?.updatedAt}</span></div>
        {!data.bookings.length ? <div className="mt-3 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-8 text-center"><FiCalendar size={32} className="mx-auto text-[#7e8c62]" aria-hidden="true" /><h3 className="mt-4 font-semibold">Подходящих бронирований нет</h3><p className="mt-2 text-sm text-[#536354]">{search?"Проверьте имя, телефон, почту или номер брони. Можно также сбросить фильтры даты, спорта и статуса.":"Попробуйте другую дату, вид спорта или статус."}</p><button type="button" onClick={clear} className="mt-4 rounded-full border border-[#b9c0ae] px-5 py-2.5 text-sm font-semibold hover:bg-[#e8eddf]">Показать все записи</button></div>
        : <ul className="mt-3 space-y-4">{data.bookings.map(booking=>{
          const status=bookingStatus(booking,clock);
          const color=getAdminSportColor(booking);
          const canModify=booking.canModify&&booking.status==="active"&&new Date(booking.date+"T"+booking.start+":00+03:00").getTime()>clock;
          return <li key={booking.id} className="rounded-3xl border border-l-[5px] border-[#d8dbce] bg-[#fcfaf4] p-5 sm:p-6" style={{borderLeftColor:color.borderColor}}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">{booking.courtName} <span className="ml-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold" style={{backgroundColor:color.backgroundColor,color:color.color}}>{booking.sport}</span></h3><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status.style}`}>{status.label}</span></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_auto]">
              <div><p className="flex items-center gap-2 text-xs text-[#748074]"><FiCalendar size={14} aria-hidden="true" />Дата и время</p><p className="mt-1.5 text-sm font-semibold tabular-nums">{dateLabel(booking.date)} · {booking.start}–{booking.end}</p></div>
              <div><p className="flex items-center gap-2 text-xs text-[#748074]"><FiMapPin size={14} aria-hidden="true" />Зал и участники</p><p className="mt-1.5 text-sm">{booking.hall} · {booking.players ?? "—"} игроков</p></div>
              <div className="min-w-0"><p className="flex items-center gap-2 text-xs text-[#748074]"><FiUser size={14} aria-hidden="true" />Пользователь</p><p className="mt-1.5 break-words text-sm font-semibold">{booking.customer.name ?? "Без аккаунта"}</p>{booking.customer.email && <AppLink href={`mailto:${booking.customer.email}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-[#536354]"><FiMail size={13} className="shrink-0" aria-hidden="true" />{booking.customer.email}</AppLink>}</div>
              <div><p className="text-xs text-[#748074]">Стоимость записи</p><p className="mt-1.5 text-sm font-semibold">{booking.pricing ? money(booking.pricing.totalAmount) : "Не зафиксирована"}</p></div>
            </div>
            {canModify&&<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>setAction({booking,mode:"reschedule"})} aria-label={"Перенести запись: "+booking.courtName+", "+dateLabel(booking.date)+", "+booking.start} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-4 text-sm font-semibold text-white hover:bg-[#536b50]"><FiRepeat aria-hidden="true"/>Перенести</button><button type="button" onClick={()=>setAction({booking,mode:"cancel"})} aria-label={"Отменить запись: "+booking.courtName+", "+dateLabel(booking.date)+", "+booking.start} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d8bfb1] px-4 text-sm font-semibold text-[#84523c] hover:bg-[#faf0e9]"><FiXCircle aria-hidden="true"/>Отменить</button></div>}
            <details className="group mt-4 border-t border-[#dedfd2] pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#526543] [&::-webkit-details-marker]:hidden">Подробности бронирования<FiChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="mt-3 grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-semibold text-[#748074]">Инвентарь</p>{booking.equipment.length ? <ul className="mt-2 space-y-1">{booking.equipment.map(item=><li key={item.id}>{item.name} — {item.quantity} шт.</li>)}</ul> : <p className="mt-2">Со своим инвентарём</p>}</div><div><p className="text-xs font-semibold text-[#748074]">Контактный телефон</p>{booking.customer.phone ? <AppLink href={`tel:${booking.customer.phone.replace(/[^+0-9]/g,"")}`} className="mt-2 inline-flex items-center gap-1.5"><FiPhone size={14} aria-hidden="true" />{booking.customer.phone}</AppLink> : <p className="mt-2">Не указан</p>}</div>{booking.pricing && <dl className="space-y-1 rounded-xl bg-[#e8eddf] p-3 text-xs sm:col-span-2"><div className="flex justify-between gap-3"><dt>Аренда площадки</dt><dd>{money(booking.pricing.baseAmount)}</dd></div><div className="flex justify-between gap-3"><dt>Дополнительные игроки</dt><dd>{money(booking.pricing.extraPlayersAmount)}</dd></div><div className="flex justify-between gap-3"><dt>Инвентарь</dt><dd>{money(booking.pricing.equipmentAmount)}</dd></div></dl>}<p className="break-all text-xs text-[#748074] sm:col-span-2">Бронь № {booking.id}</p></div></details>
          </li>;
        })}</ul>}
        {data.totalPages>1 && <nav aria-label="Страницы всех бронирований" className="mt-6 flex flex-wrap items-center justify-center gap-1.5"><button type="button" aria-label="Предыдущая страница" disabled={data.page===1} onClick={()=>setPage(data.page-1)} className="grid size-10 place-items-center rounded-xl border border-[#b9c0ae] hover:bg-[#e8eddf] disabled:opacity-35"><FiChevronLeft aria-hidden="true" /></button>{pageNumbers.map((number,index)=><span key={number} className="inline-flex items-center gap-1.5">{index>0 && number-pageNumbers[index-1]>1 && <span aria-hidden="true">…</span>}<button type="button" aria-label={`Страница ${number}`} aria-current={number===data.page ? "page" : undefined} onClick={()=>setPage(number)} className={`grid size-10 place-items-center rounded-xl border border-[#b9c0ae] text-sm font-semibold ${number===data.page ? "bg-[#293d30] text-white" : "hover:bg-[#e8eddf]"}`}>{number}</button></span>)}<button type="button" aria-label="Следующая страница" disabled={data.page===data.totalPages} onClick={()=>setPage(data.page+1)} className="grid size-10 place-items-center rounded-xl border border-[#b9c0ae] hover:bg-[#e8eddf] disabled:opacity-35"><FiChevronRight aria-hidden="true" /></button></nav>}
      </>}
      {action&&<BookingChangeDialog admin booking={action.booking} mode={action.mode} onClose={()=>setAction(null)} onSaved={message=>{setAction(null);setNotice(message);setRefresh(value=>value+1);}}/>}
    </main>
  );
}
