import { emailDeliveryMessage } from "../lib/emailNotifications";
import type { Booking } from "../lib/bookings";
import { minuteTime } from "../lib/time";
import { money } from "../lib/money";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowRight, FiCalendar, FiClock, FiMinus, FiPlus, FiUsers } from "react-icons/fi";

export type AdminCustomer={mode:'account';email:string}|{mode:'guest';name:string;phone:string};
type Props = {
  adminCustomer?:AdminCustomer;
  repeatBooking?: Booking;
  courtId: number; sportId?: string; date: string; start: string; end: string; duration: number;
  signedIn: boolean; onLogin: () => void; onBooked: (message: string,booking?:Booking) => void; onRefresh: () => void; onPendingChange: (pending: boolean) => void;
};
type Options = { name: string; minPlayers: number; capacity: number; hourlyRate: number; extraPlayerHourlyRate: number; equipment: { id: string; name: string; max: number; unitPrice: number }[] };

type Quote = {
  baseAmount: number; extraPlayersAmount: number; equipmentAmount: number; totalAmount: number;
  segments: { startMinute: number; endMinute: number; hourlyRate: number; baseAmount: number }[];
};

type QuantityProps = {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
};

function QuantityControl({ label, value, min, max, onChange }: QuantityProps) {
  const buttonStyle = "grid size-10 shrink-0 place-items-center rounded-lg text-[#405640] transition hover:bg-[#e8eddf] focus-visible:outline-2 focus-visible:outline-[#69774b] disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#cdd2c3] bg-white p-1">
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)}
        aria-label={`Уменьшить: ${label}`} className={buttonStyle}><FiMinus size={16} aria-hidden="true" /></button>
      <output aria-live="polite" aria-label={label} className="w-7 text-center text-base font-semibold tabular-nums">{value}</output>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)}
        aria-label={`Увеличить: ${label}`} className={buttonStyle}><FiPlus size={16} aria-hidden="true" /></button>
    </div>
  );
}

export default function BookingForm({ courtId, sportId, date, start, end, duration, signedIn, onLogin, onBooked, onRefresh, onPendingChange, repeatBooking,adminCustomer }: Props) {
  const [optionsAttempt,setOptionsAttempt]=useState(0);
  const [optionsError,setOptionsError]=useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [extraPlayers, setExtraPlayers] = useState(0);
  const [equipment, setEquipment] = useState<Record<string, number>>({});
  const [adjustment, setAdjustment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courts/${courtId}/options${sportId ? `?sport=${encodeURIComponent(sportId)}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) {
          const next: Options = payload.court;
          if (repeatBooking) {
            const players = Math.min(next.capacity, Math.max(next.minPlayers, repeatBooking.players));
            const quantities: Record<string, number> = {};
            let adjusted = players !== repeatBooking.players;
            for (const item of repeatBooking.equipment) {
              const available = next.equipment.find(option => option.id === item.id);
              if (!available) { adjusted = true; continue; }
              quantities[item.id] = Math.min(item.quantity, available.max);
              if (quantities[item.id] !== item.quantity) adjusted = true;
            }
            setExtraPlayers(players - next.minPlayers);
            setEquipment(quantities);
            setAdjustment(adjusted ? "Параметры площадки изменились. Количество игроков и инвентарь скорректированы по текущим ограничениям. Проверьте их перед подтверждением." : "");
          }
          setOptions(next);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptionsError("Не удалось загрузить параметры аренды.");
      });
    return () => controller.abort();
  }, [courtId, sportId, repeatBooking,optionsAttempt]);

  const [quoteResponse,setQuoteResponse] = useState<{ key: string; pricing?: Quote; error?: string } | null>(null);
  const [quoteRefresh,setQuoteRefresh] = useState(0);
  const quoteBody = options ? JSON.stringify({
    date,start,duration,sportId,players: options.minPlayers + extraPlayers,
    equipment: options.equipment.map(({ id }) => ({ id,quantity: equipment[id] ?? 0 })),
  }) : null;
  const quote = quoteResponse?.key === quoteBody ? quoteResponse : null;
  const pricing = quote?.pricing;
  const totalAmount = pricing?.totalAmount ?? 0;

  useEffect(() => {
    if (!quoteBody) return;
    const controller = new AbortController();
    fetch(`/api/courts/${courtId}/quote`, {
      method: "POST",headers: { "Content-Type": "application/json" },body: quoteBody,signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!controller.signal.aborted) {
          setQuoteResponse(response.ok ? { key: quoteBody,pricing: data.pricing } : { key: quoteBody,error: data.error || "Не удалось рассчитать стоимость." });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuoteResponse({ key: quoteBody,error: "Не удалось рассчитать стоимость." });
      });
    return () => controller.abort();
  }, [quoteBody,courtId,quoteRefresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signedIn) { onLogin(); return; }
    if (!options || !pricing || submitting.current) return;
    submitting.current = true;
    setPending(true);
    onPendingChange(true);
    setError("");
    setConflict(false);
    try {
      const response = await fetch(adminCustomer?"/api/admin/reservations":"/api/reservations", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer:adminCustomer,courtId, sportId, date, start, duration, players: options.minPlayers + extraPlayers, requestKey, expectedTotal: totalAmount,
          equipment: options.equipment.map(({ id }) => ({ id, quantity: equipment[id] ?? 0 })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { onLogin(); return; }
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(payload.error ?? "Не удалось создать бронь.");
      }
      onBooked(adminCustomer?(payload.email?.queued?(payload.email.deliveryConfigured?'Письмо с подробностями будет отправлено на почту посетителя.':'Уведомление сохранено в очереди писем.'):''):emailDeliveryMessage(payload.email),payload.booking);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось связаться с сервером.");
    } finally {
      submitting.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="p-5 sm:p-7">
      <div className="rounded-2xl bg-[#e8eddf] p-4">
        <p className="text-sm font-semibold">{options?.name ?? "Выбранная площадка"}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#405640]">
          <span className="inline-flex items-center gap-1.5"><FiCalendar size={14} aria-hidden="true" />{date.split("-").reverse().join(".")}</span>
          <span className="inline-flex items-center gap-1.5"><FiClock size={14} aria-hidden="true" />{start}–{end}</span>
        </div>
      </div>
      {repeatBooking && <p className="mt-4 text-xs leading-relaxed text-[#536354]">Игроки и инвентарь заполнены из прошлой записи — их можно изменить. После подтверждения будет создано новое бронирование.</p>}
      {adjustment && <p role="status" className="mt-3 rounded-xl bg-[#f3eddb] p-3 text-sm text-[#705b32]">{adjustment}</p>}
      {!options && !optionsError && <p role="status" className="mt-4 text-sm">Загружаем инвентарь…</p>}
      {optionsError&&<div role="alert" className="mt-4 text-sm text-[#84523c]"><p>{optionsError}</p><button type="button" onClick={()=>{setOptionsError("");setOptionsAttempt(value=>value+1);}} className="mt-2 font-semibold underline underline-offset-4">Повторить загрузку</button></div>}
      {options && (
        <fieldset disabled={pending} className={adminCustomer?"mt-4 grid min-w-0 items-start gap-4 disabled:opacity-60 md:grid-cols-2":"mt-5 min-w-0 space-y-5 disabled:opacity-60"}>
          <legend className="sr-only">Игроки и дополнительный инвентарь</legend>
          <div className={`rounded-2xl border border-[#dedfd2] p-4 ${adminCustomer?"md:col-span-2":""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold"><FiUsers size={16} className="text-[#526543]" aria-hidden="true" />Игроки</p>
                <p className="mt-1 text-xs text-[#536354]">От {options.minPlayers} до {options.capacity} человек{adminCustomer?"":", включая вас"}</p>
                <p className="mt-1 text-xs text-[#536354]">{options.minPlayers} включены · доплата за остальных зависит от времени игры</p>
              </div>
              <QuantityControl label="Количество игроков" value={options.minPlayers + extraPlayers} min={options.minPlayers} max={options.capacity}
                onChange={(value) => {
                  setExtraPlayers(value - options.minPlayers);
                  setRequestKey(crypto.randomUUID());
                }} />
            </div>
            {extraPlayers > 0 && <p className="mt-3 border-t border-[#dedfd2] pt-2 text-xs text-[#536354]">Дополнительно к минимальной группе: {extraPlayers}</p>}
          </div>
          <div className={adminCustomer?"min-w-0 rounded-2xl border border-[#dedfd2] p-4":undefined}>
            <h3 className="text-sm font-semibold">Инвентарь в аренду</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#536354]">{options.equipment.length ? "Выберите нужное количество. Если используется свой инвентарь, оставьте 0." : "Арендуемый инвентарь для этой площадки пока не указан. Возьмите свой инвентарь."}</p>
            {options.equipment.length > 0 && <div className={adminCustomer?"mt-3 divide-y divide-[#dedfd2]":"mt-3 divide-y divide-[#dedfd2] rounded-2xl border border-[#dedfd2] px-4"}>
              {options.equipment.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="min-w-28 text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-[#536354]">{money(item.unitPrice)} за шт. на всю бронь · до {item.max} шт.</p>
                  </div>
                  <QuantityControl label={item.name} value={equipment[item.id] ?? 0} min={0} max={item.max}
                    onChange={(quantity) => {
                      setEquipment({ ...equipment, [item.id]: quantity });
                      setRequestKey(crypto.randomUUID());
                    }} />
                </div>
              ))}
            </div>}
          </div>
          <div className="rounded-2xl bg-[#e8eddf] p-4">
            <h3 className="text-sm font-semibold">Стоимость бронирования</h3>
            <p className="mt-1 text-xs text-[#536354]">Расчёт по действующему прайсу</p>
            {pricing ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt>Площадка · {duration / 60} ч</dt><dd className="whitespace-nowrap font-semibold">{money(pricing.baseAmount)}</dd></div>
                {pricing.segments.map((segment) => (
                  <div key={segment.startMinute} className="flex flex-wrap justify-between gap-x-3 text-xs text-[#536354]">
                    <dt>{minuteTime(segment.startMinute)}–{minuteTime(segment.endMinute)} · {money(segment.hourlyRate)}/ч</dt>
                    <dd>{money(segment.baseAmount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3"><dt>Дополнительные игроки · {extraPlayers}</dt><dd className="whitespace-nowrap font-semibold">{money(pricing.extraPlayersAmount)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Инвентарь</dt><dd className="whitespace-nowrap font-semibold">{money(pricing.equipmentAmount)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-[#cdd2c3] pt-3 text-base font-semibold">
                  <dt>Итого</dt><dd className="whitespace-nowrap" aria-live="polite">{money(totalAmount)}</dd>
                </div>
              </dl>
            ) : quote?.error ? (
              <div className="mt-3 text-sm">
                <p role="alert" className="text-red-800">{quote.error}</p>
                <button type="button" onClick={() => { setQuoteResponse(null); setQuoteRefresh((value) => value + 1); }} className="mt-2 font-semibold underline underline-offset-4">Повторить расчёт</button>
              </div>
            ) : <p role="status" className="mt-3 text-sm">Рассчитываем стоимость…</p>}
          </div>
        </fieldset>
      )}
      </div>
      {options&&<div className="sticky bottom-0 space-y-3 border-t border-[#dedfd2] bg-[#fcfaf4]/95 px-5 py-4 backdrop-blur sm:px-7">
        <p className="text-xs leading-relaxed text-[#536354]">Отмена и перенос — не позднее чем за 48 часов до игры. Сменная обувь обязательна.</p>
        {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
        {conflict&&<button type="button" disabled={pending} onClick={onRefresh} className="text-sm font-semibold underline underline-offset-4">Обновить расписание</button>}
        <button type="submit" disabled={pending||!pricing} className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#293d30] px-4 py-3 text-sm font-semibold text-white hover:bg-[#536b50] disabled:opacity-50">{pending?'Подтверждаем…':!pricing?'Ожидаем расчёт':signedIn?`${adminCustomer?'Создать запись':'Подтвердить'} · ${money(totalAmount)}`:'Войти и забронировать'}{!pending&&<FiArrowRight size={17} aria-hidden="true"/>}</button>
      </div>}
    </form>
  );
}
