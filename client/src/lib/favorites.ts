import { useEffect, useRef, useState } from "react";

type Snapshot = { userId: string; ids: number[]; error: string; ready: boolean };
export type FavoritesState = ReturnType<typeof useFavorites>;
export type FavoriteCourt = { id: number; name: string; sport: string; hall: string; image: string; hourlyRate: number };

export function useFavorites(userId?: string) {
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null);
  const [refresh,setRefresh] = useState(0);
  const [pending,setPending] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const session = useRef(userId);
  useEffect(() => { session.current = userId; }, [userId]);
  const current = snapshot?.userId === userId ? snapshot : null;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetch("/api/favorites", { credentials: "include", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить избранные площадки.");
        if (!controller.signal.aborted) setSnapshot({ userId, ids: data.courtIds, ready: true, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSnapshot({ userId, ids: [], ready: false, error: error instanceof Error ? error.message : "Не удалось загрузить избранные площадки." });
      });
    return () => controller.abort();
  }, [userId,refresh]);

  async function toggle(courtId: number) {
    if (!userId || !current?.ready) return;
    const key = `${userId}:${courtId}`;
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setPending(values => [...values,key]);
    const remove = current.ids.includes(courtId);
    try {
      const response = await fetch(`/api/favorites/${courtId}`, { method: remove ? "DELETE" : "PUT", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить избранное.");
      if (session.current !== userId) return;
      setSnapshot(previous => previous?.userId !== userId ? previous : {
        ...previous, error: "", ids: remove ? previous.ids.filter(id => id !== courtId) : [...new Set([courtId,...previous.ids])],
      });
    } catch (error: unknown) {
      if (session.current === userId) setSnapshot(previous => previous?.userId !== userId ? previous : {
        ...previous, error: error instanceof Error ? error.message : "Не удалось сохранить избранное. Попробуйте снова.",
      });
    } finally {
      locks.current.delete(key);
      setPending(values => values.filter(value => value !== key));
    }
  }

  return {
    signedIn: Boolean(userId), ids: current?.ids ?? [], ready: current?.ready ?? false,
    loading: Boolean(userId) && !current, error: current?.error ?? "",
    isPending: (courtId: number) => pending.includes(`${userId}:${courtId}`),
    toggle, retry: () => { setSnapshot(null); setRefresh(value => value + 1); },
  };
}
