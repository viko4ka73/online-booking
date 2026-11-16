import { useEffect, useState } from "react";
import { FiBell, FiMail } from "react-icons/fi";

type Settings = { email:string; remindersEnabled:boolean; deliveryConfigured:boolean };
export default function EmailPreferences({ email }: { email:string }) {
  const [settings,setSettings] = useState<Settings | null>(null);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [saved,setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications/settings", { credentials:"include",signal:controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить настройки писем.");
        if (!controller.signal.aborted) { setSettings(data); setError(""); }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки писем."); });
    return () => controller.abort();
  }, [email,refresh]);
  async function toggle() {
    if (!settings || pending) return;
    setPending(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/notifications/settings", { method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({remindersEnabled:!settings.remindersEnabled}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить настройки.");
      setSettings(data); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки."); }
    finally { setPending(false); }
  }
  return (
    <section aria-labelledby="email-preferences-title" className="mt-6 rounded-2xl border border-[#d8dbce] bg-[#f2f4ea] p-4">
      <h3 id="email-preferences-title" className="flex items-center gap-2 text-sm font-semibold"><FiMail size={17} aria-hidden="true" />Письма о ваших играх</h3>
      <p className="mt-2 break-all text-sm font-semibold">{email}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#536354]">Подтверждение, отмена и перенос бронирования приходят на эту почту. Изменить адрес можно в данных профиля — он также используется для входа.</p>
      {settings ? <>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#d8dbce] pt-3">
          <div><p className="flex items-center gap-2 text-sm font-semibold"><FiBell size={16} aria-hidden="true" />Напоминать об игре</p><p className="mt-1 text-xs text-[#536354]">За 24 часа до начала</p></div>
          <button type="button" role="switch" aria-checked={settings.remindersEnabled} aria-label="Напоминания об игре по почте" disabled={pending} onClick={() => void toggle()}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${settings.remindersEnabled ? "border-[#293d30] bg-[#293d30]" : "border-[#bbc4ae] bg-[#d8ddcf]"}`}>
            <span aria-hidden="true" className={`size-5 rounded-full bg-white shadow-sm transition-transform ${settings.remindersEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#536354]">Если до игры меньше суток, отдельное напоминание не отправляется. Письма об изменениях брони приходят независимо от этого переключателя.</p>
        {!settings.deliveryConfigured && <p role="status" className="mt-3 rounded-xl bg-[#f3eddb] p-3 text-xs leading-relaxed text-[#705b32]">Почта комплекса пока не подключена. Настройки сохраняются, но письма ещё не отправляются.</p>}
      </> : !error ? <p role="status" className="mt-3 text-xs">Загружаем настройки…</p> : null}
      {saved && <p role="status" className="mt-3 text-xs text-[#405640]">Настройка напоминаний сохранена.</p>}
      {error && <div role="alert" className="mt-3 text-xs text-red-800"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value+1)} className="mt-2 underline">Обновить настройки</button></div>}
    </section>
  );
}
