import AppLink from "./AppLink";
import type { Booking } from "../lib/bookings";
import BookingDialog from "./BookingDialog";
import BookingForm from "./BookingForm";
import { getBookingDateRange,bookingDurations as durations } from "../lib/bookingDates";
import { lazy,Suspense,useEffect, useRef, useState } from "react";
import { FiCalendar, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiRepeat, FiBell } from "react-icons/fi";

const WaitlistDialog=lazy(()=>import("./WaitlistDialog"));

type Slot = { start: string; end: string };
type ScheduleCourt = { id: number; name: string; sportId?:string };
type Availability = { slots: Slot[] } | { error: string };

const dayFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeZone: "UTC" });
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthFormat = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });

type ScheduleProps = { court: ScheduleCourt; signedIn: boolean; onLogin: () => void };

export default function CourtSchedule(props: ScheduleProps) {
  const repeatId = new URLSearchParams(window.location.search).get("repeat");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; booking?: Booking; error?: string } | null>(null);
  const key = `${repeatId}-${props.court.id}-${props.signedIn}-${attempt}`;
  useEffect(() => {
    if (!repeatId || !props.signedIn) return;
    const controller = new AbortController();
    fetch(`/api/reservations/${encodeURIComponent(repeatId)}/repeat`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить прошлую запись.");
        if (data.booking.courtId !== props.court.id) throw new Error("Эта запись относится к другой площадке.");
        if (!controller.signal.aborted) setResult({ key, booking: data.booking });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Не удалось загрузить прошлую запись." });
      });
    return () => controller.abort();
  }, [repeatId, props.court.id, props.signedIn, key]);

  if (!repeatId) return <Schedule {...props} />;
  const current = result?.key === key ? result : null;
  if (!props.signedIn || !current?.booking) return (
    <div className="border-t border-[#dedfd2] p-5 text-sm">
      {!props.signedIn ? <>
        <p>Войдите в аккаунт, чтобы повторить свою запись.</p>
        <button type="button" onClick={props.onLogin} className="mt-3 rounded-full bg-[#293d30] px-5 py-2.5 font-semibold text-white">Войти</button>
      </> : current?.error ? <>
        <p role="alert" className="text-red-800">{current.error}</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 font-semibold underline">Попробовать снова</button>
      </> : <p role="status">Подготавливаем повторное бронирование…</p>}
      <AppLink href={`/courts/${props.court.id}`} className="mt-4 block font-semibold underline! underline-offset-4">Открыть обычное расписание</AppLink>
    </div>
  );
  return <Schedule key={key} {...props} court={{...props.court,sportId:current.booking.sportId ?? props.court.sportId}} repeatBooking={current.booking} />;
}

function Schedule({ court, signedIn, onLogin, repeatBooking }: ScheduleProps & { repeatBooking?: Booking }) {
  const courtId = court.id;
  const { today, lastDate } = getBookingDateRange();
  const [initial] = useState(() => {
    const params = new URLSearchParams(repeatBooking ? "" : window.location.search);
    const requested = params.get("date") ?? "";
    const parsed = new Date(requested + "T00:00:00Z");
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= today && requested <= lastDate &&
      Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === requested;
    const toMinutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
    const minutes = repeatBooking ? toMinutes(repeatBooking.end) - toMinutes(repeatBooking.start) : Number(params.get("duration"));
    return { date: validDate ? requested : today, duration: durations.includes(minutes) ? minutes : repeatBooking&&minutes>300?300:60, start: validDate ? params.get("start") : null };
  });
  const [date, setDate] = useState(initial.date);
  const [month, setMonth] = useState(initial.date.slice(0, 7));
  const [duration, setDuration] = useState(initial.duration);
  const [selection, setSelection] = useState<Slot | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [waitlistOpen,setWaitlistOpen]=useState(false);
  const [waitlistNotice,setWaitlistNotice]=useState("");
  const reopenWaitlist=useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const reopenAfterLogin = useRef(false);
  const [bookingPending, setBookingPending] = useState(false);
  const [booked, setBooked] = useState(false);
  const [emailNotice,setEmailNotice] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  useEffect(() => {
    if(signedIn&&reopenWaitlist.current){reopenWaitlist.current=false;setWaitlistOpen(true);}
    if (signedIn && reopenAfterLogin.current) {
      reopenAfterLogin.current = false;
      setDialogOpen(true);
    }
  }, [signedIn]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ date, duration: String(duration), ...(court.sportId?{sport:court.sportId}:{}) });

    fetch(`/api/courts/${courtId}/availability?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        setAvailability(response.ok ? { slots: data.slots } : { error: data.error || "Не удалось загрузить расписание." });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability({ error: "Не удалось загрузить расписание." });
      });

    return () => controller.abort();
  }, [courtId, court.sportId, date, duration, refresh]);

  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leadingBlanks = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  function changeMonth(offset: number) {
    const nextMonth = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
    setMonth(nextMonth.toISOString().slice(0, 7));
  }

  const [useInitialStart, setUseInitialStart] = useState(true);
  const selectedSlot = selection ?? (useInitialStart && availability && "slots" in availability
    ? availability.slots.find(({ start }) => start === initial.start)
    : undefined);

  function clearSelection() {
    setDialogOpen(false);
    setBooked(false);
    setUseInitialStart(false);
    setAvailability(null);
    setSelection(null);
  }

  return (
    <section className="border-t border-[#dedfd2] p-4 sm:p-5" aria-label="Расписание площадки">
      {repeatBooking && !booked && (
        <div role="status" className="mb-4 rounded-2xl border border-[#cdd2c3] bg-[#e8eddf] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><FiRepeat size={16} aria-hidden="true" />Повтор бронирования</p>
          <p className="mt-2 text-xs leading-relaxed text-[#536354]">Длительность, игроки и инвентарь из прошлой записи подставлены. Выберите новую дату и свободное время. Стоимость рассчитаем по действующему прайсу.</p>
          <AppLink href={`/courts/${courtId}`} className="mt-2 inline-block text-xs font-semibold underline! underline-offset-4">Начать без повтора</AppLink>
        </div>
      )}
      <fieldset disabled={bookingPending} className="min-w-0 disabled:opacity-60">
      <legend className="sr-only">Выбор даты и времени</legend>
      <div className="mb-5 grid gap-4 rounded-2xl bg-[#e8eddf] p-4 sm:grid-cols-[1fr_minmax(0,15rem)] sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#293d30] text-white">
            <FiClock size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Параметры аренды</p>
            <p className="mt-0.5 text-xs text-[#536354]">От 1 до 5 часов с шагом 30 минут</p>
          </div>
        </div>
        <label className="min-w-0 text-xs font-semibold text-[#405640]">
          Длительность
          <span className="relative mt-1 block">
            <select className="h-12 w-full appearance-none rounded-xl border border-[#cdd2c3] bg-white pl-3 pr-9 text-sm font-semibold text-[#203126] focus-visible:outline-2 focus-visible:outline-[#69774b]"
              value={duration} onChange={(event) => {
                clearSelection();
                setDuration(Number(event.target.value));
              }}>
              {durations.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {Math.floor(minutes / 60)} ч{minutes % 60 ? " 30 мин" : ""}
                </option>
              ))}
            </select>
            <FiChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          </span>
        </label>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#dedfd2] bg-[#f7f5ec] p-3 sm:p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FiCalendar size={16} className="text-[#526543]" aria-hidden="true" /> Дата игры
          </p>
          <p className="mb-3 text-xs text-[#536354]">Запись доступна на 40 дней вперёд.</p>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" aria-label="Предыдущий месяц" disabled={month <= today.slice(0, 7)}
              onClick={() => changeMonth(-1)} className="rounded-full border border-[#b9c0ae] p-2 hover:bg-white disabled:opacity-30">
              <FiChevronLeft aria-hidden="true" />
            </button>
            <h3 className="text-center text-sm font-semibold capitalize" aria-live="polite">{monthFormat.format(firstDay)}</h3>
            <button type="button" aria-label="Следующий месяц" disabled={month >= lastDate.slice(0, 7)} onClick={() => changeMonth(1)}
              className="rounded-full border border-[#b9c0ae] p-2 hover:bg-white disabled:opacity-30">
              <FiChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 border-t border-[#dedfd2] pt-2 text-center">
            {weekdays.map((weekday) => <span key={weekday} className="py-1 text-xs text-[#536354]">{weekday}</span>)}
            {Array.from({ length: leadingBlanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const isoDate = `${month}-${String(day).padStart(2, "0")}`;
              const selected = date === isoDate;
              return (
                <button key={isoDate} type="button" disabled={isoDate < today || isoDate > lastDate} aria-pressed={selected}
                  aria-current={isoDate === today ? "date" : undefined}
                  aria-label={dayFormat.format(new Date(Date.UTC(year, monthNumber - 1, day)))}
                  onClick={() => {
                    if (selected) return;
                    clearSelection();
                    setDate(isoDate);
                  }}
                  className={`min-h-10 rounded-lg text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-[#69774b] disabled:opacity-35 ${selected ? "bg-[#293d30] font-semibold text-white" : "hover:bg-[#e8eddf]"}`}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-[#dedfd2] bg-[#f7f5ec] p-4">
          <h3 className="font-serif text-2xl">Свободное время</h3>
          <p className="mt-1 text-xs text-[#536354]">{dayFormat.format(new Date(`${date}T00:00:00Z`))} · время Санкт-Петербурга</p>
          {!availability ? <p className="mt-4 text-sm" role="status">Загружаем расписание…</p> :
            "error" in availability ? <p className="mt-4 text-sm text-red-800" role="alert">{availability.error}</p> :
            availability.slots.length === 0 ? <p className="mt-4 text-sm" role="status">На эту дату нет свободного времени для выбранной длительности.</p> : (
              <div className="mt-4 grid grid-cols-2 gap-2 min-[460px]:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {availability.slots.map((slot) => {
                  const selected = selectedSlot?.start === slot.start;
                  return (
                    <button key={slot.start} type="button" aria-pressed={selected} onClick={() => { setBooked(false); setSelection(slot); }}
                      className={`min-h-10 rounded-xl border border-[#aeb69e] px-2 py-2 text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-[#69774b] ${selected ? "bg-[#293d30] text-white" : "bg-white hover:bg-[#e8eddf]"}`}>
                      {slot.start}–{slot.end}
                    </button>
                  );
                })}
              </div>
            )}
          {availability&&!("error" in availability)&&<div className="mt-4 rounded-xl border border-dashed border-[#b9c6a8] p-3"><p className="text-xs text-[#536354]">Нужное время занято?</p><button type="button" onClick={()=>{if(!signedIn){reopenWaitlist.current=true;onLogin();}else setWaitlistOpen(true);}} className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#405640]"><FiBell aria-hidden="true"/>Лист ожидания</button></div>}
          {selectedSlot && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-xl bg-[#e8eddf] p-3 text-[#203126]">
              <FiCheck size={18} className="mt-0.5 shrink-0 text-[#526543]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">{court.name} · {selectedSlot.start}–{selectedSlot.end}</p>
                <p className="mt-0.5 text-xs text-[#536354]">Интервал выбран. Продолжите, чтобы указать игроков и инвентарь.</p>
                <button type="button" onClick={() => setDialogOpen(true)}
                  className="mt-3 rounded-full bg-[#293d30] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#536b50]">Продолжить</button>
              </div>
            </div>
          )}
        </div>
      </div>
      </fieldset>
      {waitlistNotice&&<div role="status" className="mt-5 rounded-2xl bg-[#e8eddf] p-4 text-sm"><p>{waitlistNotice}</p><AppLink href="/account#waitlist" className="mt-2 inline-block font-semibold underline!">Мои заявки</AppLink></div>}
      {waitlistOpen&&<Suspense fallback={<p role="status" className="mt-4 text-sm">Открываем лист ожидания…</p>}><WaitlistDialog court={court} date={date} duration={duration} onClose={()=>setWaitlistOpen(false)} onSaved={message=>{setWaitlistOpen(false);setWaitlistNotice(message);}}/></Suspense>}
      {booked && (
        <div role="status" className="mt-5 rounded-2xl bg-[#e8eddf] p-4 text-sm">
          <p className="font-semibold">Бронирование подтверждено!</p>
          <p className="mt-1">Игроки и инвентарь сохранены вместе с записью.</p>
          {emailNotice && <p className="mt-2 text-xs leading-relaxed text-[#536354]">{emailNotice}</p>}
          <AppLink href="/account" className="mt-2 inline-block font-semibold underline! underline-offset-4">Мои бронирования</AppLink>
        </div>
      )}
      {selectedSlot && (
        <BookingDialog open={dialogOpen} pending={bookingPending} onClose={() => setDialogOpen(false)}>
        <BookingForm key={`${date}-${selectedSlot.start}-${duration}`}
          repeatBooking={repeatBooking}
          courtId={courtId} sportId={court.sportId} date={date} start={selectedSlot.start} end={selectedSlot.end} duration={duration}
          signedIn={signedIn} onLogin={() => {
            reopenAfterLogin.current = true;
            setDialogOpen(false);
            onLogin();
          }} onPendingChange={setBookingPending}
          onBooked={(message) => {
            clearSelection();
            setEmailNotice(message);
            setBooked(true);
            setRefresh((value) => value + 1);
          }}
          onRefresh={() => {
            clearSelection();
            setRefresh((value) => value + 1);
          }} />
        </BookingDialog>
      )}
    </section>
  );
}
