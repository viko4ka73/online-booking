import AppLink from "./AppLink";
import { useState } from "react";
import { FiArrowRight, FiChevronLeft, FiChevronRight, FiHeart, FiMapPin } from "react-icons/fi";
import type { FavoriteCourt, FavoritesState } from "../lib/favorites";
import { money } from "../lib/money";
import FavoriteButton, { FavoritesFeedback } from "./FavoriteButton";

type Props = { favorites: FavoritesState; courts: FavoriteCourt[]; catalogLoading: boolean; catalogError: string; onCatalogRetry: () => void };

export default function FavoriteCourts({ favorites,courts,catalogLoading,catalogError,onCatalogRetry }: Props) {
  const [requestedPage,setPage] = useState(1);
  const pageSize = 3;
  const selected = favorites.ids.flatMap(id => courts.filter(court => court.id === id));
  const totalPages = Math.max(1,Math.ceil(selected.length / pageSize));
  const page = Math.min(requestedPage,totalPages);
  const visible = selected.slice((page-1)*pageSize,page*pageSize);
  const pageNumbers = [...new Set([1,page-1,page,page+1,totalPages])]
    .filter(number => number >= 1 && number <= totalPages).sort((a,b) => a-b);
  return (
    <section aria-labelledby="favorites-title" className="min-w-0 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-6 sm:p-9">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="favorites-title" className="font-serif text-3xl">Избранные площадки{favorites.ready && !catalogLoading && !catalogError && <span className="ml-3 text-xl text-[#7e8c62]">{selected.length}</span>}</h2>
          <p className="mt-1 text-sm text-[#748074]">Любимые места для игры — всегда под рукой</p>
        </div>
        <FiHeart size={28} className="hidden shrink-0 text-[#7e8c62] sm:block" aria-hidden="true" />
      </div>
      <FavoritesFeedback favorites={favorites} />
      {catalogError ? <div className="mt-4 text-sm">
        <p role="alert">{catalogError}</p>
        <button type="button" onClick={onCatalogRetry} className="mt-2 font-semibold underline">Загрузить площадки заново</button>
      </div> : favorites.loading || catalogLoading ? <p role="status" className="mt-5 text-sm">Загружаем избранные площадки…</p> : favorites.ready && !selected.length ? (
        <div className="mt-5 rounded-2xl bg-[#e8eddf] p-6 text-center">
          <FiHeart size={28} className="mx-auto text-[#7e8c62]" aria-hidden="true" />
          <p className="mt-3 font-semibold">Здесь будут ваши любимые площадки</p>
          <p className="mt-2 text-sm text-[#536354]">Нажмите на сердечко в каталоге или на странице площадки.</p>
          <AppLink href="/courts" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#293d30] px-5 py-2.5 text-sm font-semibold text-white!">Выбрать площадку <FiArrowRight aria-hidden="true" /></AppLink>
        </div>
      ) : favorites.ready ? <>
        <p role="status" className="mt-4 text-xs text-[#536354]">Площадки {(page-1)*pageSize+1}–{Math.min(page*pageSize,selected.length)} из {selected.length}</p>
        <ul className="mt-3 space-y-3">
          {visible.map(court => (
            <li key={court.id} className="flex items-start gap-3 rounded-2xl border border-[#dedfd2] bg-white p-3 sm:gap-4">
              <AppLink href={`/courts/${court.id}`} aria-label={`Расписание: ${court.name}, ${court.sport}`} className="shrink-0 overflow-hidden rounded-xl">
                <img src={court.image} alt={`${court.sport} — ${court.name}`} loading="lazy" className="h-24 w-20 object-cover sm:h-28 sm:w-28" />
              </AppLink>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-xs text-[#536354]">{court.sport}</p>
                <h3 className="mt-1 text-sm font-semibold">{court.name}</h3>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#536354]"><FiMapPin className="shrink-0" aria-hidden="true" />{court.hall}</p>
                <p className="mt-1 text-sm font-semibold">от {money(court.hourlyRate)}/ч</p>
                <AppLink href={`/courts/${court.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#405640] underline! underline-offset-4">Выбрать время <FiArrowRight size={14} aria-hidden="true" /></AppLink>
              </div>
              <FavoriteButton courtId={court.id} courtName={court.name} favorites={favorites} compact />
            </li>
          ))}
        </ul>
        {totalPages > 1 && (
          <nav aria-label="Страницы избранных площадок" className="mt-5 flex flex-wrap items-center justify-center gap-1.5 border-t border-[#dedfd2] pt-4">
            <button type="button" aria-label="Предыдущая страница избранного" disabled={page === 1} onClick={() => setPage(page-1)}
              className="grid size-9 place-items-center rounded-lg border border-[#b9c0ae] hover:bg-[#e8eddf] disabled:opacity-35">
              <FiChevronLeft size={16} aria-hidden="true" />
            </button>
            {pageNumbers.map((number,index) => (
              <span key={number} className="inline-flex items-center gap-1.5">
                {index > 0 && number - pageNumbers[index-1] > 1 && <span aria-hidden="true" className="px-1 text-[#536354]">…</span>}
                <button type="button" aria-label={`Страница избранного ${number}`} aria-current={number === page ? "page" : undefined}
                  onClick={() => setPage(number)}
                  className={`grid size-9 place-items-center rounded-lg border border-[#b9c0ae] text-sm font-semibold ${number === page ? "bg-[#293d30] text-white" : "hover:bg-[#e8eddf]"}`}>
                  {number}
                </button>
              </span>
            ))}
            <button type="button" aria-label="Следующая страница избранного" disabled={page === totalPages} onClick={() => setPage(page+1)}
              className="grid size-9 place-items-center rounded-lg border border-[#b9c0ae] hover:bg-[#e8eddf] disabled:opacity-35">
              <FiChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </> : null}
    </section>
  );
}
