import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initializeDatabase, pool } from "./db";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import scheduleRouter from "./routes/schedule";
import reservationsRouter from "./routes/reservations";
import favoritesRouter from "./routes/favorites";
import { listPrices } from "./catalog";
import notificationsRouter from "./routes/notifications";
import { ensureReminders, startEmailWorker } from "./notifications";
import { COURT_IMAGE_DIR } from "./courtImages";

import waitlistRouter from './routes/waitlist';
const app = express();
const port = Number(process.env.PORT ?? 3000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("Set JWT_SECRET (at least 32 characters) in server/.env.");
}

app.disable("x-powered-by");
app.use(cors({
  origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());
app.use("/uploads/courts",express.static(COURT_IMAGE_DIR,{index:false,dotfiles:"deny",maxAge:"1y",immutable:true}));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", message: "Sport Booking API works", database: "connected" });
  } catch {
    return res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/api/prices", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json(await listPrices());
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/courts", scheduleRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/waitlist",waitlistRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API request failed:", error);
  return res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

async function start() {
  await initializeDatabase();
  await ensureReminders();
  startEmailWorker();
  app.listen(port, () => {
    console.log(`Sport Booking API is listening on http://localhost:${port}`);
  });
}

start().catch((error: unknown) => {
  console.error("Could not start the API:", error);
  process.exit(1);
});
