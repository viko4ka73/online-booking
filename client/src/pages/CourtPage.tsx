import {useNavigate} from "react-router-dom";
import AppLink from "../components/AppLink";
import { FiArrowRight,FiMapPin,FiUser } from "react-icons/fi";
import { money } from "../lib/money";
import { courtForSport, type CatalogState } from "../lib/catalog";
import type { FavoritesState } from "../lib/favorites";
import PageHeading from "../components/PageHeading";
import CatalogStatus from "../components/CatalogStatus";
import FavoriteButton,{ FavoritesFeedback } from "../components/FavoriteButton";
import CourtSchedule from "../components/CourtSchedule";

type Props = { courtId: string; detailSport: string | null; catalog: CatalogState; favorites: FavoritesState; signedIn: boolean; onLogin: () => void; onBookingLogin: () => void };
export default function CourtPage({ courtId,detailSport,catalog,favorites,signedIn,onLogin,onBookingLogin }: Props) {
  const navigate=useNavigate();
  const found=catalog.courts.find(court => String(court.id) === courtId);
  const activeCourt=found?courtForSport(found,detailSport):null;
  const title = activeCourt?.name ?? (catalog.loading ? "Загружаем площадку…" : catalog.error ? "Площадка" : "Площадка не найдена");
  return <>
    <PageHeading eyebrow={activeCourt?.sport ?? "Аренда залов"} title={title} description={activeCourt ? "Расписание и свободное время этой площадки." : "Выберите площадку из каталога."} />
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 lg:px-16">
          <AppLink href={detailSport ? `/courts?sport=${encodeURIComponent(detailSport)}` : "/courts"} className="inline-flex items-center gap-2 text-sm font-semibold underline! underline-offset-4">
            <FiArrowRight size={16} className="rotate-180" aria-hidden="true" /> К списку площадок
          </AppLink>
          {activeCourt && (activeCourt.sports?.length ?? 0)>1 && <label className="mt-5 block max-w-sm text-sm font-semibold">Вид спорта<select value={activeCourt.sportId} onChange={event=>{const params=new URLSearchParams(window.location.search);params.set("sport",event.target.value);params.delete("repeat");navigate(`/courts/${activeCourt.id}?${params}`);}} className="mt-2 h-12 w-full rounded-xl border border-[#cdd2c3] bg-white px-3">{activeCourt.sports?.map(sport=><option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label>}
          {activeCourt && (activeCourt.hourlySurcharge ?? 0)>0 && <p className="mt-5 rounded-2xl border border-[#cdd2c3] bg-[#e8eddf] px-4 py-3 text-sm leading-relaxed text-[#405640]">VIP-стол в отдельной просторной зоне. Доплата {money(activeCourt.hourlySurcharge!)}/час уже включена в стоимость аренды.</p>}
          {Boolean(activeCourt?.adjacency?.length)&&<div className="mt-5 rounded-2xl border border-[#cdd2c3] bg-[#e8eddf] px-4 py-3 text-sm leading-relaxed text-[#405640]"><p className="font-semibold">Смежные площадки</p>{activeCourt?.adjacency?.map(link=>{const allowed=link.allowedPairs.filter(([sport])=>sport===activeCourt.sportId).map(([,sport])=>catalog.courts.find(c=>c.id===link.courtId)?.sports?.find(s=>s.id===sport)?.name??sport);return <p key={link.courtId} className="mt-1">{link.courtName}: одновременно {allowed.length?`доступны ${[...new Set(allowed)].join(', ').toLowerCase()}`:'другая игра недоступна'}. Каждый объект бронируется отдельно.</p>})}<p className="mt-1 text-xs">Календарь уже учитывает эти ограничения.</p></div>}
          <FavoritesFeedback favorites={favorites} />
          <CatalogStatus catalog={catalog} />
          {!catalog.loading && !catalog.error && !activeCourt && (
            <div className="mt-6 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-7 sm:p-10">
              <h2 className="font-serif text-2xl">Не удалось найти эту площадку</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#536354]">Возможно, ссылка устарела. Откройте каталог и выберите другую площадку.</p>
              <AppLink href="/courts" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#293d30] px-5 py-3 text-sm font-semibold text-white!">Открыть каталог <FiArrowRight size={16} aria-hidden="true" /></AppLink>
            </div>
          )}
          {activeCourt && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-stretch xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <section aria-labelledby="court-details-title" className="w-full overflow-hidden rounded-3xl border border-[#d8dbce] bg-[#fcfaf4]">
                <div className="relative">
                  <img src={activeCourt.image} alt={`Зал для игры: ${activeCourt.sport.toLowerCase()}`} className="aspect-[16/10] w-full object-cover" />
                  <div className="absolute bottom-3 right-3"><FavoriteButton courtId={activeCourt.id} courtName={activeCourt.name} favorites={favorites} onLogin={() => onLogin()} /></div>
                </div>
                <div className="p-4 sm:p-5">
                  <h2 id="court-details-title" className="font-serif text-2xl">О площадке</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#405640]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eddf] px-2.5 py-1"><FiMapPin aria-hidden="true" />{activeCourt.hall}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eddf] px-2.5 py-1"><FiUser aria-hidden="true" />{activeCourt.minPlayers}–{activeCourt.players} игроков</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[#536354]">{activeCourt.description}</p>
                  <div className="mt-4 rounded-xl bg-[#e8eddf] p-3">
                    <p className="text-lg font-semibold">от {money(activeCourt.hourlyRate)}/ч</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#536354]">Включены {activeCourt.minPlayers} игроков. Доплата за игроков зависит от выбранного времени.</p>
                    <AppLink href={`/prices?sport=${encodeURIComponent(activeCourt.sport)}`} className="mt-2 inline-block text-xs font-semibold underline! underline-offset-4">Прайс по времени суток</AppLink>
                    <p className="mt-1 text-xs text-[#536354]">По действующему прайсу</p>
                  </div>
                  <dl className="mt-4 divide-y divide-[#dedfd2] border-t border-[#dedfd2] text-sm">
                    {[
                      { label: "Размер игровой зоны", value: activeCourt.dimensions },
                      { label: "Покрытие", value: activeCourt.surface },
                      { label: "Инвентарь", value: activeCourt.equipment },
                    ].map(({ label, value }) => (
                      <div key={label} className="py-2.5 last:pb-0">
                        <dt className="text-xs text-[#536354]">{label}</dt>
                        <dd className="mt-0.5 font-medium leading-relaxed">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
              <section aria-labelledby="court-schedule-title" className="min-w-0 overflow-hidden rounded-3xl border border-[#d8dbce] bg-[#fcfaf4]">
                <h2 id="court-schedule-title" className="px-5 py-4 font-serif text-3xl">Расписание</h2>
                <CourtSchedule key={`${activeCourt.id}-${activeCourt.sportId}`} court={activeCourt} signedIn={signedIn} onLogin={onBookingLogin} />
              </section>
              <section aria-labelledby="court-rules-title" className="rounded-2xl bg-[#e8eddf] p-5 lg:col-span-2">
                <h2 id="court-rules-title" className="font-serif text-2xl">Правила посещения</h2>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-relaxed text-[#405640]">
                  <li>В раздевалку можно пройти за <strong>30 минут</strong> до начала игры.</li>
                  <li>Сменная спортивная обувь обязательна.</li>
                  <li>На площадку можно выйти не раньше чем за <strong>5 минут</strong> до начала игры.</li>
                  <li>Отменить или перенести бронь можно не позднее чем за <strong>48 часов</strong> до начала игры.</li>
                </ul>
              </section>
            </div>
          )}
        </main>
  </>;
}
