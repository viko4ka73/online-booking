import AppLink from "../components/AppLink";
import { sports,courtForSport,type CatalogState } from "../lib/catalog";
import type { FavoritesState } from "../lib/favorites";
import PageHeading from "../components/PageHeading";
import CatalogStatus from "../components/CatalogStatus";
import CourtFinder from "../components/CourtFinder";
import SportCards from "../components/SportCards";
import CourtCards from "../components/CourtCards";

type Props = { catalog: CatalogState; favorites: FavoritesState; onLogin: () => void; selectedSport: string | null };
export default function CourtsPage({ catalog,favorites,onLogin,selectedSport: querySport }: Props) {
  const selectedSport = catalog.courts.flatMap(court=>court.sports ?? []).find(sport=>sport.id===querySport || sport.name===querySport)?.name ?? querySport;
  const visibleCourts = catalog.courts.flatMap(court => { const matched=courtForSport(court,selectedSport);return matched?[matched]:[]; });
  return <>
    <PageHeading eyebrow="Аренда залов" title="Спортивные площадки" description="Выберите вид спорта. Минимальное время аренды — 1 час." />
    <main>
      <CatalogStatus catalog={catalog} />
        <nav aria-label="Фильтр по виду спорта" className="mx-auto flex max-w-[1440px] flex-wrap gap-2 px-5 pt-6 md:px-10 lg:px-16">
          {[null, ...sports.map(({ name }) => name)].map((sport) => (
            <AppLink
              key={sport ?? "all"}
              href={sport ? `/courts?sport=${encodeURIComponent(sport)}` : "/courts"}
              aria-current={sport === selectedSport ? "true" : undefined}
              className={`rounded-full border border-[#aeb69e] px-4 py-2 text-sm ${sport === selectedSport ? "bg-[#293d30] text-white!" : "hover:bg-white"}`}
            >
              {sport ?? "Все виды спорта"}
            </AppLink>
          ))}
        </nav>
      {!catalog.loading && !catalog.error && <div className="mx-auto max-w-[1440px] px-5 pt-5 text-sm text-[#536354] md:px-10 lg:px-16"><p>{selectedSport ? `Доступно объектов: ${visibleCourts.length}` : `Залы и корты: ${catalog.courts.filter(court=>court.kind==='whole').length} · Бадминтон: ${catalog.courts.filter(court=>court.sports?.some(sport=>sport.id==='badminton')??court.sportId==='badminton').length} · Столы: ${catalog.courts.filter(court=>court.kind==='table').length}`}</p>{selectedSport==='Теннис' && <p className="mt-2 text-xs">Корты в универсальных залах используют общую занятость для всех доступных видов спорта. Теннисная стенка совмещена с площадкой бадминтона.</p>}{selectedSport==='Настольный теннис' && <p className="mt-2 text-xs">VIP-столы — отдельные просторные зоны. Доплата указана в прайсе и учитывается в стоимости бронирования. Обычные столы расположены в общем игровом ряду.</p>}</div>}
      {visibleCourts.length > 0 && <CourtFinder key={selectedSport ?? "all"} courts={visibleCourts} sport={selectedSport} />}
      {selectedSport ? (
        <CourtCards courts={[...visibleCourts].sort((a,b)=>{
          const number=(court:typeof a)=>court.sportId==='tennis' && court.kind!=='whole' ? 8 : court.resourceNumber ?? court.id;
          return number(a)-number(b);
        })} catalog={catalog} favorites={favorites} onLogin={onLogin} selectedSport={selectedSport} />
      ) : <SportCards catalog={catalog} />}
    </main>
  </>;
}
