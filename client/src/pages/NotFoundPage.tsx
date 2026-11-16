import AppLink from "../components/AppLink";
import { FiArrowRight } from "react-icons/fi";
import PageHeading from "../components/PageHeading";
export default function NotFoundPage() {
  return <>
    <PageHeading eyebrow="Страница не найдена" title="Кажется, мы вышли за линию" description="По этому адресу нет страницы. Проверьте ссылку или вернитесь к выбору площадки." />
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 md:px-10 lg:px-16">
      <div className="rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-7 sm:p-10">
        <p aria-hidden="true" className="font-serif text-6xl text-[#879568]">404</p>
        <h2 className="mt-4 font-serif text-2xl">Продолжим на площадке?</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <AppLink href="/courts" className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-5 py-3 text-sm font-semibold text-white!">Выбрать площадку <FiArrowRight size={16} aria-hidden="true" /></AppLink>
          <AppLink href="/" className="rounded-full border border-[#b9c0ae] px-5 py-3 text-sm font-semibold hover:bg-[#e8eddf]">На главную</AppLink>
        </div>
      </div>
    </main>
  </>;
}
