import AppLink from "../components/AppLink";
import EmailInput from "../components/EmailInput";
import PhoneInput from "../components/PhoneInput";
import EmailPreferences from "../components/EmailPreferences";
import FavoriteCourts from "../components/FavoriteCourts";
import type { FavoritesState, FavoriteCourt } from "../lib/favorites";
import MyBookings from "../components/MyBookings";
import { SiteHeader, SiteFooter } from "../components/SiteLayout";
import { lazy,Suspense,useState, type FormEvent } from "react";
import { FiCalendar, FiCamera, FiEdit2, FiLogOut, FiMail, FiPhone, FiShield, FiUser, FiX } from "react-icons/fi";
import type { AuthUser } from "../lib/auth";

const WaitlistSection=lazy(()=>import("../components/WaitlistSection"));

type Props = {
  favorites: FavoritesState;
  courts: FavoriteCourt[];
  catalogLoading: boolean;
  catalogError: string;
  onCatalogRetry: () => void;
  user: AuthUser;
  onAuthenticated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onHome: () => void;
};

export default function AccountPage({ user, onAuthenticated, onLogout, onHome, favorites, courts, catalogLoading, catalogError, onCatalogRetry }: Props) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editEmail, setEditEmail] = useState(user?.email ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");
  const [editBirthDate, setEditBirthDate] = useState(user?.birthDate ?? "");
  const [editProfilePhoto, setEditProfilePhoto] = useState<string | null>(user?.profilePhoto ?? null);
  const [saved, setSaved] = useState(false);

  async function logout() {
    setPending(true);
    setError("");
    try {
      await onLogout();
      onHome();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось завершить сеанс.");
    } finally {
      setPending(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setPending(true);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone, birthDate: editBirthDate, profilePhoto: editProfilePhoto }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить изменения.");
      onAuthenticated(payload.user as AuthUser);
      setEditingProfile(false);
      setSaved(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось связаться с сервером.");
    } finally {
      setPending(false);
    }
  }

  const registrationDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(user.createdAt));

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Выберите фото в формате JPG, PNG или WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Размер фотографии не должен превышать 2 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditProfilePhoto(reader.result);
        setError("");
      }
    };
    reader.onerror = () => setError("Не удалось прочитать файл фотографии.");
    reader.readAsDataURL(file);
  }

  function startEditingProfile() {
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPhone(user.phone ?? "");
    setEditBirthDate(user.birthDate ?? "");
    setEditProfilePhoto(user.profilePhoto ?? null);
    setError("");
    setSaved(false);
    setEditingProfile(true);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f5ec] text-[#1f3025]">
      <SiteHeader pathname="/account" isSignedIn />

      <div className="border-b border-[#dedfd2] bg-[#f3f1e7]">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-9 md:px-10 md:py-12 lg:px-16">
          <div className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#526543]">
            <span aria-hidden="true" className="h-px w-8 bg-[#81905d]" />
            Мой профиль
          </div>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">Личный кабинет</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#536354] sm:text-base">Данные профиля, ваши бронирования и любимые площадки.</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-12 lg:px-16">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="order-2 grid min-w-0 gap-5 lg:order-1">
            {user.role === "admin" && <AppLink href="/admin" className="flex items-center justify-between gap-3 rounded-2xl border border-[#b9c0ae] bg-[#e8eddf] p-5 text-sm font-semibold text-[#293d30] transition hover:bg-[#d9dfbf]"><span className="inline-flex items-center gap-2"><FiShield size={19} aria-hidden="true" />Панель администратора</span><span aria-hidden="true">→</span></AppLink>}
            <section className="min-w-0 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-6 sm:p-9">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#526543]">Личные данные</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#293d30] text-xl font-semibold text-white">
                    {user.profilePhoto ? <img src={user.profilePhoto} alt="Фото профиля" className="h-full w-full rounded-full object-cover" /> : user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">{user.name}</h2>
                    <p className="truncate text-sm text-[#748074]">{user.email}</p>
                  </div>
                </div>
                {!editingProfile && <button type="button" onClick={startEditingProfile} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#b9c0ae] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#f2f3eb]"><FiEdit2 size={15} /> Изменить</button>}
              </div>
              {editingProfile ? (
                <form onSubmit={saveProfile} className="mt-6 space-y-4">
                  <div>
                    <span className="text-sm font-medium">Фотография профиля</span>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#293d30] text-lg font-semibold text-white">
                        {editProfilePhoto ? <img src={editProfilePhoto} alt="Предпросмотр фотографии" className="h-full w-full object-cover" /> : user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#b9c0ae] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#f2f3eb]"><FiCamera size={16} /> Выбрать фото<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} /></label>
                      {editProfilePhoto && <button type="button" onClick={() => setEditProfilePhoto(null)} className="text-sm font-medium text-[#6d7964] underline underline-offset-4">Удалить фото</button>}
                    </div>
                    <p className="mt-2 text-xs text-[#7b8578]">JPG, PNG или WebP · до 2 МБ</p>
                  </div>
                  <label className="block text-sm font-medium">Имя и фамилия<span className="relative mt-1.5 block"><FiUser size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" /><input value={editName} onChange={(event) => setEditName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" className="w-full rounded-xl border border-[#d8dbce] bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" /></span></label>
                  <label className="block text-sm font-medium">Электронная почта<span className="relative mt-1.5 block"><FiMail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" /><EmailInput value={editEmail} onValueChange={setEditEmail} required maxLength={254} autoComplete="email" className="w-full rounded-xl border border-[#d8dbce] bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" /></span></label>
                  <label className="block text-sm font-medium">Номер телефона<span className="relative mt-1.5 block"><FiPhone size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" /><PhoneInput value={editPhone} onValueChange={setEditPhone} autoComplete="tel" className="w-full rounded-xl border border-[#d8dbce] bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" /></span></label>
                  <label className="block text-sm font-medium">Дата рождения<input value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full rounded-xl border border-[#d8dbce] bg-white px-4 py-3 text-sm outline-none focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" /></label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button type="submit" disabled={pending} className="rounded-full bg-[#d9dfbf] px-5 py-2.5 text-sm font-semibold text-[#203126]! transition hover:bg-[#eef1dd] disabled:opacity-60">{pending ? "Сохраняем…" : "Сохранить"}</button>
                    <button type="button" disabled={pending} onClick={() => { setEditingProfile(false); setError(""); }} className="inline-flex items-center gap-2 rounded-full border border-[#b9c0ae] px-5 py-2.5 text-sm font-semibold transition hover:bg-[#f2f3eb] disabled:opacity-60"><FiX size={16} /> Отмена</button>
                  </div>
                </form>
              ) : (
                <dl className="mt-7 divide-y divide-[#e8e7df] text-sm">
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-4"><dt className="text-[#748074]">Электронная почта</dt><dd className="min-w-0 break-all font-medium">{user.email}</dd></div>
                  <div className="flex justify-between gap-4 py-4"><dt className="text-[#748074]">Телефон</dt><dd className="text-right font-medium">{user.phone || "Не указан"}</dd></div>
                  <div className="flex justify-between gap-4 py-4"><dt className="text-[#748074]">Дата рождения</dt><dd className="font-medium">{user.birthDate ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${user.birthDate}T00:00:00Z`)) : "Не указана"}</dd></div>
                  <div className="flex justify-between gap-4 py-4"><dt className="text-[#748074]">Дата регистрации</dt><dd className="font-medium">{registrationDate}</dd></div>
                </dl>
              )}
              {saved && <p role="status" className="mt-4 rounded-xl bg-[#eef3e7] px-4 py-3 text-sm text-[#40523a]">Данные профиля сохранены.</p>}
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <EmailPreferences email={user.email} />
              <button type="button" onClick={logout} disabled={pending} className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#b9c0ae] px-5 py-3 text-sm font-semibold transition hover:bg-[#f2f3eb] disabled:opacity-60">
                <FiLogOut size={17} /> {pending ? "Подождите…" : "Выйти из аккаунта"}
              </button>
            </section>
            <FavoriteCourts favorites={favorites} courts={courts} catalogLoading={catalogLoading} catalogError={catalogError} onCatalogRetry={onCatalogRetry} />
            </div>

            <div className="order-1 grid min-w-0 gap-5 lg:order-2">
            <section id="my-bookings" className="min-w-0 scroll-mt-5 rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-5 sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-3xl">Мои бронирования</h2>
                  <p className="mt-1 text-sm text-[#748074]">Предстоящие игры и история посещений</p>
                </div>
                <AppLink href="#waitlist" className="text-xs font-semibold text-[#536354] underline! underline-offset-4">Лист ожидания</AppLink>
                <FiCalendar className="hidden text-[#7e8c62] sm:block" size={30} strokeWidth={1.5} />
              </div>
              <MyBookings />
            </section>
            <Suspense fallback={<p role="status" className="p-5 text-sm">Загружаем лист ожидания…</p>}><WaitlistSection/></Suspense>
            </div>
          </div>
      </div>
      <SiteFooter />
    </main>
  );
}
