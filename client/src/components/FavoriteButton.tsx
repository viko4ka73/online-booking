import { FiHeart } from "react-icons/fi";
import type { FavoritesState } from "../lib/favorites";

type Props = { courtId: number; courtName: string; favorites: FavoritesState; onLogin?: () => void; compact?: boolean };

export default function FavoriteButton({ courtId,courtName,favorites,onLogin,compact = false }: Props) {
  const selected = favorites.ids.includes(courtId);
  const pending = favorites.isPending(courtId);
  const label = `${selected ? "Убрать из избранного" : "Добавить в избранное"}: ${courtName}`;
  return (
    <button type="button" aria-pressed={selected} aria-label={label} title={favorites.signedIn ? label : "Войдите, чтобы сохранить площадку"}
      disabled={favorites.signedIn && (!favorites.ready || pending)}
      onClick={() => { if (!favorites.signedIn) onLogin?.(); else void favorites.toggle(courtId); }}
      className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-2 border border-[#d8dbce] bg-[#fcfaf4] text-[#405640] shadow-sm transition hover:border-[#879568] hover:bg-[#e8eddf] disabled:cursor-wait disabled:opacity-50 ${compact ? "size-10 rounded-full" : "rounded-full px-4 py-2.5 text-xs font-semibold"}`}>
      <FiHeart size={18} fill={selected ? "currentColor" : "none"} aria-hidden="true" />
      {!compact && <span>{pending ? "Сохраняем…" : selected ? "В избранном" : "В избранное"}</span>}
    </button>
  );
}

export function FavoritesFeedback({ favorites }: { favorites: FavoritesState }) {
  if (!favorites.error) return null;
  return (
    <div role="alert" className="my-3 rounded-xl border border-[#decbb5] bg-[#faf2e8] p-3 text-sm text-[#754d32]">
      <p>{favorites.error}</p>
      <button type="button" onClick={favorites.retry} className="mt-2 font-semibold underline underline-offset-4">Обновить избранное</button>
    </div>
  );
}
