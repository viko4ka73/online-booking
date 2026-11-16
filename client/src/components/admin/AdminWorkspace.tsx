import { lazy,Suspense,useEffect,useState } from "react";
import { FiCalendar, FiList, FiGrid, FiPlus, FiLock, FiTag, FiPackage } from "react-icons/fi";
import { getBookingDateRange } from '../../lib/bookingDates';
import { parseAdminSettings,getCalendarCourtGroup,calendarGroupForSport,type AdminFilters,type AdminView } from '../../lib/adminWorkspace';
import AdminCreateBookingDialog from "./AdminCreateBookingDialog";
import AdminTimeBlockDialog from "./AdminTimeBlockDialog";
import AdminCalendar from "./AdminCalendar";
import AdminReservations from "./AdminReservations";
const AdminCommercial=lazy(()=>import('./AdminCommercial'));
import AdminCourts from "./AdminCourts";

export default function AdminWorkspace({ onCourtSaved,userId }: { onCourtSaved: () => void;userId:string }) {
  const [creating,setCreating]=useState<{courtId?:number;date?:string;start?:string;sport?:string}|null>(null);
  const [blocking,setBlocking]=useState<{courtId?:number}|null>(null);
  const [revision,setRevision]=useState(0);
  const [notice,setNotice]=useState("");
  const storageKey=`igraem-admin-workspace:${userId}`;
  const [settings,setSettings]=useState(()=>{
    let raw:string|null=null;try{raw=sessionStorage.getItem(storageKey);}catch{/* Storage may be unavailable in private browsing. */}
    return parseAdminSettings(raw,getBookingDateRange().today);
  });
  useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({version:1,...settings,search:undefined}));}catch{/* Filtering still works without storage. */}},[settings,storageKey]);
  function changeFilters(changes:Partial<AdminFilters>){setSettings(previous=>({...previous,...changes,page:changes.page??1,calendarGroup:changes.sport!==undefined?calendarGroupForSport(changes.sport):previous.calendarGroup}));}
  function changeView(view:AdminView){setSettings(previous=>({...previous,view,date:view==='calendar'&&!previous.date?getBookingDateRange().today:previous.date}));}
  return <>
    <div className="mx-auto w-full max-w-[1600px] px-5 pt-3 md:px-10 lg:px-16"><div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Разделы панели администратора" className="grid w-full grid-cols-3 rounded-2xl sm:w-fit sm:grid-cols-5 border border-[#d8dbce] bg-[#fcfaf4] p-1">
        {[{ id: "calendar", label: "Календарь", icon: FiCalendar }, { id: "list", label: "Список", icon: FiList }, { id: "courts", label: "Площадки", icon: FiGrid }, {id:"prices",label:"Прайс",icon:FiTag},{id:"equipment",label:"Инвентарь",icon:FiPackage}].map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={settings.view === id} onClick={() => changeView(id as AdminView)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition sm:gap-2 sm:px-5 sm:text-sm ${settings.view === id ? "bg-[#293d30] text-white" : "text-[#536354] hover:bg-[#e8eddf]"}`}><Icon size={17} aria-hidden="true" />{label}</button>)}
      </div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setBlocking({})} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cdd2c3] px-4 text-sm font-semibold hover:bg-[#e8eddf]"><FiLock/>Закрыть время</button><button type="button" onClick={()=>setCreating({})} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 text-sm font-semibold text-white hover:bg-[#536b50] sm:w-auto"><FiPlus aria-hidden="true"/>Создать запись</button></div></div>{notice&&<p role="status" className="mt-4 rounded-xl bg-[#e8eddf] p-4 text-sm text-[#405640]">{notice}</p>}
    </div>
    {settings.view === "calendar" ? <AdminCalendar paused={Boolean(creating||blocking)} onBlock={court=>setBlocking({courtId:court.id})} onNotice={setNotice} onCreate={(court,start,compatibleSport)=>setCreating({courtId:court.id,date:settings.date,start,sport:compatibleSport??(court.sports?.includes(settings.sport)?settings.sport:settings.calendarGroup==="badminton"?"Бадминтон":settings.calendarGroup==="table-tennis"?"Настольный теннис":court.sports?.includes("Теннис")?"Теннис":court.sports?.[0])})} key={`calendar-${revision}`} period={settings.calendarPeriod} onPeriodChange={calendarPeriod=>setSettings(previous=>({...previous,calendarPeriod}))} filters={settings} group={settings.calendarGroup} onGroupChange={calendarGroup=>setSettings(previous=>({...previous,calendarGroup}))} onFiltersChange={changeFilters} /> : settings.view === "list" ? <AdminReservations paused={Boolean(creating||blocking)} key={`list-${revision}`} filters={settings} onFiltersChange={changeFilters} /> : settings.view==="prices"||settings.view==="equipment"?<Suspense fallback={<p role="status" className="p-5 text-sm">Загружаем раздел…</p>}><AdminCommercial key={settings.view} mode={settings.view} onSaved={onCourtSaved}/></Suspense>: <AdminCourts sport={settings.sport} onSportChange={sport=>changeFilters({sport})} onCourtSaved={onCourtSaved} />}
    {blocking&&<AdminTimeBlockDialog initialDate={settings.date} initialCourtId={blocking.courtId} onClose={()=>setBlocking(null)} onSaved={(block,court)=>{setBlocking(null);setNotice("Время закрыто: "+block.courtName+" · "+block.start+"–"+block.end);setRevision(value=>value+1);setSettings(previous=>({...previous,view:"calendar",date:block.date,calendarGroup:getCalendarCourtGroup(court),calendarPeriod:"all"}));}}/>}
    {creating&&<AdminCreateBookingDialog initialCourtId={creating.courtId} initialStart={creating.start} initialDate={creating.date??settings.date} initialSport={creating.sport??(settings.view==='calendar'?(settings.calendarGroup==='badminton'?'Бадминтон':settings.calendarGroup==='table-tennis'?'Настольный теннис':'Теннис'):settings.sport)} onClose={()=>setCreating(null)} onCreated={(booking,message)=>{setCreating(null);setNotice(`Запись создана: ${booking.courtName} · ${booking.date.split('-').reverse().join('.')} · ${booking.start}–${booking.end}. ${message}`);setRevision(value=>value+1);const hour=Number(booking.start.slice(0,2));setSettings(previous=>({...previous,view:previous.view==='courts'?'calendar':previous.view,date:booking.date,sport:booking.sport,search:'',status:'upcoming',page:1,calendarGroup:calendarGroupForSport(booking.sport),calendarPeriod:hour<13?'morning':hour<18?'day':'evening'}));}}/>}
  </>;
}
