import AppLink from "../components/AppLink";
import { FiLock } from "react-icons/fi";
import type { AuthUser } from "../lib/auth";
import PageHeading from "../components/PageHeading";
import AdminWorkspace from "../components/admin/AdminWorkspace";

type Props = {user:AuthUser|null;authReady:boolean;onLogin:()=>void;onCourtSaved:()=>void};
export default function AdminPage({user,authReady,onLogin,onCourtSaved}:Props) {
  if (!authReady) return <main role="status" className="mx-auto w-full max-w-[1440px] px-5 py-12 text-sm">Проверяем доступ к панели…</main>;
  if (!user || user.role!=="admin") return <>
    <PageHeading eyebrow="Панель администратора" title={user ? "Доступ ограничен" : "Вход для администратора"} description="Этот раздел предназначен для сотрудников спортивного комплекса." />
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 md:px-10 lg:px-16"><div className="rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-7 sm:p-10"><FiLock size={30} className="text-[#7e8c62]" aria-hidden="true" /><p className="mt-4 max-w-lg text-sm leading-relaxed text-[#536354]">{user ? "У вашего аккаунта нет прав администратора. Вы можете продолжить пользоваться личным кабинетом и бронировать площадки." : "Войдите в аккаунт, которому назначены права администратора."}</p>{user ? <AppLink href="/account" className="mt-5 inline-block rounded-full bg-[#293d30] px-5 py-3 text-sm font-semibold text-white!">Личный кабинет</AppLink> : <button type="button" onClick={onLogin} className="mt-5 rounded-full bg-[#293d30] px-5 py-3 text-sm font-semibold text-white">Войти</button>}</div></main>
  </>;
  return <>
    <PageHeading
      eyebrow="Управление комплексом"
      title="Панель администратора"
      description="Расписание площадок, записи пользователей и сведения о бронированиях."
    />
    <AdminWorkspace key={user.id} userId={user.id} onCourtSaved={onCourtSaved} />
  </>;
}
