import AppLink from "../AppLink";
import { useEffect, useState } from "react";
import { FiArrowUpRight, FiChevronLeft, FiChevronRight, FiEdit2, FiMapPin, FiRefreshCw, FiPlus, FiSearch, FiUsers, FiTrash2 } from "react-icons/fi";
import CourtFormDialog from "./CourtFormDialog";
import CourtDeleteDialog from "./CourtDeleteDialog";
import type { CourtDirectory, ManagedCourt } from "./types";

type Props = { onCourtSaved: () => void;sport:string;onSportChange:(sport:string)=>void };
export default function AdminCourts({ onCourtSaved,sport,onSportChange }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: number; data?: CourtDirectory; error?: string } | null>(null);
  const [search, setSearch] = useState("");
  const [requestedPage, setPage] = useState(1);
  const [editing, setEditing] = useState<ManagedCourt | null>(null);
  const [deleting,setDeleting]=useState<ManagedCourt|null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const result = snapshot?.key === refresh ? snapshot : null;
  const data = result?.data;
  const sportId = sport ? data?.sports.find(item=>item.name===sport)?.id ?? "" : "";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/courts", { credentials: "include", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (controller.signal.aborted) return;
        setSnapshot(response.ok ? { key: refresh, data: payload } : { key: refresh, error: payload.error || "Не удалось загрузить площадки." });
      })
      .catch(() => { if (!controller.signal.aborted) setSnapshot({ key: refresh, error: "Не удалось загрузить площадки. Попробуйте ещё раз." }); });
    return () => controller.abort();
  }, [refresh]);
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = (data?.courts ?? []).filter(court => (!sportId || court.sportId === sportId || court.sports?.some(sport=>sport.id===sportId)) && `${court.name} ${court.hall} ${court.sport} ${court.sports?.map(sport=>sport.name).join(" ") ?? ""}`.toLocaleLowerCase("ru-RU").includes(query));
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, totalPages])].filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b);
  function saved(court: ManagedCourt, created: boolean) {
    setRefresh(value=>value+1);
    setEditing(null);
    setCreating(false);
    if (created) { setSearch(court.name); onSportChange(court.sport); setPage(1); }
    setNotice(created ? `Площадка «${court.name}» создана и доступна для бронирования.` : `Изменения площадки «${court.name}» сохранены.`);
    onCourtSaved();
  }
  return (
    <main className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-5 md:px-10 lg:px-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-serif text-3xl">Площадки комплекса</h2><p className="mt-2 text-sm text-[#748074]">Фотографии, описание и характеристики залов</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!result} onClick={() => { setNotice(""); setRefresh(value => value + 1); }} className="inline-flex items-center gap-2 rounded-full border border-[#b9c0ae] bg-[#fcfaf4] px-4 py-2.5 text-sm font-semibold hover:bg-[#e8eddf] disabled:opacity-40"><FiRefreshCw size={16} aria-hidden="true" />Обновить</button>
          <button type="button" disabled={!data?.sports.length} onClick={() => { setNotice(""); setEditing(null); setCreating(true); }} className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#536b50] disabled:opacity-40"><FiPlus size={17} aria-hidden="true" />Добавить площадку</button>
        </div>
      </div>
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#e8eddf] p-4 text-sm text-[#405640]">{notice}</p>}
      {result?.error ? <div role="alert" className="mt-5 rounded-2xl border border-[#decbb5] bg-[#faf2e8] p-5 text-sm text-[#754d32]"><p>{result.error}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 font-semibold underline">Повторить загрузку</button></div>
        : !data ? <p role="status" className="py-8 text-sm text-[#536354]">Загружаем площадки…</p> : <>
          <div className="mt-5 grid gap-4 rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#536354]">Вид спорта<select value={sportId} onChange={event => { onSportChange(data.sports.find(item=>item.id===event.target.value)?.name ?? ""); setPage(1); }} className="mt-1.5 h-12 w-full rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm text-[#203126]"><option value="">Все виды спорта</option>{data.sports.map(sport => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-[#536354]">Поиск площадки<span className="relative mt-1.5 block"><FiSearch size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7e8c62]" aria-hidden="true" /><input type="search" placeholder="Название или зал" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="h-12 w-full rounded-xl border border-[#cdd2c3] bg-white pl-10 pr-3 text-sm text-[#203126]" /></span></label>
          </div>
          <p role="status" className="mt-4 text-xs text-[#748074]">{filtered.length ? `Площадки ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} из ${filtered.length}` : "Площадки не найдены"}</p>
          {!filtered.length ? <div className="mt-3 rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-8 text-center"><p className="text-sm text-[#536354]">Попробуйте изменить поиск или выбрать другой вид спорта.</p><button type="button" onClick={() => { onSportChange(""); setSearch(""); setPage(1); }} className="mt-4 rounded-full border border-[#b9c0ae] px-5 py-2.5 text-sm font-semibold hover:bg-[#e8eddf]">Сбросить фильтры</button></div> : <ul className="mt-3 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice((page - 1) * pageSize, page * pageSize).map(court => <li key={court.id} className="overflow-hidden rounded-3xl border border-[#d8dbce] bg-[#fcfaf4]">
              <div className="relative"><img src={court.image} alt={`${court.sport} — ${court.name}`} loading="lazy" className="h-40 w-full object-cover" /><span className="absolute left-3 top-3 rounded-full bg-[#fcfaf4] px-3 py-1.5 text-xs font-semibold text-[#405640]">{court.kind==='whole'?'Универсальный зал':court.sport}</span></div>
              <div className="p-5"><h3 className="text-lg font-semibold">{court.name}</h3>{(court.sports?.length ?? 0)>1 && <p className="mt-2 text-xs leading-relaxed text-[#536354]">{court.sports?.map(sport=>sport.name).join(" · ")} · Общее расписание</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs text-[#748074]"><span className="inline-flex items-center gap-1.5"><FiMapPin aria-hidden="true" />{court.hall}</span><span className="inline-flex items-center gap-1.5"><FiUsers aria-hidden="true" />{court.minPlayers}–{court.capacity} игроков</span></div><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#536354]">{court.description}</p><p className="mt-3 text-xs text-[#748074]">{court.dimensions} · {court.surface}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#dedfd2] pt-4"><button type="button" onClick={() => { setNotice(""); setEditing(court); }} className="inline-flex items-center gap-2 rounded-full bg-[#293d30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#536b50]"><FiEdit2 size={14} aria-hidden="true" />Редактировать</button><button type="button" onClick={()=>setDeleting(court)} className="inline-flex items-center gap-1.5 rounded-full border border-[#d6b5a9] px-3 py-2.5 text-xs font-semibold text-[#934e3f] hover:bg-[#faf0e9]"><FiTrash2 size={14} aria-hidden="true"/>Удалить</button><AppLink href={`/courts/${court.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#536354] underline! underline-offset-4">На сайте<FiArrowUpRight size={15} aria-hidden="true" /></AppLink></div></div>
            </li>)}
          </ul>}
          {totalPages > 1 && <nav aria-label="Страницы площадок" className="mt-6 flex flex-wrap items-center justify-center gap-1.5"><button type="button" aria-label="Предыдущая страница площадок" disabled={page === 1} onClick={() => setPage(page - 1)} className="grid size-10 place-items-center rounded-xl border border-[#b9c0ae] disabled:opacity-35"><FiChevronLeft aria-hidden="true" /></button>{pageNumbers.map((number, index) => <span key={number} className="inline-flex items-center gap-1.5">{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<button type="button" aria-label={`Страница площадок ${number}`} aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)} className={`grid size-10 place-items-center rounded-xl border border-[#b9c0ae] text-sm font-semibold ${page === number ? "bg-[#293d30] text-white" : "hover:bg-[#e8eddf]"}`}>{number}</button></span>)}<button type="button" aria-label="Следующая страница площадок" disabled={page === totalPages} onClick={() => setPage(page + 1)} className="grid size-10 place-items-center rounded-xl border border-[#b9c0ae] disabled:opacity-35"><FiChevronRight aria-hidden="true" /></button></nav>}
          {deleting&&<CourtDeleteDialog court={deleting} onClose={()=>{setDeleting(null);setRefresh(value=>value+1);onCourtSaved();}} onDeleted={()=>{setNotice(`Площадка «${deleting.name}» удалена. История бронирований сохранена.`);setDeleting(null);setRefresh(value=>value+1);onCourtSaved();}}/>}
          {(editing || creating) && <CourtFormDialog key={editing?.id ?? "new"} court={editing} directory={data} initialSportId={sportId} onClose={() => { setEditing(null); setCreating(false); }} onSaved={saved} />}
        </>}
    </main>
  );
}
