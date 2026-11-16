import AppLink from "../components/AppLink";
import PageHeading from "../components/PageHeading";
import { useEffect, useState, type ComponentType } from "react";
import { FiArrowRight, FiClock, FiUsers } from "react-icons/fi";
import { GiBasketballBall, GiPingPongBat, GiSoccerBall, GiShuttlecock, GiTennisBall, GiVolleyballBall } from "react-icons/gi";
import { money } from "../lib/money";
import { minuteTime } from "../lib/time";

type Rate = { dayType: "weekday" | "weekend"; startMinute: number; endMinute: number; hourlyRate: number; extraPlayerHourlyRate: number };
type PriceList = {
  sports: { id: string; name: string; minPlayers: number; hasCourts: boolean; rates: Rate[]; supplements?:{hourlySurcharge:number}[] }[];
  equipment: { id: string; name: string; unitPrice: number; sports: string[] }[];
};
const icons: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  badminton: GiShuttlecock, "table-tennis": GiPingPongBat, volleyball: GiVolleyballBall,
  basketball: GiBasketballBall, football: GiSoccerBall, tennis: GiTennisBall,
};

export default function PricesPage() {
  const [prices, setPrices] = useState<PriceList | null>(null);
  const [activeId, setActiveId] = useState(() => new URLSearchParams(window.location.search).get("sport") ?? "badminton");
  const [vip,setVip]=useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/prices", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) { setPrices(payload); setError(""); }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Не удалось загрузить прайс. Попробуйте ещё раз.");
      });
    return () => controller.abort();
  }, [refresh]);

  const sport = prices?.sports.find(({ id,name }) => id === activeId || name === activeId) ?? prices?.sports[0];
  const Icon = sport ? icons[sport.id] ?? GiShuttlecock : GiShuttlecock;
  const equipment = sport ? prices?.equipment.filter((item) => item.sports.includes(sport.name)) ?? [] : [];
  const supplement=sport?.id==='table-tennis' && vip ? sport.supplements?.[0]?.hourlySurcharge ?? 0 : 0;
  const displayedRates=sport?.rates.map(rate=>({...rate,hourlyRate:rate.hourlyRate+supplement})) ?? [];
  const cheapest=displayedRates.length?Math.min(...displayedRates.map(rate=>rate.hourlyRate)):0;

  return (<>
    <PageHeading eyebrow="Тарифы комплекса" title="Прайс" description="Стоимость аренды, дополнительных игроков и инвентаря." />
    <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-12 lg:px-16">
      {error ? (
        <div role="alert" className="rounded-2xl border border-[#d8dbce] p-5">
          <p>{error}</p>
          <button type="button" onClick={() => { setError(""); setRefresh((value) => value + 1); }}
            className="mt-2 text-sm font-semibold underline underline-offset-4">Повторить</button>
        </div>
      ) : !prices ? <p role="status">Загружаем тарифы…</p> : !sport ? <p>Тарифы пока не добавлены.</p> : (
        <div className="space-y-6">
          <div role="group" aria-label="Вид спорта" className="flex flex-wrap gap-2">
            {prices.sports.map((item) => {
              const SportIcon = icons[item.id] ?? GiShuttlecock;
              return (
                <button key={item.id} type="button" aria-pressed={sport.id === item.id} onClick={() => setActiveId(item.id)}
                  className={`inline-flex items-center gap-2 rounded-full border border-[#b9c0ae] px-4 py-2.5 text-sm font-semibold transition ${sport.id === item.id ? "bg-[#293d30] text-white" : "bg-[#fcfaf4] hover:bg-[#e8eddf]"}`}>
                  <SportIcon size={18} />{item.name}
                </button>
              );
            })}
          </div>

          <section aria-labelledby="sport-prices-title" className="overflow-hidden rounded-3xl border border-[#cdd2c3] bg-[#fcfaf4]">
            <div className="flex flex-wrap items-center gap-4 border-b border-[#dedfd2] p-5 sm:p-7">
              <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#293d30] text-[#d9dfbf]"><Icon size={37} /></span>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#526543]">Аренда площадок</p>
                <h2 id="sport-prices-title" className="mt-1 font-serif text-3xl sm:text-4xl">{sport.name}</h2>
              </div>
              <p className="text-xs text-[#536354]">Стоимость за час аренды</p>
            </div>
            {sport.id==='table-tennis' && Boolean(sport.supplements?.length) && <div className="border-b border-[#dedfd2] p-5 sm:px-7"><div role="group" aria-label="Категория стола" className="flex flex-wrap gap-2">{[{value:false,label:'Обычные столы'},{value:true,label:'VIP-столы'}].map(item=><button key={item.label} type="button" aria-pressed={vip===item.value} onClick={()=>setVip(item.value)} className={`rounded-full border border-[#b9c0ae] px-4 py-2 text-sm font-semibold ${vip===item.value?'bg-[#293d30] text-white':'bg-white hover:bg-[#e8eddf]'}`}>{item.label}</button>)}</div><p className="mt-3 text-xs leading-relaxed text-[#536354]">VIP-столы стоят отдельно и имеют больше места для игры. Доплата {money(sport.supplements![0].hourlySurcharge)}/час{vip?' уже включена в цены ниже.':'. Обычные столы расположены в общем ряду.'}</p></div>}
            <div className="grid divide-y divide-[#dedfd2] md:grid-cols-2 md:divide-x md:divide-y-0">
              {(["weekday", "weekend"] as const).map((dayType) => (
                <div key={dayType} className="p-5 sm:p-7">
                  <h3 className="text-lg font-semibold">{dayType === "weekday" ? "Будние дни" : "Выходные дни"}</h3>
                  <p className="mt-1 text-xs text-[#536354]">{dayType === "weekday" ? "Понедельник — пятница" : "Суббота и воскресенье"}</p>
                  <dl className="mt-5 space-y-4">
                    {displayedRates.filter((rate) => rate.dayType === dayType).map((rate) => (
                      <div key={rate.startMinute}>
                        <div className="flex items-baseline gap-2 text-sm sm:text-base">
                          <dt className="whitespace-nowrap tabular-nums">{minuteTime(rate.startMinute)}–{minuteTime(rate.endMinute)}</dt>
                          <span aria-hidden="true" className="min-w-2 flex-1 border-b border-dotted border-[#b9c0ae]" />
                          <dd className="whitespace-nowrap font-semibold">{money(rate.hourlyRate)}<span className="ml-1 text-xs font-normal text-[#536354]">/ч</span></dd>
                        </div>
                        {rate.hourlyRate === cheapest && <p className="mt-1 text-xs font-semibold text-[#526543]">Выгодное время</p>}
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#dedfd2] bg-[#e8eddf] px-5 py-4 sm:px-7">
              <p className="inline-flex items-center gap-2 text-sm"><FiUsers size={18} className="shrink-0" aria-hidden="true" />В тариф включены {sport.minPlayers} игроков</p>
              {sport.hasCourts ? (
                <AppLink href={`/courts?sport=${encodeURIComponent(sport.name)}`} className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white! hover:bg-[#536b50]">Выбрать площадку <FiArrowRight size={16} aria-hidden="true" /></AppLink>
              ) : <p className="text-xs text-[#536354]">Площадки пока не добавлены в каталог</p>}
            </div>
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.4fr]">
            <section aria-labelledby="extra-player-title" className="rounded-3xl bg-[#293d30] p-5 text-white sm:p-7">
              <FiUsers size={27} className="text-[#c5cea5]" aria-hidden="true" />
              <h2 id="extra-player-title" className="mt-3 font-serif text-2xl">Дополнительные игроки</h2>
              <p className="mt-3 text-2xl font-semibold">От {money(Math.min(...sport.rates.map((rate) => rate.extraPlayerHourlyRate)))}<span className="ml-1 text-xs font-normal">/ игрока в час</span></p>
              <p className="mt-2 text-sm leading-relaxed text-white/85">Доплата за каждого участника сверх {sport.minPlayers} человек рассчитывается за выбранную длительность игры.</p>
            </section>
            <section aria-labelledby="equipment-prices-title" className="rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-5 sm:p-7">
              <h2 id="equipment-prices-title" className="font-serif text-2xl">Инвентарь и услуги</h2>
              <p className="mt-2 text-xs text-[#536354]">За одну штуку на всю бронь. Свой инвентарь можно принести с собой.</p>
              <dl className="mt-4 divide-y divide-[#dedfd2]">
                {equipment.map((item) => (
                  <div key={item.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <dt>{item.name}</dt><dd className="whitespace-nowrap font-semibold">{money(item.unitPrice)}</dd>
                  </div>
                ))}
              </dl>
              {!equipment.length && <p className="mt-4 text-sm text-[#536354]">Инвентарь для этого вида спорта пока не добавлен.</p>}
            </section>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-[#e8eddf] p-5 text-sm leading-relaxed text-[#405640]">
            <FiClock size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Аренда от 1 часа с шагом 30 минут. Если игра пересекает границу тарифов, стоимость каждой части рассчитывается отдельно. Итог виден до подтверждения брони.</p>
          </div>
        </div>
      )}
    </main>
  </>);
}
