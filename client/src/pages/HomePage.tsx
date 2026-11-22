import AppLink from "../components/AppLink";
import type { ReactNode } from "react";
import { FiArrowRight } from "react-icons/fi";
import { BsCalendarCheck,BsClock,BsTrophy } from "react-icons/bs";
import { sports,courtForSport,type CatalogState } from "../lib/catalog";
import type { FavoritesState } from "../lib/favorites";
import CourtCards from "../components/CourtCards";
import CatalogStatus from "../components/CatalogStatus";

type Props = { header: ReactNode; catalog: CatalogState; favorites: FavoritesState; onLogin: () => void };
export default function HomePage({ header,catalog,favorites,onLogin }: Props) {
  const used = new Set<number>();
  const popularCourts = sports.flatMap(({name}) => {
    const candidates = catalog.courts.flatMap(court => {const match=courtForSport(court,name);return match?[match]:[];});
    const preferredNumber:Record<string,number>={"Теннис":1,"Футбол":2,"Волейбол":4,"Баскетбол":5};
    const eligible=name==='Теннис'?candidates.filter(candidate=>candidate.kind==='whole'):candidates;
    const court=eligible.find(candidate=>!used.has(candidate.id)&&candidate.kind==='whole'&&candidate.resourceNumber===preferredNumber[name]) ?? eligible.find(candidate=>!used.has(candidate.id));
    if (!court) return [];
    used.add(court.id);
    return [court];
  });
  return <>
    <section className="relative isolate min-h-[610px] bg-[#1f3025] text-white sm:min-h-[570px] lg:min-h-[500px]">

        <div
          className="absolute inset-y-0 right-0 w-full bg-cover bg-[85%_center] sm:w-[72%] sm:bg-center"
          style={{ backgroundImage: "url('/images/home/complex-exterior-v3.jpg')", backgroundPositionY: "calc(50% + 40px)" }}
          role="img"
          aria-label="Спортивный комплекс «Играем?» — фасад и главный вход"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#1f3025_0%,rgba(31,48,37,0.96)_23%,rgba(31,48,37,0.78)_43%,rgba(31,48,37,0.22)_74%,rgba(31,48,37,0.14)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[86px]" aria-hidden="true">
          <svg className="h-full w-full" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d="M0 0 C250 100 750 100 1000 0 V100 H0 Z" fill="#f7f5ec" />
          </svg>
        </div>

      {header}

        <div className="relative z-10 mx-auto flex min-h-[610px] max-w-[1440px] items-center px-6 pb-20 pt-28 sm:min-h-[570px] lg:min-h-[500px] lg:px-16 lg:pb-14 lg:pt-[82px]">
          <div className="max-w-[760px]">
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#c3cca3] md:text-xs">
              Спортивный комплекс «Играем?» · Санкт-Петербург
            </p>
            <h1 className="max-w-4xl font-serif text-[clamp(2.4rem,3.9vw,4rem)] leading-[1.02]">
              Собираемся
              <br />
              <span className="italic text-[#c5cea5]">на игру</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/90 md:text-lg">
              Бадминтон, теннис, футбол, волейбол, баскетбол и настольный теннис — в одном комплексе в Приморском районе Петербурга.
            </p>
            <AppLink
              href="/courts"
              className="mt-6 inline-flex items-center gap-4 rounded-full bg-[#89986a] px-7 py-3.5 font-semibold text-white shadow-sm transition hover:bg-[#a0af7c]"
            >
              Забронировать площадку
              <FiArrowRight size={20} />
            </AppLink>
          </div>
        </div>
    </section>
    <main>
      <CatalogStatus catalog={catalog} />
      <section className="relative z-20 mx-auto -mt-[66px] max-w-[1440px] px-5 md:px-10 lg:px-16" aria-label="Виды спорта">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
          {sports.map(({ name, icon: Icon }) => (
            <AppLink
              key={name}
              href={`/courts?sport=${encodeURIComponent(name)}`}
              className="group flex min-h-[126px] flex-col justify-between rounded-[17px] bg-[#f8f6ee] px-5 py-5 text-[#1e3025] shadow-[0_9px_25px_rgba(31,48,37,0.10)] transition hover:-translate-y-1 hover:bg-white"
            >
              <Icon size={38} strokeWidth={1.45} className="transition group-hover:text-[#7b895d]" />
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold leading-tight">
                {name}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#aeb69e]">
                  <FiArrowRight size={16} strokeWidth={1.5} />
                </span>
              </span>
            </AppLink>
          ))}
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-[1440px] grid-cols-1 gap-7 px-7 py-8 md:grid-cols-3 lg:px-16" aria-label="Преимущества">
        <div className="flex items-center justify-center gap-7">
          <BsCalendarCheck size={39} className="shrink-0" />
          <div><h2 className="text-[15px] font-semibold">Удобное бронирование</h2><p className="mt-1 text-sm">Всего несколько кликов</p></div>
        </div>
        <div className="flex items-center justify-center gap-7 border-[#d1d1c4] md:border-x">
          <BsTrophy size={41} className="shrink-0" />
          <div><h2 className="text-[15px] font-semibold">Современное оборудование</h2><p className="mt-1 text-sm">Комфортные площадки</p></div>
        </div>
        <div className="flex items-center justify-center gap-7">
          <BsClock size={40} className="shrink-0" />
          <div><h2 className="text-[15px] font-semibold">Выбор времени</h2><p className="mt-1 text-sm">Онлайн-запись 24/7</p></div>
        </div>
      </section>

      <CourtCards courts={popularCourts} catalog={catalog} favorites={favorites} onLogin={onLogin} featured />
    </main>
  </>;
}
