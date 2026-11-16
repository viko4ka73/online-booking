import { Router } from "express";
import { pool } from "../db";
import { sessionUserId } from "./auth";
import { emailConfigured, ensureReminders } from "../notifications";

const router = Router();
router.get("/settings", async (req,res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error:"Войдите в аккаунт." });
  const { rows } = await pool.query("SELECT email,email_reminders_enabled FROM app_users WHERE id=$1",[userId]);
  if (!rows.length) return res.status(401).json({ error:"Войдите в аккаунт заново." });
  res.set("Cache-Control","no-store");
  return res.json({ email:rows[0].email, remindersEnabled:rows[0].email_reminders_enabled, deliveryConfigured:emailConfigured() });
});
router.patch("/settings", async (req,res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error:"Войдите в аккаунт." });
  if (typeof req.body?.remindersEnabled !== "boolean") return res.status(400).json({ error:"Выберите настройку напоминаний." });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query("UPDATE app_users SET email_reminders_enabled=$2 WHERE id=$1 RETURNING email,email_reminders_enabled",[userId,req.body.remindersEnabled]);
    if (!rows.length) { await db.query("ROLLBACK"); return res.status(401).json({ error:"Войдите в аккаунт заново." }); }
    if (req.body.remindersEnabled) await ensureReminders(db,userId);
    else await db.query("UPDATE email_notifications SET status='skipped' WHERE user_id=$1 AND kind='reminder' AND status='pending'",[userId]);
    await db.query("COMMIT");
    res.set("Cache-Control","no-store");
    return res.json({ email:rows[0].email, remindersEnabled:rows[0].email_reminders_enabled, deliveryConfigured:emailConfigured() });
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
});
export default router;
