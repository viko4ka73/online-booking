export type Booking = {
  id: string; courtId: number; sportId?: string; courtName: string; sport: string; hall: string;
  date: string; start: string; end: string; status: "active" | "cancelled"; version: number; canModify: boolean;
  pricing: { baseAmount: number; extraPlayersAmount: number; equipmentAmount: number; totalAmount: number } | null;
  players: number; equipment: { id: string; name: string; quantity: number }[];
};
