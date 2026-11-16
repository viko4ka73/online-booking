import AppLink from "./AppLink";
import type { Booking } from "../lib/bookings";
import BookingChangeDialog from "./BookingChangeDialog";
import { money } from "../lib/money";
import { useEffect, useState } from "react";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiRepeat } from "react-icons/fi";

type View = "upcoming" | "past" | "cancelled" | "all";
type BookingPage = {
  bookings: Booking[]; counts: Record<View,number>;
  total: number; page: number; pageSize: number; totalPages: number;
};
const tabs: { id: View; label: string }[] = [
  { id: "upcoming",label: "Предстоящие" }, { id: "past",label: "История" }, { id: "cancelled",label: "Отменённые" }, { id: "all",label: "Все" },
];

export default function MyBookings() {
  const [action,setAction] = useState<{ booking: Booking; mode: "cancel" | "reschedule" } | null>(null);
  const [notice,setNotice] = useState("");
  const [view,setView] = useState<View>("upcoming");
  const [page,setPage] = useState(1);
  const [refresh,setRefresh] = useState(0);
  const [result,setResult] = useState<{ key: string; data?: BookingPage; error?: string } | null>(null);
  const requestKey = `${view}-${page}-${refresh}`;
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;
  const pageNumbers = data
    ? [...new Set([1,data.page-1,data.page,data.page+1,data.totalPages])]
        .filter((number) => number >= 1 && number <= data.totalPages).sort((a,b) => a-b)
    : [];

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view,page: String(page) });
    fetch(`/api/reservations/mine?${query}`, { credentials: "include",signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) setResult({ key: requestKey,data: payload });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey,error: "Не удалось загрузить бронирования." });
      });
    return () => controller.abort();
  }, [view,page,requestKey]);

  return (
    <div className="mt-5">
      {notice && <p role="status" className="mb-4 rounded-xl bg-[#e8eddf] p-3 text-sm text-[#405640]">{notice}</p>}
      <div role="group" aria-label="Раздел бронирований" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" aria-pressed={view === tab.id}
            onClick={() => { setView(tab.id); setPage(1); }}
            className={`rounded-full border border-[#cdd2c3] px-3 py-2 text-xs font-semibold transition sm:text-sm ${view === tab.id ? "bg-[#293d30] text-white" : "hover:bg-[#e8eddf]"}`}>
            {tab.label}{data ? ` · ${data.counts[tab.id]}` : ""}
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-5">
          <p role="alert" className="text-sm text-red-800">{error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-2 text-sm font-semibold underline">Повторить</button>
        </div>
      ) : !data ? <p role="status" className="mt-5 text-sm">Загружаем бронирования…</p> : !data.bookings.length ? (
        <div className="mt-5 rounded-2xl bg-[#e8eddf] px-5 py-7 text-center">
          <p className="font-semibold">{view === "upcoming" ? "Нет предстоящих игр" : view === "past" ? "История пока пуста" : view === "cancelled" ? "Нет отменённых записей" : "Пока нет бронирований"}</p>
          <p className="mt-2 text-sm text-[#536354]">{view === "past" ? "Здесь появятся завершённые записи." : view === "cancelled" ? "Отменённые бронирования сохраняются здесь." : "Выберите площадку и удобное время для игры."}</p>
          {view !== "past" && <AppLink href="/courts" className="mt-4 inline-block rounded-full bg-[#293d30] px-5 py-2.5 text-sm font-semibold text-white!">Выбрать площадку</AppLink>}
        </div>
      ) : (
        <>
          <p role="status" className="mt-4 text-xs text-[#536354]">
            Записи {(data.page-1)*data.pageSize+1}–{Math.min(data.page*data.pageSize,data.total)} из {data.total}
          </p>
          <ul className="mt-3 space-y-3">
            {data.bookings.map((booking,index) => (
              <li key={booking.id} className={`rounded-2xl border p-4 ${view==="upcoming"&&data.page===1&&index===0?"border-[#93a37e] bg-[#f2f6eb]":"border-[#d8dbce] bg-white"}`}>
                {view==="upcoming"&&data.page===1&&index===0&&<p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#60734c]">Ближайшая игра</p>}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#536354]">{booking.sport}{booking.hall!==booking.sport?` · ${booking.hall}`:""}</p>
                    <h3 className="mt-1 text-sm font-semibold">{booking.courtName}</h3>
                  </div>
                  {booking.pricing && <p className="text-sm font-semibold">{money(booking.pricing.totalAmount)}</p>}
                </div>
                <p className="mt-2 text-sm font-semibold tabular-nums">{booking.date.split("-").reverse().join(".")} · {booking.start}–{booking.end}</p>
                {booking.status === "cancelled" && <p className="mt-2 text-xs font-semibold text-[#7b5640]">Отменено</p>}
                {booking.status === "active" && (
                  <div className="mt-3">
                    {booking.canModify ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setNotice(""); setAction({ booking,mode:"reschedule" }); }}
                          className="rounded-full border border-[#b9c0ae] px-3 py-2 text-xs font-semibold hover:bg-[#e8eddf]">Перенести бронирование</button>
                        <button type="button" onClick={() => { setNotice(""); setAction({ booking,mode:"cancel" }); }}
                          className="rounded-full border border-[#d8c2b7] px-3 py-2 text-xs font-semibold text-[#84523c] hover:bg-[#faf0e9]">Отменить</button>
                      </div>
                    ) : <p className="text-xs text-[#536354]">Отмена и перенос доступны не позднее чем за 48 часов до начала игры.</p>}
                  </div>
                )}
                <AppLink href={`/courts/${booking.courtId}?repeat=${encodeURIComponent(booking.id)}&sport=${encodeURIComponent(booking.sportId ?? booking.sport)}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#e8eddf] px-3 py-2 text-xs font-semibold text-[#293d30] transition hover:bg-[#d9dfbf]">
                  <FiRepeat size={14} aria-hidden="true" /> Повторить бронирование
                </AppLink>
                <details className="group mt-3 border-t border-[#e6e8df] pt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#526543] [&::-webkit-details-marker]:hidden">
                    Подробнее <FiChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-3 text-sm">
                    <p>Игроков: {booking.players}</p>
                    {booking.equipment.length ? (
                      <ul className="mt-1 space-y-1 text-xs text-[#536354]">
                        {booking.equipment.map((item) => <li key={item.id}>{item.name} — {item.quantity} шт.</li>)}
                      </ul>
                    ) : <p className="mt-1 text-xs text-[#536354]">Со своим инвентарём</p>}
                    {booking.pricing ? (
                      <dl className="mt-3 space-y-1 rounded-xl bg-[#e8eddf] p-3 text-xs">
                        <div className="flex justify-between gap-2"><dt>Площадка</dt><dd>{money(booking.pricing.baseAmount)}</dd></div>
                        <div className="flex justify-between gap-2"><dt>Дополнительные игроки</dt><dd>{money(booking.pricing.extraPlayersAmount)}</dd></div>
                        <div className="flex justify-between gap-2"><dt>Инвентарь</dt><dd>{money(booking.pricing.equipmentAmount)}</dd></div>
                      </dl>
                    ) : <p className="mt-3 text-xs text-[#536354]">Стоимость этой записи не была зафиксирована.</p>}
                    <p className="mt-3 break-all text-xs text-[#536354]">Бронь № {booking.id}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <nav aria-label="Страницы бронирований" className="mt-5 flex flex-wrap items-center justify-center gap-1.5 border-t border-[#dedfd2] pt-4">
              <button type="button" aria-label="Предыдущая страница" disabled={data.page === 1} onClick={() => setPage(data.page-1)}
                className="grid size-9 place-items-center rounded-lg border border-[#b9c0ae] disabled:opacity-35">
                <FiChevronLeft size={16} aria-hidden="true" />
              </button>
              {pageNumbers.map((number,index) => (
                <span key={number} className="inline-flex items-center gap-1.5">
                  {index > 0 && number - pageNumbers[index-1] > 1 && <span aria-hidden="true" className="px-1 text-[#536354]">…</span>}
                  <button type="button" aria-label={`Страница ${number}`} aria-current={number === data.page ? "page" : undefined}
                    onClick={() => setPage(number)}
                    className={`grid size-9 place-items-center rounded-lg border border-[#b9c0ae] text-sm font-semibold ${number === data.page ? "bg-[#293d30] text-white" : "hover:bg-[#e8eddf]"}`}>
                    {number}
                  </button>
                </span>
              ))}
              <button type="button" aria-label="Следующая страница" disabled={data.page === data.totalPages} onClick={() => setPage(data.page+1)}
                className="grid size-9 place-items-center rounded-lg border border-[#b9c0ae] disabled:opacity-35">
                <FiChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
      {action && (
        <BookingChangeDialog key={`${action.booking.id}-${action.mode}`} booking={action.booking} mode={action.mode}
          onClose={() => { setAction(null); setRefresh((value) => value+1); }}
          onSaved={(message) => { setAction(null); setNotice(message); setRefresh((value) => value+1); }} />
      )}
    </div>
  );
}
