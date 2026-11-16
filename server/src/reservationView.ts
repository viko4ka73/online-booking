import { formatTime } from "./booking";
import type { calculatePrice } from "./pricing";

export type Equipment = { id: string; name: string; quantity: number };
export type BookingRow = {
  id: string; court_id: number; sport_id: string; play_date: string; start_minute: number; end_minute: number;
  status: "active" | "cancelled"; version: number;
  pricing: ReturnType<typeof calculatePrice> | null;
  players: number; equipment: Equipment[]; court_name: string; sport: string; hall: string;
};
export const fields = `r.id,r.court_id,COALESCE(r.sport_id,c.sport_id) AS sport_id,to_char(r.play_date,'YYYY-MM-DD') AS play_date,
  r.start_minute,r.end_minute,r.players,r.pricing,r.status,r.version,COALESCE(cs.display_name,c.name) AS court_name,s.name AS sport,h.name AS hall,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',re.equipment_id,'name',re.equipment_name,'quantity',re.quantity) ORDER BY re.equipment_id)
    FROM reservation_equipment re WHERE re.reservation_id=r.id),'[]'::jsonb) AS equipment`;
export const fromBookings = `FROM court_reservations r JOIN courts c ON c.id=r.court_id
  JOIN sports s ON s.id=COALESCE(r.sport_id,c.sport_id) JOIN halls h ON h.id=c.hall_id
  LEFT JOIN court_sports cs ON cs.court_id=c.id AND cs.sport_id=s.id`;

export function canModify(row: BookingRow, now = Date.now()) {
  const startsAt = new Date(`${row.play_date}T${formatTime(row.start_minute)}:00+03:00`).getTime();
  return row.status === "active" && startsAt - now >= 48 * 60 * 60 * 1000;
}

export function publicBooking(row: BookingRow) {
  return {
    id: row.id, courtId: row.court_id, sportId: row.sport_id, courtName: row.court_name,
    sport: row.sport, hall: row.hall, date: row.play_date,
    start: formatTime(row.start_minute), end: formatTime(row.end_minute),
    players: row.players, equipment: row.equipment, pricing: row.pricing,
    status: row.status,version: row.version,canModify: canModify(row),
  };
}


export function canAdminModify(row:BookingRow,now=Date.now()){
 return row.status==='active'&&new Date(row.play_date+'T'+formatTime(row.start_minute)+':00+03:00').getTime()>now;
}
