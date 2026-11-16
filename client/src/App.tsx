import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import RouteScroll from "./components/RouteScroll";
import { lazy,Suspense,useEffect,useState } from "react";
import AuthDialog from "./components/AuthDialog";
import { SiteHeader,SiteFooter } from "./components/SiteLayout";
import type { AuthDialogMode,AuthUser } from "./lib/auth";
import type { CatalogState,Court } from "./lib/catalog";
import { useFavorites } from "./lib/favorites";
import HomePage from "./pages/HomePage";
import CourtsPage from "./pages/CourtsPage";
import CourtPage from "./pages/CourtPage";
import AccountPage from "./pages/AccountPage";
import PricesPage from "./pages/PricesPage";
import AboutPage from "./pages/AboutPage";
import ContactsPage from "./pages/ContactsPage";
import NotFoundPage from "./pages/NotFoundPage";
const AdminPage=lazy(()=>import("./pages/AdminPage"));
import CatalogStatus from "./components/CatalogStatus";
import {legacyHallTarget} from "./lib/catalog";

function LegacyHall({catalog}: {catalog:CatalogState}) {
  const {hallId=''}=useParams();const {search}=useLocation();
  return catalog.loading||catalog.error
    ? <main className="mx-auto w-full max-w-[1440px] px-5 py-10"><CatalogStatus catalog={catalog}/></main>
    : <Navigate replace to={legacyHallTarget(catalog.courts,hallId,search)}/>;
}
function CourtRoute(props:Omit<React.ComponentProps<typeof CourtPage>,'courtId'|'detailSport'>) {
  const {courtId=''}=useParams();const location=useLocation();
  return <CourtPage key={location.pathname+location.search} {...props} courtId={courtId} detailSport={new URLSearchParams(location.search).get('sport')}/>;
}

function App() {
  const location=useLocation();const navigate=useNavigate();
  const pathname=location.pathname.replace(/\/+$/, "")||"/";
  const [courts, setCourts] = useState<Court[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/courts", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) { setCourts(payload.courts); setCatalogError(""); }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogError("Не удалось загрузить площадки.");
      })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [catalogRefresh]);
  const [authMode, setAuthMode] = useState<AuthDialogMode | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const favorites = useFavorites(user?.id);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось проверить сеанс.");
        return response.json();
      })
      .then((payload: { user: AuthUser | null }) => {
        if (!active) return;
        setUser(payload.user);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
      })
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  function retryCatalog() {
    setCatalogError(""); setCatalogLoading(true); setCatalogRefresh(value => value+1);
  }
  async function handleLogout() {
    const response = await fetch("/api/auth/logout",{method:"POST",credentials:"include"});
    if (!response.ok) throw new Error("Не удалось завершить сеанс. Попробуйте ещё раз.");
    setUser(null); setAuthMode(null);
  }
  const catalog: CatalogState = {courts,loading:catalogLoading,error:catalogError,onRetry:retryCatalog};
  const openLogin = () => setAuthMode("login");
  const isHome=pathname==='/';
  const sport=new URLSearchParams(location.search).get('sport');
  const shownAuthMode=authMode ?? (location.state?.authMode as AuthDialogMode|undefined);
  function closeAuth(){setAuthMode(null);if(location.state?.authMode)navigate(location.pathname+location.search+location.hash,{replace:true,state:null});}
  const header=<SiteHeader pathname={pathname} isHome={isHome} isSignedIn={Boolean(user)} onAuth={setAuthMode} onAccount={()=>navigate('/account')}/>;
  return <>
    <RouteScroll/>
    <Routes>
      <Route path="/account" element={user
        ? <AccountPage user={user} onAuthenticated={setUser} onLogout={handleLogout} onHome={()=>navigate('/')} favorites={favorites} courts={courts} catalogLoading={catalogLoading} catalogError={catalogError} onCatalogRetry={retryCatalog}/>
        : authReady ? <Navigate replace to="/" state={{authMode:new URLSearchParams(location.search).get('mode')==='register'?'register':'login'}}/>
        : <main className="flex min-h-screen items-center justify-center bg-[#f7f5ec] text-[#536b50]" role="status">Загружаем личный кабинет…</main>}/>
      <Route path="*" element={<div id="top" className="flex min-h-screen flex-col overflow-hidden bg-[#f7f5ec] text-[#1f3025]">
        {!isHome&&header}
        <Routes>
          <Route path="/" element={<HomePage header={header} catalog={catalog} favorites={favorites} onLogin={openLogin}/>}/>
          <Route path="/courts" element={<CourtsPage key={sport} catalog={catalog} favorites={favorites} onLogin={openLogin} selectedSport={sport}/>}/>
          <Route path="/courts/:courtId" element={<CourtRoute catalog={catalog} favorites={favorites} signedIn={Boolean(user)} onLogin={openLogin} onBookingLogin={()=>{setUser(null);openLogin();}}/>}/>
          <Route path="/halls/:hallId" element={<LegacyHall catalog={catalog}/>}/>
          <Route path="/admin" element={<Suspense fallback={<p role="status" className="p-8 text-sm">Загружаем панель администратора…</p>}><AdminPage user={user} authReady={authReady} onLogin={openLogin} onCourtSaved={retryCatalog}/></Suspense>}/>
          <Route path="/prices" element={<PricesPage key={location.search}/>}/>
          <Route path="/about" element={<AboutPage/>}/>
          <Route path="/contacts" element={<ContactsPage/>}/>
          <Route path="*" element={<NotFoundPage/>}/>
        </Routes>
        <SiteFooter isHome={isHome}/>
      </div>}/>
    </Routes>
    {shownAuthMode&&<AuthDialog mode={shownAuthMode} onClose={closeAuth} onModeChange={setAuthMode} onAuthenticated={authenticatedUser=>{
      setUser(authenticatedUser);closeAuth();
      if(pathname==='/admin')navigate(authenticatedUser.role==='admin'?'/admin':'/account');
      else if(!pathname.startsWith('/courts/')&&!pathname.startsWith('/halls/'))navigate('/account');
    }}/>}
  </>;
}
export default App;
