import AppLink from "./AppLink";
import { useState } from "react";
import { FiHeart, FiMenu, FiX } from "react-icons/fi";

type HeaderProps = {
  pathname: string;
  isSignedIn: boolean;
  onAuth?: (mode: "login" | "register") => void;
  onAccount?: () => void;
  isHome?: boolean;
};

export function SiteHeader({ pathname, isSignedIn, onAuth, onAccount, isHome = false }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const openAccount = () => {
    if (pathname !== "/account") onAccount?.();
  };
  const isCatalog = pathname === "/courts" || (pathname.startsWith("/courts/") || pathname.startsWith("/halls/"));
  const isAbout = pathname === "/about";
  const isContacts = pathname === "/contacts";
  const isPrices = pathname === "/prices";
  const activeNavStyle = "relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#d9dfbf]";

  return (
    <header className={!isHome ? "relative z-30 border-b border-white/15 bg-[#203126] text-white" : "absolute inset-x-0 top-0 z-30 border-b border-white/15 text-white"}>
      <div className="mx-auto flex h-[82px] max-w-[1440px] items-center justify-between gap-6 px-5 md:px-10">
        <AppLink href={isHome ? "#top" : "/"} className="flex shrink-0 items-center gap-2.5" aria-label="Играем? — главная">
          <img src="/igraem-logo.svg" alt="" width={148} height={50} className="w-[124px] shrink-0 md:w-[148px]" />
        </AppLink>

        <nav className="hidden items-center gap-3 text-[14px] font-medium lg:flex xl:gap-8 xl:text-[15px]">
          <AppLink href={isHome ? "#top" : "/"} aria-current={isHome ? "page" : undefined} className={`py-2 ${isHome ? activeNavStyle : "transition hover:text-[#d4ddb0]"}`}>Главная</AppLink>
          <AppLink href="/courts" aria-current={isCatalog ? "page" : undefined} className={`py-2 ${isCatalog ? activeNavStyle : "transition hover:text-[#d4ddb0]"}`}>Площадки</AppLink>
          <AppLink href="/prices" aria-current={isPrices ? "page" : undefined} className={`py-2 ${isPrices ? activeNavStyle : "transition hover:text-[#d4ddb0]"}`}>Прайс</AppLink>
          <AppLink href="/about" aria-current={isAbout ? "page" : undefined} className={`py-2 ${isAbout ? activeNavStyle : "transition hover:text-[#d4ddb0]"}`}>О центре</AppLink>
          <AppLink href="/contacts" aria-current={isContacts ? "page" : undefined} className={`py-2 ${isContacts ? activeNavStyle : "transition hover:text-[#d4ddb0]"}`}>Контакты</AppLink>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          {isSignedIn ? (
            <button type="button" onClick={openAccount} aria-current={pathname === "/account" ? "page" : undefined} className="rounded-full bg-[#69774b] px-6 py-2.5 text-sm transition hover:bg-[#81905d]">Личный кабинет</button>
          ) : (
            <>
              <button type="button" onClick={() => onAuth?.("login")} className="rounded-full border border-white/80 px-6 py-2.5 text-sm transition hover:bg-white hover:text-[#1f3025]">Войти</button>
              <button type="button" onClick={() => onAuth?.("register")} className="rounded-full bg-[#69774b] px-6 py-2.5 text-sm transition hover:bg-[#81905d]">Регистрация</button>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-full p-2 lg:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <FiX size={26} /> : <FiMenu size={26} />}
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-5 bg-[#1f3025] px-7 py-6 text-white lg:hidden">
          <AppLink href={isHome ? "#top" : "/"} onClick={closeMenu}>Главная</AppLink>
          <AppLink href="/courts" onClick={closeMenu} aria-current={isCatalog ? "page" : undefined} className={isCatalog ? "underline! decoration-[#d9dfbf] underline-offset-4" : undefined}>Площадки</AppLink>
          <AppLink href="/prices" onClick={closeMenu} aria-current={isPrices ? "page" : undefined} className={isPrices ? "underline! decoration-[#d9dfbf] underline-offset-4" : undefined}>Прайс</AppLink>
          <AppLink href="/about" onClick={closeMenu} aria-current={isAbout ? "page" : undefined} className={isAbout ? "underline! decoration-[#d9dfbf] underline-offset-4" : undefined}>О центре</AppLink>
          <AppLink href="/contacts" onClick={closeMenu} aria-current={isContacts ? "page" : undefined} className={isContacts ? "underline! decoration-[#d9dfbf] underline-offset-4" : undefined}>Контакты</AppLink>
          <div className="flex flex-wrap gap-3 pt-1">
            {isSignedIn ? (
              <button type="button" onClick={() => { closeMenu(); openAccount(); }} aria-current={pathname === "/account" ? "page" : undefined} className="rounded-full bg-[#69774b] px-5 py-2">Личный кабинет</button>
            ) : (
              <>
                <button type="button" onClick={() => { closeMenu(); onAuth?.("login"); }} className="rounded-full border border-white/70 px-5 py-2">Войти</button>
                <button type="button" onClick={() => { closeMenu(); onAuth?.("register"); }} className="rounded-full bg-[#69774b] px-5 py-2">Регистрация</button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter({ isHome = false }: { isHome?: boolean }) {
  return (
    <footer id="contacts" className="mt-auto bg-[#203126] px-5 py-6 text-white md:px-10 lg:px-16">
    <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-5 md:flex-row">
      <AppLink href={isHome ? "#top" : "/"} className="flex shrink-0 items-center gap-2.5 text-[19px] font-semibold tracking-[-0.04em] md:text-[21px]">
        <img src="/igraem-logo.svg" alt="Играем?" width={120} height={41} className="shrink-0" />
      </AppLink>
      <div className="hidden h-9 w-px bg-white/25 xl:block" />
      <nav className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-[14px] text-white/90">
        <AppLink href={isHome ? "#top" : "/"} className="hover:text-[#d4ddb0]">Главная</AppLink>
        <AppLink href="/courts" className="hover:text-[#d4ddb0]">Площадки</AppLink>
        <AppLink href="/prices" className="hover:text-[#d4ddb0]">Прайс</AppLink>
        <AppLink href="/about" className="hover:text-[#d4ddb0]">О центре</AppLink>
        <AppLink href="/contacts" className="hover:text-[#d4ddb0]">Контакты</AppLink>
      </nav>
      <div className="flex items-center gap-3 text-[13px] text-white/90">
        Будь в движении вместе с нами! <FiHeart size={23} strokeWidth={1.4} />
      </div>
    </div>
  </footer>
  );
}
