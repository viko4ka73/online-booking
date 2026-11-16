import EmailInput from "./EmailInput";
import { useState, type FormEvent } from "react";
import { FiArrowRight, FiLock, FiMail, FiUser, FiX } from "react-icons/fi";

import type { AuthUser, AuthDialogMode } from "../lib/auth";

type Props = {
  mode: AuthDialogMode;
  onClose: () => void;
  onModeChange: (mode: "login" | "register") => void;
  onAuthenticated: (user: AuthUser) => void;
};

export default function AuthDialog({ mode, onClose, onModeChange, onAuthenticated }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Не удалось выполнить запрос.");
      onAuthenticated(payload.user as AuthUser);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось связаться с сервером.");
    } finally {
      setPending(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#152219]/70 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative w-full max-w-[460px] overflow-hidden rounded-[24px] bg-[#f8f6ee] text-[#1f3025] shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-[#879568]" />
        <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute right-5 top-5 rounded-full p-2 text-[#607064] transition hover:bg-[#e8e8dd] hover:text-[#1f3025]">
          <FiX size={20} />
        </button>

        <div className="px-7 pb-8 pt-9 sm:px-9">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7d8b61]">Играем? · личный кабинет</p>

              <h2 id="auth-title" className="mt-3 font-display text-3xl font-bold tracking-[-0.04em]">
                {isRegister ? "Создать аккаунт" : "С возвращением"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#748074]">
                {isRegister ? "Зарегистрируйтесь, чтобы управлять своими визитами в спорткомплекс." : "Войдите в аккаунт, чтобы открыть личный кабинет."}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {isRegister && (
                  <label className="block text-sm font-medium">
                    Имя и фамилия
                    <span className="relative mt-1.5 block">
                      <FiUser size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" />
                      <input value={name} onChange={(event) => setName(event.target.value)} name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Например, Анна Иванова" className="w-full rounded-xl border border-[#d8dbce] bg-white px-4 py-3 pl-11 text-sm outline-none transition placeholder:text-[#a0a69a] focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" />
                    </span>
                  </label>
                )}
                <label className="block text-sm font-medium">
                  Электронная почта
                  <span className="relative mt-1.5 block">
                    <FiMail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" />
                    <EmailInput value={email} onValueChange={setEmail} name="email" autoComplete="email" required maxLength={254} placeholder="name@example.com" className="w-full rounded-xl border border-[#d8dbce] bg-white px-4 py-3 pl-11 text-sm outline-none transition placeholder:text-[#a0a69a] focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" />
                  </span>
                </label>
                <label className="block text-sm font-medium">
                  Пароль
                  <span className="relative mt-1.5 block">
                    <FiLock size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#829078]" />
                    <input value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 8 : 1} maxLength={72} placeholder={isRegister ? "Не менее 8 символов" : "Введите пароль"} className="w-full rounded-xl border border-[#d8dbce] bg-white px-4 py-3 pl-11 text-sm outline-none transition placeholder:text-[#a0a69a] focus:border-[#7b895d] focus:ring-2 focus:ring-[#879568]/20" />
                  </span>
                </label>

                {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-3 rounded-full bg-[#293d30] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#536b50] disabled:cursor-wait disabled:opacity-60">
                  {pending ? "Подождите…" : isRegister ? "Зарегистрироваться" : "Войти"}
                  {!pending && <FiArrowRight size={18} />}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-[#748074]">
                {isRegister ? "Уже есть аккаунт?" : "Впервые у нас?"}{" "}
                <button type="button" onClick={() => onModeChange(isRegister ? "login" : "register")} className="font-semibold text-[#455a43] underline decoration-[#aeb99a] underline-offset-4 hover:text-[#293d30]">
                  {isRegister ? "Войти" : "Создать аккаунт"}
                </button>
              </p>
        </div>
      </section>
    </div>
  );
}
