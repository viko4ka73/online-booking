export type ManagedCourt = {
  id: number;
  adjacency?: import("../../lib/adjacency").CourtAdjacency[]; resourceNumber?:number;upcomingReservations?:number;upcomingBlocks?:number;sports?:{id:string;name:string}[];hasSportVariants?:boolean; hourlySurcharge?:number; kind?:"court"|"table"|"whole"; rentalMode?:"units"|"whole"; name: string; sportId: string; sport: string; minPlayers: number;
  hallId: string; hall: string; image: string; capacity: number;
  description: string; dimensions: string; surface: string; equipmentDescription: string;
  version: number; hasReservations: boolean; hasEquipment: boolean;
};
export type CourtDirectory = {
  vipHourlySurcharge?: number;
  courts: ManagedCourt[];
  nextNumbers?:Record<string,number>;
  sports: { id: string; name: string; minPlayers: number }[];
  halls: { id: string; name: string; rentalMode?:"units"|"whole"; sportIds?:string[] }[];
};
