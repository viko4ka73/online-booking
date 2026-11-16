import { readFileSync } from "node:fs";
import { join } from "node:path";

const logoCid = "igraem-logo@booking";
const logoImage = readFileSync(join(__dirname,"assets/email-logo.png"));

export type EmailBooking = {
  id: string; version: number; courtName: string; sport: string; hall: string;
  date: string; start: string; end: string; status: "active" | "cancelled"; players: number;
  equipment: { name: string; quantity: number }[];
  pricing: { totalAmount: number } | null;
};
export type EmailKind = "created" | "cancelled" | "rescheduled" | "reminder";
export type EmailPayload = { booking: EmailBooking; previous?: EmailBooking };
const titles: Record<EmailKind,string> = {
  created: "Бронирование подтверждено", cancelled: "Бронирование отменено",
  rescheduled: "Бронирование изменено", reminder: "Напоминаем о вашей игре",
};
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]!));
const dateLabel = (value: string) => value.split("-").reverse().join(".");

export function renderBookingEmail(kind: EmailKind, payload: EmailPayload, name: string, origin: string) {
  const { booking:b, previous } = payload;
  const rows = [
    ["Площадка",`${b.courtName} · ${b.sport}`], ["Зал",b.hall],
    ["Дата",dateLabel(b.date)], ["Время",`${b.start}–${b.end} (Санкт-Петербург)`],
    ["Игроков",String(b.players)],
    ["Инвентарь",b.equipment.length ? b.equipment.map(item => `${item.name} — ${item.quantity} шт.`).join(", ") : "Со своим инвентарём"],
  ];
  if (b.pricing) rows.push([kind === "cancelled" ? "Стоимость отменённой записи" : "Стоимость",new Intl.NumberFormat("ru-RU", { style:"currency", currency:"RUB" }).format(b.pricing.totalAmount/100)]);
  if (previous) rows.push(["Раньше",`${previous.courtName} · ${dateLabel(previous.date)} · ${previous.start}–${previous.end}`]);
  const intro = kind === "cancelled" ? "Запись отменена. Вы можете выбрать другое время в личном кабинете."
    : kind === "reminder" ? "Ваша игра уже скоро. Проверьте время и подготовьте спортивную форму."
    : kind === "rescheduled" ? "Перенос подтверждён. Ниже — актуальные данные вашей записи."
    : "Ждём вас в спортивном комплексе «Играем?». Данные записи сохранены в личном кабинете.";
  const rules = kind === "cancelled" ? "" : "В раздевалку можно пройти за 30 минут до игры. Сменная спортивная обувь обязательна. На площадку можно выйти не раньше чем за 5 минут до начала. Отмена и перенос — не позднее чем за 48 часов до игры.";
  const accountUrl = new URL("/account",origin).href;
  const text = [`Здравствуйте, ${name}!`,titles[kind],intro,...rows.map(([label,value]) => `${label}: ${value}`),rules,`Бронь № ${b.id}`,`Личный кабинет: ${accountUrl}`].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><body style="margin:0;background:#f7f5ec;font-family:Arial,sans-serif;color:#203126"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fcfaf4;border:1px solid #d8dbce;border-radius:20px;overflow:hidden"><tr><td style="padding:26px;background:#203126;color:#fff;font-size:28px;font-weight:bold"><img src="cid:${logoCid}" width="168" height="57" alt="Играем? — спортивный комплекс" style="display:block;width:168px;max-width:100%;height:auto;border:0" /></td></tr><tr><td style="padding:26px"><p>Здравствуйте, ${escapeHtml(name)}!</p><h1 style="font-size:25px;line-height:1.3">${titles[kind]}</h1><p style="font-size:14px;line-height:1.7;color:#536354">${intro}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eddf;border-radius:14px">${rows.map(([label,value]) => `<tr><td style="padding:10px 14px;font-size:13px;vertical-align:top;color:#536354">${escapeHtml(label)}</td><td style="padding:10px 14px;font-size:13px;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("")}</table>${rules ? `<p style="font-size:12px;line-height:1.8;color:#536354">${rules}</p>` : ""}<p style="margin:24px 0"><a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#293d30;color:#fff;text-decoration:none;border-radius:24px;padding:13px 22px;font-size:14px">Открыть личный кабинет</a></p><p style="font-size:11px;color:#748074;word-break:break-all">Бронь № ${escapeHtml(b.id)}</p></td></tr></table></td></tr></table></body></html>`;
  return {
    subject:`Играем? · ${titles[kind]}`,text,html,
    attachments:[{ filename:"igraem-logo.png",content:logoImage,contentType:"image/png",cid:logoCid,contentDisposition:"inline" as const }],
  };
}

export function renderWaitlistEmail(slot:{courtId:number;courtName:string;sportId:string;sport:string;date:string;start:string;end:string;duration:number},name:string,origin:string){
 const url=new URL('/courts/'+slot.courtId,origin);
 url.searchParams.set('sport',slot.sportId);url.searchParams.set('date',slot.date);url.searchParams.set('start',slot.start);url.searchParams.set('duration',String(slot.duration));
 const title='Появилось свободное время';
 const intro='Для вашей заявки из листа ожидания найден свободный интервал.';
 const details=slot.courtName+' · '+slot.sport+' · '+dateLabel(slot.date)+' · '+slot.start+'–'+slot.end+' (Санкт-Петербург)';
 const note='Время не закрепляется за заявкой. Откройте площадку и подтвердите бронирование; доступность и стоимость проверяются при оформлении.';
 const text=['Здравствуйте, '+name+'!',title,intro,details,note,'Забронировать: '+url.href,'Ваши заявки: '+new URL('/account#waitlist',origin).href].join('\n\n');
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><body style="margin:0;background:#f7f5ec;font-family:Arial,sans-serif;color:#203126"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fcfaf4;border:1px solid #d8dbce;border-radius:20px"><tr><td style="padding:26px;background:#203126"><img src="cid:'+logoCid+'" width="168" height="57" alt="Играем? — спортивный комплекс" style="display:block;width:168px;max-width:100%;height:auto;border:0"/></td></tr><tr><td style="padding:26px"><p>Здравствуйте, '+escapeHtml(name)+'!</p><h1 style="font-size:25px">'+title+'</h1><p style="font-size:14px;line-height:1.7">'+intro+'</p><p style="padding:18px;background:#e8eddf;border-radius:14px;font-size:15px;line-height:1.7;font-weight:bold">'+escapeHtml(details)+'</p><p style="font-size:13px;line-height:1.8;color:#536354">'+note+'</p><p style="margin:24px 0"><a href="'+escapeHtml(url.href)+'" style="display:inline-block;background:#293d30;color:#fff;text-decoration:none;border-radius:24px;padding:13px 22px;font-size:14px">Перейти к бронированию</a></p><a href="'+escapeHtml(new URL('/account#waitlist',origin).href)+'" style="font-size:12px;color:#536354">Мои заявки в листе ожидания</a></td></tr></table></td></tr></table></body></html>';
 return {subject:'Играем? · '+title,text,html,attachments:[{filename:'igraem-logo.png',content:logoImage,contentType:'image/png',cid:logoCid,contentDisposition:'inline' as const}]};
}
