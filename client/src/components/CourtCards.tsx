import AppLink from "./AppLink";
import { FiArrowRight,FiMapPin,FiUser } from "react-icons/fi";
import { money } from "../lib/money";
import type { CatalogState,Court } from "../lib/catalog";
import type { FavoritesState } from "../lib/favorites";
import FavoriteButton,{ FavoritesFeedback } from "./FavoriteButton";

type Props = { courts: Court[]; catalog: CatalogState; favorites: FavoritesState; onLogin: () => void; selectedSport?: string | null; featured?: boolean };
export default function CourtCards({ courts,catalog,favorites,onLogin,selectedSport,featured = false }: Props) {
  return (
      <section id="courts" className="mx-auto w-full max-w-[1440px] px-5 pb-8 pt-5 md:px-10 lg:px-16">
        <FavoritesFeedback favorites={favorites} />
        <div className={!featured ? undefined : "grid gap-7 lg:grid-cols-[260px_1fr] lg:gap-9"}>
          {featured && <div className="lg:pt-1">
            <h2 className="font-display text-[31px] font-extrabold leading-[1.1] tracking-[-0.04em] md:text-[36px]">
              Популярные<br />площадки
            </h2>
            <div className="mt-4 h-[3px] w-[164px] bg-[#e7e4d7]"><span className="block h-full w-11 bg-[#859369]" /></div>
            <p className="mt-4 max-w-[260px] text-[15px] leading-[1.4]">
              Залы для тренировок и игр с друзьями
            </p>
            <AppLink href="/courts" className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#52634f] px-5 py-2.5 text-sm font-medium transition hover:bg-[#26382d] hover:text-white">
              Все площадки <FiArrowRight size={17} />
            </AppLink>
          </div>}
          {!catalog.loading && !catalog.error && courts.length === 0 && <p className="py-6">Площадки для этого вида спорта пока не добавлены.</p>}
          <div className={`grid ${featured ? "items-start" : "items-stretch"} gap-5 md:grid-cols-2 xl:grid-cols-3`}>
            {courts.map((court) => (
              <article key={court.id} className={`group relative overflow-hidden bg-[#fcfaf4] transition hover:-translate-y-1 hover:shadow-lg ${featured ? "rounded-[16px] shadow-[0_5px_18px_rgba(31,48,37,0.08)]" : "flex flex-col rounded-3xl border border-[#d8dbce] shadow-sm"}`}>
                <div className={`relative shrink-0 overflow-hidden bg-[#d9ded5] ${featured ? "h-[140px]" : "h-48"}`}>
                  <img src={court.image} alt={`${court.sport} — ${court.name}`} className={`${court.image.startsWith("/images/home/") ? "h-[140%] -translate-y-[28.571%]" : "h-full"} w-full object-cover object-right transition duration-500 group-hover:scale-[1.03]`} />
                  <div className="absolute left-3 top-3"><FavoriteButton courtId={court.id} courtName={court.name} favorites={favorites} onLogin={() => onLogin()} compact /></div>
                  <span className="absolute right-3 top-3 rounded-full bg-[#f8f6ee] px-3 py-1 text-[12px] font-medium leading-4 text-[#1f3025] shadow-sm">
                    {court.sport}
                  </span>
                </div>
                {!featured ? <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-2xl">{court.name}</h3>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#748074]">{court.kind === "whole" ? `${court.dimensions} · ${court.surface}. Зал арендуется целиком.` : court.description}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#536354]">
                    <span className="inline-flex items-center gap-1.5"><FiUser size={16} aria-hidden="true" />{court.minPlayers}–{court.players} чел.</span>
                    <span className="inline-flex items-center gap-1.5"><FiMapPin size={16} aria-hidden="true" />{court.hall}</span>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dedfd2] pt-4">
                      <div><p className="text-sm font-semibold text-[#405640]">от {money(court.hourlyRate)}/ч</p><p className="mt-1 text-[10px] text-[#748074]">По действующему прайсу</p></div>
                      <AppLink href={`/courts/${court.id}?sport=${encodeURIComponent(selectedSport || court.sportId || court.sport)}`}
                        aria-label={`Посмотреть расписание: ${court.name}, ${court.sport}`}
                        className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white! after:absolute after:inset-0 after:content-[''] group-hover:bg-[#536b50]">Выбрать время<FiArrowRight size={16} aria-hidden="true" /></AppLink>
                    </div>
                  </div>
                </div> : <>
                <div className="px-4 pb-3 pt-2.5">
                  <h3 className="text-[14px] font-semibold">{court.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-[#405640]">от {money(court.hourlyRate)}/ч</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 whitespace-nowrap text-[12px]">
                      <span className="flex items-center gap-1"><FiUser size={15} />{court.minPlayers}–{court.players} чел.</span>
                      <span className="flex items-center gap-1"><FiMapPin size={15} />{court.hall}</span>
                    </div>
                  </div>
                </div>
                <AppLink href={`/courts/${court.id}${(selectedSport || court.sportId) ? `?sport=${encodeURIComponent(selectedSport || court.sportId!)}` : ""}`}
                  aria-label={`Посмотреть расписание: ${court.name}, ${court.sport}`}
                  className="mx-4 mb-4 inline-flex items-center gap-2 rounded-full bg-[#293d30] px-4 py-2 text-sm font-semibold text-white! after:absolute after:inset-0 after:content-[''] group-hover:bg-[#536b50]">
                  Посмотреть расписание <FiArrowRight size={16} aria-hidden="true" />
                </AppLink>
                </>}
              </article>
            ))}
          </div>
        </div>
      </section>
  );
}
