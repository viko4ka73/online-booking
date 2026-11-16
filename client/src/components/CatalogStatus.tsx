import type { CatalogState } from "../lib/catalog";
export default function CatalogStatus({ catalog }: { catalog: CatalogState }) {
  if (!catalog.loading && !catalog.error) return null;
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-10 lg:px-16">
      <p role={catalog.error ? "alert" : "status"}>{catalog.error || "Загружаем площадки…"}</p>
      {catalog.error && <button type="button" onClick={catalog.onRetry} className="mt-2 text-sm font-semibold underline">Повторить</button>}
    </div>
  );
}
