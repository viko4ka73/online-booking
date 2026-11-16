type PricedCourt = {
  minPlayers: number;
  rates: {
    dayType: "weekday" | "weekend"; startMinute: number; endMinute: number;
    hourlyRate: number; extraPlayerHourlyRate: number;
  }[];
  equipment: { id: string; name: string; unitPrice: number }[];
};

export function calculatePrice(court: PricedCourt, date: string, start: string, duration: number, players: number, quantities: Map<string, number>) {
  const weekend = [0,6].includes(new Date(date + "T00:00:00Z").getUTCDay());
  const dayType = weekend ? "weekend" : "weekday";
  const begin = Number(start.slice(0,2)) * 60 + Number(start.slice(3));
  const end = begin + duration;
  const rates = court.rates.filter((rate) => rate.dayType === dayType && rate.startMinute < end && rate.endMinute > begin)
    .sort((a,b) => a.startMinute - b.startMinute);
  let cursor = begin;
  let weightedBase = 0;
  let weightedExtra = 0;
  const segments = [];
  for (const rate of rates) {
    const segmentStart = Math.max(begin,rate.startMinute);
    const segmentEnd = Math.min(end,rate.endMinute);
    if (segmentStart !== cursor) return null;
    cursor = segmentEnd;
    const previousBase = Math.round(weightedBase / 60);
    const previousExtra = Math.round(weightedExtra / 60);
    weightedBase += rate.hourlyRate * (segmentEnd - segmentStart);
    weightedExtra += rate.extraPlayerHourlyRate * Math.max(0,players - court.minPlayers) * (segmentEnd - segmentStart);
    segments.push({
      startMinute: segmentStart, endMinute: segmentEnd, hourlyRate: rate.hourlyRate,
      extraPlayerHourlyRate: rate.extraPlayerHourlyRate,
      baseAmount: Math.round(weightedBase / 60) - previousBase,
      extraPlayersAmount: Math.round(weightedExtra / 60) - previousExtra,
    });
  }
  if (cursor !== end) return null;
  const baseAmount = Math.round(weightedBase / 60);
  const extraPlayersAmount = Math.round(weightedExtra / 60);
  const equipment = court.equipment
    .filter(({ id }) => (quantities.get(id) ?? 0) > 0)
    .map(({ id, name, unitPrice }) => ({
      id, name, quantity: quantities.get(id)!, unitPrice, amount: unitPrice * quantities.get(id)!,
    }));
  const equipmentAmount = equipment.reduce((sum,item) => sum + item.amount,0);
  return {
    currency: "RUB",durationMinutes: duration,includedPlayers: court.minPlayers,dayType,segments,
    baseAmount,extraPlayersAmount,equipmentAmount,
    totalAmount: baseAmount + extraPlayersAmount + equipmentAmount,equipment,
  };
}
