import type { ComponentType } from "react";
import { GiBasketballBall, GiPingPongBat, GiSoccerBall, GiShuttlecock, GiTennisBall, GiVolleyballBall } from "react-icons/gi";

type Sport = { name: string; icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> };

export interface Court {
  id: number;
  adjacency?: import("./adjacency").CourtAdjacency[];
  resourceNumber?: number; hourlySurcharge?: number;
  sportId?: string;
  hallId?: string;
  rentalMode?: "units" | "whole";
  kind?: "court" | "table" | "whole";
  sports?: { id: string; name: string; courtName?:string; minPlayers: number; hourlyRate: number }[];
  name: string;
  sport: string;
  image: string;
  players: number;
  minPlayers: number;
  hourlyRate: number;
  extraPlayerHourlyRate: number;
  hall: string;
  description: string;
  dimensions: string;
  surface: string;
  equipment: string;
}

export const sports: Sport[] = [
  { name: "Бадминтон", icon: GiShuttlecock },
  { name: "Настольный теннис", icon: GiPingPongBat },
  { name: "Волейбол", icon: GiVolleyballBall },
  { name: "Баскетбол", icon: GiBasketballBall },
  { name: "Футбол", icon: GiSoccerBall },
  { name: "Теннис", icon: GiTennisBall },
];

export type CatalogState = { courts: Court[]; loading: boolean; error: string; onRetry: () => void };

export function courtForSport(court: Court, selected?: string | null): Court | null {
  if (!selected) return court;
  const sport = court.sports?.find(item => item.id === selected || item.name === selected);
  if (sport) return {...court,name:sport.courtName ?? court.name,sportId:sport.id,sport:sport.name,minPlayers:sport.minPlayers,hourlyRate:sport.hourlyRate};
  return court.sport === selected || court.sportId === selected ? court : null;
}

/** Keep saved hall links working after the catalog switched to individual courts. */
export function legacyHallTarget(courts:Court[],hallId:string,search:string) {
  let decoded:string;
  try { decoded=decodeURIComponent(hallId); } catch { return '/courts'; }
  const hall=courts.filter(court=>court.hallId===decoded);
  if(!hall.length)return '/courts';
  const params=new URLSearchParams(search);
  const requested=params.get('sport');
  const sport=hall.flatMap(court=>court.sports??[]).find(s=>s.id===requested||s.name===requested)?.id
    ?? hall.find(court=>court.sport===requested||court.sportId===requested)?.sportId
    ?? hall[0].sportId;
  const compatible=hall.flatMap(court=>{const match=courtForSport(court,sport);return match?[match]:[];});
  const target=compatible.find(court=>String(court.id)===params.get('court'))
    ?? (compatible.length===1?compatible[0]:null);
  params.delete('court');
  if(sport)params.set('sport',sport);else params.delete('sport');
  if(!target)params.delete('repeat');
  const query=params.toString();
  return (target?'/courts/'+target.id:'/courts')+(query?'?'+query:'');
}
