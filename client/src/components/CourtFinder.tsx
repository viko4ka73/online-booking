import AppLink from "./AppLink";
import { courtForSport,sports,type Court } from "../lib/catalog";
import { getBookingDateRange,bookingDurations as durations } from "../lib/bookingDates";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowUpRight, FiCalendar, FiChevronDown, FiClock, FiActivity, FiSearch, FiChevronLeft, FiChevronRight } from "react-icons/fi";

type Slot = { start: string; end: string };
type Match = { court: Court; slot: Slot };
type Result = { matches: Match[]; exact: boolean; date: string; duration: string; start: string };

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const starts = Array.from({ length: 29 }, (_, index) => {
  const minutes = 480 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
});
const fieldShell = "mt-1.5 flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[#cdd2c3] bg-white px-3 transition-colors focus-within:border-[#69774b] focus-within:ring-2 focus-within:ring-[#69774b]/30";
const fieldControl = "h-full w-full min-w-0 bg-transparent text-sm font-medium tabular-nums text-[#203126] outline-none";
const fieldIcon = "pointer-events-none shrink-0 text-[#526543]";

export default function CourtFinder({ courts, sport }: { courts: Court[]; sport: string | null }) {
  const { today, lastDate } = getBookingDateRange();
  const request = useRef<AbortController | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selectedSport,setSelectedSport]=useState(sport ?? "");
  const [page,setPage]=useState(1);
  const pageSize=6;
  const totalPages=Math.max(1,Math.ceil((result?.matches.length??0)/pageSize));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => request.current?.abort(), []);

  function clearResults() {
    request.current?.abort();
    setPending(false);
    setResult(null);
    setPage(1);
    setError("");
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const date = String(fields.get("date"));
    const duration = String(fields.get("duration"));
    const start = String(fields.get("start"));
    clearResults();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);

    try {
      const candidates=courts.flatMap(court=>{const matched=courtForSport(court,selectedSport);return matched?[matched]:[];});
      const groups = await Promise.all(candidates.map(async (court) => {
        const query = new URLSearchParams({ date, duration, sport:court.sportId??court.sport });
        const response = await fetch(`/api/courts/${court.id}/availability?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Не удалось загрузить расписание.");
        const { slots }: { slots: Slot[] } = await response.json();
        return slots.map((slot) => ({ court, slot }));
      }));
      if (controller.signal.aborted) return;

      const all = groups.flat();
      const exact = all.filter(({ slot }) => slot.start === start);
      const target = toMinutes(start);
      const available = [...new Set(all.map(({ slot }) => toMinutes(slot.start)))].sort((a, b) => a - b);
      const earlier = available.includes(target - 60) ? target - 60 : available.filter((minute) => minute < target).at(-1);
      const later = available.includes(target + 60) ? target + 60 : available.find((minute) => minute > target);
      const alternatives = all
        .filter(({ slot }) => [earlier, later].includes(toMinutes(slot.start)))
        .sort((a, b) => a.slot.start.localeCompare(b.slot.start));
      setResult({ matches: exact.length ? exact : alternatives, exact: exact.length > 0, date, duration, start });
    } catch {
      if (!controller.signal.aborted) setError("Не удалось загрузить расписание. Попробуйте ещё раз.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section aria-labelledby="court-finder-title" className="mx-auto w-full max-w-[1440px] px-5 pt-6 md:px-10 lg:px-16">
      <details className="group rounded-2xl border border-[#d8dbce] bg-[#fcfaf4]">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl bg-[#e8eddf] px-4 py-3 transition-colors hover:bg-[#dfe6d5] focus-visible:outline-2 focus-visible:outline-[#69774b] group-open:rounded-b-none sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#293d30] text-[#f7f5ec]">
            <FiClock size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span id="court-finder-title" className="block text-sm font-semibold sm:text-base">Подбор по времени</span>
            <span className="mt-0.5 block text-xs text-[#536354]">Выберите дату и время — покажем свободные площадки</span>
          </span>
          <span className="hidden text-xs font-semibold text-[#405640] sm:block">
            <span className="group-open:hidden">Открыть</span>
            <span className="hidden group-open:inline">Свернуть</span>
          </span>
          <FiChevronDown className="shrink-0 text-[#405640] transition-transform group-open:rotate-180" size={18} aria-hidden="true" />
        </summary>
        <div className="px-4 pb-5 pt-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#536354]">
            <span className="rounded-full bg-[#e8eddf] px-3 py-1 font-semibold text-[#405640]">{selectedSport || "Все виды спорта"}</span>
            <span>Время Санкт-Петербурга · до 40 дней вперёд</span>
          </div>
          <form onSubmit={search} onChange={clearResults} className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {!sport&&<label className="min-w-0 text-sm font-semibold sm:col-span-2 lg:col-span-4">Вид спорта<span className={`${fieldShell} relative`}><select name="sport" value={selectedSport} onChange={event=>setSelectedSport(event.target.value)} className={`${fieldControl} appearance-none pr-6`}><option value="">Все виды спорта</option>{sports.filter(item=>courts.some(court=>courtForSport(court,item.name))).map(item=><option key={item.name}>{item.name}</option>)}</select><FiChevronDown size={16} className={`${fieldIcon} absolute right-3`} aria-hidden="true"/></span></label>}
            <label className="min-w-0 text-sm font-semibold">
              Дата игры
              <span className={fieldShell}>
                <FiCalendar size={16} className={fieldIcon} aria-hidden="true" />
                <input className={fieldControl} type="date" name="date" min={today} max={lastDate} defaultValue={today} required />
              </span>
            </label>
            <label className="min-w-0 text-sm font-semibold">
              Начало игры
              <span className={`${fieldShell} relative`}>
                <FiClock size={16} className={fieldIcon} aria-hidden="true" />
                <select className={`${fieldControl} appearance-none pr-6`} name="start" defaultValue="18:00">
                  {starts.map((start) => <option key={start}>{start}</option>)}
                </select>
                <FiChevronDown size={16} className={`${fieldIcon} absolute right-3`} aria-hidden="true" />
              </span>
            </label>
            <label className="min-w-0 text-sm font-semibold">
              Длительность
              <span className={`${fieldShell} relative`}>
                <FiActivity size={16} className={fieldIcon} aria-hidden="true" />
                <select className={`${fieldControl} appearance-none pr-6`} name="duration" defaultValue="60">
                  {durations.map((minutes) => (
                    <option key={minutes} value={minutes}>{Math.floor(minutes / 60)} ч{minutes % 60 ? " 30 мин" : ""}</option>
                  ))}
                </select>
                <FiChevronDown size={16} className={`${fieldIcon} absolute right-3`} aria-hidden="true" />
              </span>
            </label>
            <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#536b50] disabled:opacity-60">
              <FiSearch size={16} className="shrink-0" aria-hidden="true" />
              {pending ? "Ищем площадки…" : "Найти площадку"}
            </button>
          </form>
          {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
          {result && (
            <div className="mt-5 border-t border-[#dedfd2] pt-4">
              <p role="status" className="font-semibold">
                {result.exact ? `Свободные площадки в ${result.start}` :
                  result.matches.length ? `В ${result.start} свободных площадок нет. Вот варианты на другое время:` :
                    "На эту дату нет свободных площадок для выбранной длительности."}
              </p>
              {result.matches.length>0&&<p className="mt-1 text-xs text-[#536354]">Найдено вариантов: {result.matches.length}. Выберите карточку, чтобы продолжить.</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.matches.slice((page-1)*pageSize,page*pageSize).map(({ court, slot }) => {
                  const query = new URLSearchParams({ date: result.date, duration: result.duration, start: slot.start });
                  query.set("sport", court.sportId ?? court.sport);
                  return (
                    <AppLink key={`${court.id}-${slot.start}`} href={`/courts/${court.id}?${query}`}
                      className="group/result flex items-center gap-3 rounded-xl border border-[#d8dbce] bg-white p-2.5 transition hover:border-[#81905d] hover:bg-[#f7f9f3]">
                      <img src={court.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{court.name}</span>
                        <span className="block text-xs text-[#536354]">{court.sport}{court.hall!==court.sport?` · ${court.hall}`:""}</span>
                        <span className="mt-1 inline-block rounded-full bg-[#e8eddf] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#405640]">{slot.start}–{slot.end}</span>
                      </span>
                      <FiArrowUpRight size={17} className="shrink-0 text-[#526543]" aria-hidden="true" />
                    </AppLink>
                  );
                })}
              </div>
              {totalPages>1&&<nav aria-label="Страницы найденных площадок" className="mt-4 flex items-center justify-center gap-4"><button type="button" aria-label="Предыдущие варианты" disabled={page===1} onClick={()=>setPage(value=>value-1)} className="grid size-10 place-items-center rounded-xl border border-[#cdd2c3] hover:bg-[#e8eddf] disabled:opacity-30"><FiChevronLeft aria-hidden="true"/></button><span className="text-sm tabular-nums">{page} / {totalPages}</span><button type="button" aria-label="Следующие варианты" disabled={page===totalPages} onClick={()=>setPage(value=>value+1)} className="grid size-10 place-items-center rounded-xl border border-[#cdd2c3] hover:bg-[#e8eddf] disabled:opacity-30"><FiChevronRight aria-hidden="true"/></button></nav>}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
