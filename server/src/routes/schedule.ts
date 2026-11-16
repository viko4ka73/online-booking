import { Router } from "express";
import { availableSlots, scheduleError } from "../booking";

import { calculatePrice } from "../pricing";
import { getCourtOptions, listCourts } from "../catalog";

const router = Router();
router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ courts: await listCourts() });
});

router.get("/:courtId/options", async (req, res) => {
  const id = Number(req.params.courtId);
  const selected = req.method === "POST" ? req.body?.sportId : req.query.sport;
  if (selected !== undefined && typeof selected !== "string") return res.status(400).json({error:"Выберите вид спорта."});
  const court = Number.isSafeInteger(id) && id > 0 ? await getCourtOptions(id,undefined,selected) : null;
  if (!court) return res.status(404).json({ error: "Площадка не найдена." });
  return res.json({ court });
});

router.post("/:courtId/quote", async (req,res) => {
  const id = Number(req.params.courtId);
  const selected = req.method === "POST" ? req.body?.sportId : req.query.sport;
  if (selected !== undefined && typeof selected !== "string") return res.status(400).json({error:"Выберите вид спорта."});
  const court = Number.isSafeInteger(id) && id > 0 ? await getCourtOptions(id,undefined,selected) : null;
  if (!court) return res.status(404).json({ error: "Площадка не найдена." });
  const { date,start,duration,players,equipment } = req.body ?? {};
  const error = scheduleError(date,duration);
  if (error) return res.status(400).json({ error });
  if (typeof start !== "string" || !/^([01]\d|2[0-3]):(00|30)$/.test(start) ||
      !Number.isInteger(players) || players < court.minPlayers || players > court.capacity ||
      !Array.isArray(equipment) || equipment.length > court.equipment.length) {
    return res.status(400).json({ error: "Проверьте время, игроков и инвентарь." });
  }
  const quantities = new Map<string,number>();
  for (const item of equipment) {
    const option = court.equipment.find(({ id }) => id === item?.id);
    if (!option || quantities.has(option.id) || !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > option.max) {
      return res.status(400).json({ error: "Проверьте количество инвентаря." });
    }
    quantities.set(option.id,item.quantity);
  }
  const pricing = calculatePrice(court,date,start,duration,players,quantities);
  if (!pricing) return res.status(400).json({ error: "Для выбранного времени нет тарифа." });
  res.set("Cache-Control","no-store");
  return res.json({ pricing });
});

router.get("/:courtId/availability", async (req, res) => {
  const id = Number(req.params.courtId);
  const court = Number.isSafeInteger(id) && id > 0 ? await getCourtOptions(id,undefined,typeof req.query.sport==="string"?req.query.sport:undefined) : null;
  if (!court) return res.status(404).json({ error: "Площадка не найдена." });
  const date = req.query.date;
  const duration = typeof req.query.duration === "string" ? Number(req.query.duration) : NaN;
  const error = scheduleError(date, duration);
  if (error) return res.status(400).json({ error });
  const slots = await availableSlots(court.id, date as string, duration,undefined,null,court.sportId);
  res.set("Cache-Control", "no-store");
  return res.json({ slots });
});

export default router;
