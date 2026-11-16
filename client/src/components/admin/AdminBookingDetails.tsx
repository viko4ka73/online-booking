import AppLink from "../AppLink";
import {useState} from "react";
import BookingChangeDialog from "../BookingChangeDialog";
import { FiCalendar, FiRepeat, FiXCircle, FiClock, FiMail, FiMapPin, FiPhone, FiUser } from "react-icons/fi";
import type { AdminBooking } from "../../lib/adminBookings";
import { getAdminBookingStatus } from "../../lib/adminBookings";
import { money } from "../../lib/money";
import BookingDialog from "../BookingDialog";

export default function AdminBookingDetails({ booking, onClose,onSaved }: { booking: AdminBooking; onClose: () => void;onSaved:(message:string)=>void }) {
  const [action,setAction]=useState<"cancel"|"reschedule"|null>(null);
  if(action)return <BookingChangeDialog admin booking={booking} mode={action} onClose={()=>setAction(null)} onSaved={onSaved}/>;
  const status = getAdminBookingStatus(booking);
  return (
    <BookingDialog open pending={false} onClose={onClose} title="Сведения о бронировании">
      <div className="space-y-5 p-5 sm:p-7">
        <div className="rounded-2xl bg-[#e8eddf] p-4">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${status.style}`}>{status.label}</span>
          <h3 className="mt-3 text-lg font-semibold">{booking.courtName} · {booking.sport}</h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#405640]">
            <span className="inline-flex items-center gap-1.5"><FiCalendar aria-hidden="true" />{booking.date.split("-").reverse().join(".")}</span>
            <span className="inline-flex items-center gap-1.5"><FiClock aria-hidden="true" />{booking.start}–{booking.end}</span>
            <span className="inline-flex items-center gap-1.5"><FiMapPin aria-hidden="true" />{booking.hall}</span>
          </div>
          <p className="mt-2 text-xs text-[#536354]">Время Санкт-Петербурга</p>
        </div>
        <section aria-label="Данные пользователя" className="rounded-2xl border border-[#d8dbce] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FiUser aria-hidden="true" />Пользователь</h3>
          <p className="mt-3 font-semibold">{booking.customer.name ?? "Без аккаунта"}</p>
          {booking.customer.email && <AppLink href={`mailto:${booking.customer.email}`} className="mt-2 flex items-center gap-2 break-all text-sm text-[#536354]"><FiMail className="shrink-0" aria-hidden="true" />{booking.customer.email}</AppLink>}
          {booking.customer.phone ? <AppLink href={`tel:${booking.customer.phone.replace(/[^+0-9]/g, "")}`} className="mt-2 flex items-center gap-2 text-sm text-[#536354]"><FiPhone aria-hidden="true" />{booking.customer.phone}</AppLink> : <p className="mt-2 text-xs text-[#748074]">Телефон не указан</p>}
        </section>
        <section aria-label="Игроки и инвентарь" className="rounded-2xl border border-[#d8dbce] p-4">
          <h3 className="text-sm font-semibold">Игроков: {booking.players ?? "—"}</h3>
          <p className="mt-3 text-xs font-semibold text-[#748074]">Инвентарь</p>
          {booking.equipment.length ? <ul className="mt-2 space-y-1 text-sm">{booking.equipment.map(item => <li key={item.id}>{item.name} — {item.quantity} шт.</li>)}</ul> : <p className="mt-2 text-sm">Со своим инвентарём</p>}
        </section>
        {booking.pricing ? <dl className="space-y-2 rounded-2xl bg-[#e8eddf] p-4 text-sm">
          <div className="flex justify-between gap-3"><dt>Аренда площадки</dt><dd>{money(booking.pricing.baseAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Дополнительные игроки</dt><dd>{money(booking.pricing.extraPlayersAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Инвентарь</dt><dd>{money(booking.pricing.equipmentAmount)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-[#cdd2c3] pt-3 font-semibold"><dt>Стоимость записи</dt><dd>{money(booking.pricing.totalAmount)}</dd></div>
        </dl> : <p className="text-sm text-[#748074]">Стоимость этой записи не была зафиксирована.</p>}
        {booking.canModify&&<div className="grid gap-2 border-t border-[#dedfd2] pt-4 sm:grid-cols-2"><button type="button" onClick={()=>setAction('reschedule')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-4 text-sm font-semibold text-white hover:bg-[#536b50]"><FiRepeat aria-hidden="true"/>Перенести запись</button><button type="button" onClick={()=>setAction('cancel')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d8bfb1] px-4 text-sm font-semibold text-[#84523c] hover:bg-[#faf0e9]"><FiXCircle aria-hidden="true"/>Отменить запись</button></div>}
        <p className="break-all text-xs text-[#748074]">Бронь № {booking.id}</p>
      </div>
    </BookingDialog>
  );
}
