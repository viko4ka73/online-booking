import AppLink from "../components/AppLink";
import { FiMail,FiMapPin,FiUser } from "react-icons/fi";
import { BsClock } from "react-icons/bs";
import PageHeading from "../components/PageHeading";
export default function ContactsPage() {
  return <>
    <PageHeading eyebrow="Планируйте визит" title="Контакты" description="Адрес комплекса, часы работы и маршрут до входа." />
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-12 lg:px-16">
          <div className="grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
            <section className="rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-7 sm:p-10">
              <p className="inline-block rounded-full bg-[#e8eddf] px-3 py-1 text-xs font-semibold text-[#405640]">Спортивный комплекс «Играем?»</p>
              <h2 className="mt-4 font-serif text-3xl sm:text-4xl">Кортовый переулок, 8</h2>
              <p className="mt-2 text-sm text-[#536354]">Санкт-Петербург · Приморский район</p>
              <dl className="mt-5 divide-y divide-[#d8dbce]">
                {[
                  { label: "Телефон администратора", value: "+7 (000) 123-45-67", Icon: FiUser },
                  { label: "Часы работы", value: "Будни 08:00–23:00 · выходные 09:00–22:00", Icon: BsClock },
                  { label: "Электронная почта", value: "igraem.spb.booking@mail.ru", Icon: FiMail },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="grid grid-cols-[2.5rem_1fr] gap-x-3 py-4">
                    <span aria-hidden="true" className="row-span-2 grid h-10 w-10 place-items-center rounded-xl bg-[#e8eddf] text-[#405640]"><Icon size={18} /></span>
                    <dt className="text-sm text-[#536354]">{label}</dt>
                    <dd className="break-words font-semibold">{label === "Электронная почта" ? <AppLink href={`mailto:${value}`} className="underline! underline-offset-4">{value}</AppLink> : value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-3xl bg-[#293d30] p-7 text-white sm:p-10">
              <FiMapPin size={30} aria-hidden="true" className="text-[#c5cea5]" />
              <h2 className="mt-4 font-serif text-3xl">Как добраться</h2>
              <ol className="mt-6 space-y-5 border-l border-[#c5cea5]/45 pl-6">
                <li>
                  <h3 className="font-semibold text-[#d9dfbf]"><span className="mr-2 text-xs text-[#c5cea5]" aria-hidden="true">01</span>На метро</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/85">От станции «Комендантский проспект» около 12 минут пешком. Ищите вывеску «Играем?» над входом со двора.</p>
                </li>
                <li>
                  <h3 className="font-semibold text-[#d9dfbf]"><span className="mr-2 text-xs text-[#c5cea5]" aria-hidden="true">02</span>На машине или велосипеде</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/85">Заезд на гостевую парковку с Кортового переулка. Велопарковка находится справа от главного входа.</p>
                </li>
                <li>
                  <h3 className="font-semibold text-[#d9dfbf]"><span className="mr-2 text-xs text-[#c5cea5]" aria-hidden="true">03</span>Доступный вход</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/85">У входа со двора нет ступеней. Стойка администратора и раздевалки находятся на первом этаже.</p>
                </li>
              </ol>
            </section>
          </div>
        </main>
  </>;
}
