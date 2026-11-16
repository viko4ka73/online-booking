import AppLink from "./AppLink";
import { FiArrowRight } from "react-icons/fi";
import { courtForSport, sports, type CatalogState } from "../lib/catalog";
import { money } from "../lib/money";

const descriptions: Record<string,string> = {
  "Бадминтон": "Площадки для одиночной и парной игры. Выберите номер и удобное время тренировки.",
  "Настольный теннис": "Обычные столы в игровом ряду и отдельные просторные VIP-зоны.",
  "Волейбол": "Залы для командных игр и тренировок с друзьями.",
  "Баскетбол": "Залы для тренировок бросков и командной игры.",
  "Футбол": "Крытые залы для мини-футбола. Соберите команду и выберите удобное время.",
  "Теннис": "Крытые корты для игры и теннисная стенка для отработки ударов.",
};

export default function SportCards({ catalog }: { catalog: CatalogState }) {
  if (catalog.loading || catalog.error) return null;
  return <section aria-label="Спортивные направления" className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-10 lg:px-16">
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {sports.map(({ name, icon: Icon }) => {
        const courts = catalog.courts.flatMap(court => { const match = courtForSport(court,name); return match ? [match] : []; });
        const preferredNumber:Record<string,number>={"Теннис":1,"Футбол":2,"Волейбол":4,"Баскетбол":5};
        const photo = (courts.find(court=>court.kind==='whole'&&court.resourceNumber===preferredNumber[name]) ?? (name === "Теннис" ? courts.find(court=>court.kind === "whole") : courts[0]))?.image;
        const price = courts.length ? Math.min(...courts.map(court=>court.hourlyRate)) : null;
        const count = name === "Теннис" ? `Кортов: ${courts.filter(court=>court.kind === "whole").length}${courts.some(court=>court.kind!=="whole")?" · стенка":""}` : `${name === "Бадминтон" ? "Площадок" : name === "Настольный теннис" ? "Столов" : "Залов"}: ${courts.length}`;
        return <article key={name} className="flex flex-col overflow-hidden rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
          <div className="relative h-48 overflow-hidden bg-[#e8eddf]">
            {photo ? <img src={photo} alt={`Площадки для спорта: ${name.toLowerCase()}`} className={`${photo.startsWith('/images/home/')?'h-[140%] -translate-y-[28.571%]':'h-full'} w-full object-cover object-right`} /> : <div className="grid h-full place-items-center text-[#536354]"><Icon size={64} aria-hidden="true" /></div>}
            <span className="absolute left-3 top-3 rounded-full bg-[#fcfaf4] px-3 py-1.5 text-xs font-semibold text-[#405640]">{count}</span>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <h2 className="flex items-center gap-3 font-serif text-2xl"><Icon size={25} className="shrink-0 text-[#69774b]" aria-hidden="true" />{name}</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#748074]">{descriptions[name]}</p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#dedfd2] pt-4">
              <p className="text-sm font-semibold">{price === null ? 'Скоро в комплексе' : `от ${money(price)}/ч`}</p>
              <AppLink href={`/courts?sport=${encodeURIComponent(name)}`} aria-label={`Выбрать площадку: ${name}`} className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-4 py-2.5 text-sm font-semibold text-white! hover:bg-[#536b50]">Выбрать площадку<FiArrowRight size={16} aria-hidden="true" /></AppLink>
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
