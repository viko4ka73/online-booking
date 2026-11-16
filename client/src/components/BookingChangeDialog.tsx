import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowRight, FiCalendar, FiChevronDown, FiClock, FiInfo, FiRefreshCw } from "react-icons/fi";
import type { Booking } from "../lib/bookings";
import { getBookingDateRange,bookingDurations as durations } from "../lib/bookingDates";
import { emailDeliveryMessage } from "../lib/emailNotifications";
import { money } from "../lib/money";
import BookingDialog from "./BookingDialog";

type Slot = { start: string; end: string };
type Quote = { baseAmount: number; extraPlayersAmount: number; equipmentAmount: number; totalAmount: number };
type Props = {
  excludeCourtId?:number;admin?:boolean;booking: Booking; mode: "cancel" | "reschedule"; onClose: () => void; onSaved: (message: string) => void;
};
const fieldShell = "relative mt-1.5 flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#cdd2c3] bg-white px-3 transition focus-within:border-[#69774b] focus-within:ring-2 focus-within:ring-[#69774b]/25";
const fieldControl = "h-full w-full min-w-0 bg-transparent text-sm font-medium tabular-nums text-[#203126] outline-none";
const timeMinutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3));

export default function BookingChangeDialog({ booking,mode,onClose,onSaved,admin=false,excludeCourtId }: Props) {
  const endpoint=admin?"/api/admin/reservations":"/api/reservations";
  const { today,lastDate } = getBookingDateRange();
  const [courtId,setCourtId]=useState(excludeCourtId===booking.courtId?0:booking.courtId);
  const [courtsResult,setCourtsResult]=useState<{courts?:{id:number;name:string;hall:string}[];error?:string}|null>(null);
  const [date,setDate] = useState(booking.date >= today && booking.date <= lastDate ? booking.date : today);
  const [duration,setDuration] = useState(Math.min(300,timeMinutes(booking.end)-timeMinutes(booking.start)));
  const [start,setStart] = useState(booking.start);
  const [refresh,setRefresh] = useState(0);
  const [slotsResult,setSlotsResult] = useState<{ key: string; slots?: Slot[]; error?: string } | null>(null);
  const [quoteResult,setQuoteResult] = useState<{ key: string; pricing?: Quote; error?: string } | null>(null);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const submitting = useRef(false);
  const slotsKey = `${courtId}-${date}-${duration}-${refresh}`;
  const availability = slotsResult?.key === slotsKey ? slotsResult : null;
  const selected = availability?.slots?.find((slot) => slot.start === start);
  const quoteBody = selected ? JSON.stringify({ date,start:selected.start,duration,courtId }) : null;
  const quote = quoteResult?.key === quoteBody ? quoteResult : null;
  const sameTime = courtId===booking.courtId && date === booking.date && start === booking.start && duration === timeMinutes(booking.end)-timeMinutes(booking.start);

  useEffect(()=>{
    if(mode!=="reschedule")return;
    const controller=new AbortController();
    fetch(endpoint+"/"+booking.id+"/courts",{credentials:"include",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setCourtsResult({courts:data.courts.filter((c:{id:number})=>c.id!==excludeCourtId)});}).catch(error=>{if(!controller.signal.aborted)setCourtsResult({error:error.message||"Не удалось загрузить площадки."});});
    return()=>controller.abort();
  },[mode,endpoint,booking.id,excludeCourtId]);

  useEffect(() => {
    if (mode !== "reschedule" || !date || !courtId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date,duration:String(duration),courtId:String(courtId) });
    fetch(`${endpoint}/${booking.id}/availability?${query}`, { credentials:"include",signal:controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!controller.signal.aborted) setSlotsResult(response.ok ? { key:slotsKey,slots:data.slots } : { key:slotsKey,error:data.error || "Не удалось загрузить время." });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlotsResult({ key:slotsKey,error:"Не удалось загрузить время." });
      });
    return () => controller.abort();
  }, [booking.id,date,duration,slotsKey,mode,endpoint,courtId]);

  useEffect(() => {
    if (mode !== "reschedule" || !quoteBody) return;
    const controller = new AbortController();
    fetch(`${endpoint}/${booking.id}/quote`, {
      method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:quoteBody,signal:controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!controller.signal.aborted) setQuoteResult(response.ok ? { key:quoteBody,pricing:data.pricing } : { key:quoteBody,error:data.error || "Не удалось рассчитать стоимость." });
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuoteResult({ key:quoteBody,error:"Не удалось рассчитать стоимость." });
      });
    return () => controller.abort();
  }, [booking.id,quoteBody,mode,refresh,endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || (mode === "reschedule" && (!quote?.pricing || !selected || sameTime))) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${booking.id}/${mode}`, {
        method:mode === "cancel" ? "POST" : "PATCH",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(mode === "cancel" ? { version:booking.version } :
          { version:booking.version,date,courtId,start:selected!.start,duration,expectedTotal:quote!.pricing!.totalAmount }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось изменить запись.");
      const message = mode === "cancel" ? "Бронирование отменено. Время снова свободно." : "Бронирование перенесено. Площадка, дата и время сохранены.";
      onSaved([message,(admin?(data.email?.queued?(data.email.deliveryConfigured?"Уведомление будет отправлено на почту посетителя.":"Уведомление сохранено в очереди писем."):""):emailDeliveryMessage(data.email))].filter(Boolean).join(" "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось связаться с сервером.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function refreshTime() {
    setQuoteResult(null);
    setError("");
    setRefresh((value) => value+1);
  }

  return (
    <BookingDialog open pending={pending} onClose={onClose} title={mode === "cancel" ? "Отменить бронирование?" : "Перенести игру"}>
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="rounded-2xl bg-[#e8eddf] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#526543]">Текущая запись</p>
          <p className="mt-1 text-sm font-semibold">{booking.courtName} · {booking.sport}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#405640]">
            <span className="inline-flex items-center gap-1.5"><FiCalendar size={14} aria-hidden="true" />{booking.date.split("-").reverse().join(".")}</span>
            <span className="inline-flex items-center gap-1.5"><FiClock size={14} aria-hidden="true" />{booking.start}–{booking.end}</span>
          </div>
        </div>
        {mode === "cancel" ? (
          <p className="mt-4 text-sm leading-relaxed text-[#536354]">Запись будет отменена, и это время смогут забронировать другие игроки. Запись останется в разделе «Отменённые».</p>
        ) : (
          <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4 disabled:opacity-60">
            <legend className="sr-only">Новые дата и время</legend>
            <p className="text-xs leading-relaxed text-[#536354]">{excludeCourtId?"Для удаления исходной площадки перенесите запись на другую. ":""}Можно выбрать другую площадку только для вида спорта «{booking.sport}». </p>
            <label className="block min-w-0 text-xs font-semibold text-[#405640]">Площадка · {booking.sport}<span className={fieldShell}><select disabled={!courtsResult?.courts} className={fieldControl} value={courtId} onChange={event=>{setCourtId(Number(event.target.value));setStart("");setError("");}}>{excludeCourtId?<option value={0} disabled>Выберите другую площадку</option>:!courtsResult?.courts?.some(c=>c.id===booking.courtId)&&<option value={booking.courtId}>{booking.courtName}</option>}{courtsResult?.courts?.map(c=><option key={c.id} value={c.id}>{c.name+" · "+c.hall}</option>)}</select></span>{excludeCourtId&&courtsResult?.courts?.length===0&&<span role="status" className="mt-2 block text-[#84523c]">Других подходящих площадок для этого вида спорта нет. Вернитесь к удалению и выберите отмену записи.</span>}{courtsResult?.error&&<span role="alert" className="mt-2 block text-[#84523c]">{courtsResult.error}</span>}</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-semibold text-[#405640]">Новая дата
                <span className={fieldShell}>
                  <FiCalendar size={16} className="pointer-events-none shrink-0 text-[#526543]" aria-hidden="true" />
                  <input className={fieldControl} type="date" min={today} max={lastDate} required value={date}
                    onChange={(event) => { setDate(event.target.value); setStart(""); setError(""); }} />
                </span>
              </label>
              <label className="min-w-0 text-xs font-semibold text-[#405640]">Длительность
                <span className={fieldShell}>
                  <FiClock size={16} className="pointer-events-none shrink-0 text-[#526543]" aria-hidden="true" />
                  <select className={`${fieldControl} appearance-none pr-5`} value={duration}
                    onChange={(event) => { setDuration(Number(event.target.value)); setStart(""); setError(""); }}>
                    {durations.map((minutes) => <option key={minutes} value={minutes}>{Math.floor(minutes/60)} ч{minutes%60 ? " 30 мин" : ""}</option>)}
                  </select>
                  <FiChevronDown size={16} className="pointer-events-none absolute right-3 text-[#526543]" aria-hidden="true" />
                </span>
              </label>
            </div>
            <div className="rounded-2xl border border-[#dedfd2] p-4">
              <h3 className="text-sm font-semibold">Выберите новое время</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#536354]">Время Санкт-Петербурга · запись на 40 дней вперёд</p>
              {!courtId ? <p className="mt-3 text-sm">Выберите другую площадку для переноса.</p> : !date ? <p className="mt-3 text-sm">Выберите дату.</p> :
                !availability ? <p role="status" className="mt-3 text-sm">Загружаем время…</p> :
                availability.error ? <p role="alert" className="mt-3 text-sm text-red-800">{availability.error}</p> :
                !availability.slots?.length ? <p className="mt-3 text-sm">На эту дату нет свободного времени для выбранной длительности.</p> : (
                  <label className="mt-3 block">
                    <span className="sr-only">Новое время</span>
                    <span className={fieldShell}>
                      <FiClock size={16} className="pointer-events-none shrink-0 text-[#526543]" aria-hidden="true" />
                      <select value={selected?.start ?? ""} required
                        onChange={(event) => { setStart(event.target.value); setError(""); }}
                        className={`${fieldControl} appearance-none pr-5`}>
                        <option value="" disabled>Выберите свободный интервал</option>
                        {availability.slots.map((slot) => (
                          <option key={slot.start} value={slot.start}>{slot.start}–{slot.end}</option>
                        ))}
                      </select>
                      <FiChevronDown size={16} className="pointer-events-none absolute right-3 text-[#526543]" aria-hidden="true" />
                    </span>
                  </label>
                )}
              <button type="button" onClick={refreshTime} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg px-1 text-xs font-semibold text-[#526543] hover:underline focus-visible:outline-2 focus-visible:outline-[#69774b]">
                <FiRefreshCw size={14} aria-hidden="true" />Обновить расписание
              </button>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-[#536354]"><FiInfo size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Количество игроков ({booking.players}) и выбранный инвентарь сохранятся.</p>
            {sameTime && selected && <p className="text-xs text-[#536354]">Сейчас выбрано исходное время. Укажите другую площадку, дату, интервал или длительность.</p>}
            {selected && (quote?.pricing ? (
              <div className="rounded-2xl bg-[#e8eddf] p-4">
                <h3 className="text-sm font-semibold">Стоимость после переноса</h3><p className="mt-2 text-xs">{courtsResult?.courts?.find(c=>c.id===courtId)?.name??booking.courtName}</p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3"><dt>Площадка</dt><dd className="whitespace-nowrap">{money(quote.pricing.baseAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Дополнительные игроки</dt><dd className="whitespace-nowrap">{money(quote.pricing.extraPlayersAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Инвентарь</dt><dd className="whitespace-nowrap">{money(quote.pricing.equipmentAmount)}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-[#cdd2c3] pt-3 text-base font-semibold">
                    <dt>Новый итог</dt><dd className="whitespace-nowrap" aria-live="polite">{money(quote.pricing.totalAmount)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-[#536354]">Сейчас в брони: {booking.pricing ? money(booking.pricing.totalAmount) : "стоимость не зафиксирована"}</p>
                {booking.pricing && quote.pricing.totalAmount !== booking.pricing.totalAmount && (
                  <p className="mt-1 text-xs font-semibold text-[#405640]">
                    {quote.pricing.totalAmount > booking.pricing.totalAmount ? "Дороже" : "Дешевле"} на {money(Math.abs(quote.pricing.totalAmount-booking.pricing.totalAmount))}
                  </p>
                )}
              </div>
            ) : quote?.error ? <p role="alert" className="text-sm text-red-800">{quote.error}</p> :
              <p role="status" className="text-sm">Рассчитываем стоимость…</p>)}
          </fieldset>
        )}
        <p className="mt-5 border-t border-[#dedfd2] pt-4 text-xs leading-relaxed text-[#536354]">{admin?"Администратор может изменить предстоящую запись до начала игры.":"Изменения доступны не позднее чем за 48 часов до исходного начала игры."}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={pending || (mode === "reschedule" && (!quote?.pricing || !selected || sameTime))}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-5 py-3 text-sm font-semibold text-white hover:bg-[#536b50] disabled:opacity-40">
            {pending ? "Сохраняем…" : mode === "cancel" ? "Да, отменить бронь" : "Подтвердить перенос"}
            {!pending && mode === "reschedule" && <FiArrowRight size={16} aria-hidden="true" />}
          </button>
          <button type="button" onClick={onClose} disabled={pending}
            className="min-h-12 rounded-xl border border-[#b9c0ae] px-5 py-3 text-sm font-semibold hover:bg-[#e8eddf] disabled:opacity-40">Вернуться</button>
        </div>
      </form>
    </BookingDialog>
  );
}
