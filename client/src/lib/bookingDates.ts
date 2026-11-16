const dateInMoscow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" });

export function getBookingDateRange(now = new Date()) {
  const today = dateInMoscow.format(now);
  const lastDay = new Date(`${today}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + 40);
  return { today, lastDate: lastDay.toISOString().slice(0, 10) };
}

export const MAX_BOOKING_MINUTES=300;
export const bookingDurations=Array.from({length:9},(_,index)=>60+index*30);
