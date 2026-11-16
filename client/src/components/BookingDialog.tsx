import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

type Props = { wide?: boolean; title?: string; open: boolean; pending: boolean; onClose: () => void; children: ReactNode };

export default function BookingDialog({ open, pending, onClose, children, wide = false, title = "Бронирование площадки" }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) { element.close(); return; }
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleId}
      className={`booking-dialog ${wide ? "max-w-3xl" : "max-w-xl"} fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-hidden rounded-3xl border border-[#d8dbce] bg-[#fcfaf4] p-0 text-[#203126] shadow-2xl backdrop:bg-[#152219]/70 backdrop:backdrop-blur-sm`}
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      onClick={(event) => {
        if (pending || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#dedfd2] px-5 py-4 sm:px-7">
        <h2 id={titleId} className="font-serif text-2xl">{title}</h2>
        <button type="button" onClick={onClose} disabled={pending} aria-label="Закрыть окно"
          className="rounded-full p-2 hover:bg-[#e8eddf] disabled:opacity-40"><FiX size={20} aria-hidden="true" /></button>
      </div>
      <div className="booking-dialog__body">{children}</div>
    </dialog>,
    document.body,
  );
}
