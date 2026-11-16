import { Router } from "express";
import { pool } from "../db";
import { sessionUserId } from "./auth";

const router = Router();
router.use(async (req,res,next) => {
  res.set("Cache-Control","no-store");
  const userId = sessionUserId(req);
  if (!userId || !(await pool.query("SELECT id FROM app_users WHERE id=$1",[userId])).rowCount) {
    return res.status(401).json({ error: "Войдите в аккаунт, чтобы сохранять избранные площадки." });
  }
  res.locals.userId = userId;
  next();
});

router.get("/", async (_req,res) => {
  const { rows } = await pool.query<{ court_id: number }>(
    "SELECT f.court_id FROM user_favorite_courts f JOIN courts c ON c.id=f.court_id WHERE f.user_id=$1 AND c.deleted_at IS NULL ORDER BY f.created_at DESC,f.court_id", [res.locals.userId],
  );
  return res.json({ courtIds: rows.map(row => row.court_id) });
});

router.param("courtId", (_req,res,next,value) => {
  const courtId = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(courtId) || courtId > 2147483647) {
    return res.status(400).json({ error: "Некорректный номер площадки." });
  }
  res.locals.courtId = courtId;
  next();
});

// PUT and DELETE are idempotent: retrying never reverses the intended action.
router.put("/:courtId", async (_req,res) => {
  const { courtId,userId } = res.locals;
  const inserted = await pool.query(
    `INSERT INTO user_favorite_courts(user_id,court_id)
     SELECT $1,id FROM courts WHERE id=$2 AND deleted_at IS NULL
     ON CONFLICT (user_id,court_id) DO UPDATE SET court_id=EXCLUDED.court_id
     RETURNING court_id`, [userId,courtId],
  );
  if (!inserted.rowCount) return res.status(404).json({ error: "Площадка не найдена." });
  return res.json({ courtId,favorite: true });
});

router.delete("/:courtId", async (_req,res) => {
  const { courtId,userId } = res.locals;
  await pool.query("DELETE FROM user_favorite_courts WHERE user_id=$1 AND court_id=$2",[userId,courtId]);
  return res.json({ courtId,favorite: false });
});

export default router;
