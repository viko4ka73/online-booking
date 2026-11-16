import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const router = Router();
router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
const COOKIE_NAME = "sport_booking_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  created_at: Date;
  phone: string | null;
  birth_date: string | null;
  profile_photo: string | null;
  password_hash?: string;
};

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  return value;
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
    phone: row.phone ?? "",
    birthDate: row.birth_date ?? "",
    profilePhoto: row.profile_photo,
  };
}

function issueSession(res: Response, row: UserRow) {
  const token = jwt.sign({ role: row.role }, jwtSecret(), {
    subject: row.id,
    expiresIn: "7d",
    issuer: "sport-booking-api",
    audience: "sport-booking-client",
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function sessionUserId(req: Request): string | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      issuer: "sport-booking-api",
      audience: "sport-booking-client",
    });
    return typeof payload === "string" || typeof payload.sub !== "string" ? null : payload.sub;
  } catch {
    return null;
  }
}

router.post("/register", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: "Имя должно содержать от 2 до 100 символов." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Введите корректный адрес электронной почты." });
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Пароль должен содержать от 8 до 72 байт." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query<UserRow>(
      `INSERT INTO app_users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, phone, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, profile_photo, created_at`,
      [name, email, passwordHash],
    );
    const user = result.rows[0];
    issueSession(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return res.status(409).json({ error: "Аккаунт с такой почтой уже существует." });
    }
    console.error("Registration failed:", error);
    return res.status(500).json({ error: "Не удалось создать аккаунт. Попробуйте позже." });
  }
});

router.post("/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    return res.status(400).json({ error: "Введите почту и пароль." });
  }

  try {
    const result = await pool.query<UserRow>(
      "SELECT id, name, email, role, phone, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, profile_photo, created_at, password_hash FROM app_users WHERE email = $1",
      [email],
    );
    const user = result.rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Неверная почта или пароль." });
    }
    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ error: "Не удалось выполнить вход. Попробуйте позже." });
  }
});

router.get("/me", async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) {
    clearSession(res);
    return res.json({ user: null });
  }
  try {
    const result = await pool.query<UserRow>(
      "SELECT id, name, email, role, phone, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, profile_photo, created_at FROM app_users WHERE id = $1",
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      clearSession(res);
      return res.json({ user: null });
    }
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session lookup failed:", error);
    return res.status(500).json({ error: "Не удалось загрузить профиль." });
  }
});

router.patch("/me", async (req, res) => {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Войдите в аккаунт, чтобы изменить профиль." });

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const birthDate = typeof req.body?.birthDate === "string" ? req.body.birthDate : "";
  const profilePhoto = req.body?.profilePhoto === null ? null : typeof req.body?.profilePhoto === "string" ? req.body.profilePhoto : "";
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: "Имя должно содержать от 2 до 100 символов." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Введите корректный адрес электронной почты." });
  }
  if (phone && (!/^\+?[0-9\s()-]{10,24}$/.test(phone) || !/^(?:7|8)\d{10}$/.test(phone.replace(/\D/g, "")))) {
    return res.status(400).json({ error: "Введите корректный номер телефона." });
  }
  const parsedBirthDate = new Date(`${birthDate}T00:00:00.000Z`);
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(parsedBirthDate.getTime()) || parsedBirthDate.getUTCFullYear()<1 || parsedBirthDate.toISOString().slice(0, 10) !== birthDate || birthDate > new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()))) {
    return res.status(400).json({ error: "Укажите корректную дату рождения в прошлом." });
  }
  if (profilePhoto !== null && profilePhoto !== "") {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(profilePhoto);
    if (!match || Buffer.from(match[2], "base64").byteLength > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "Фото должно быть PNG, JPG или WebP размером до 2 МБ." });
    }
  }

  try {
    const result = await pool.query<UserRow>(
      `UPDATE app_users SET name = $1, email = $2, phone = $3, birth_date = $4, profile_photo = $5
       WHERE id = $6
       RETURNING id, name, email, role, phone, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, profile_photo, created_at`,
      [name, email, phone || null, birthDate || null, profilePhoto || null, userId],
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "Аккаунт не найден." });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return res.status(409).json({ error: "Аккаунт с такой почтой уже существует." });
    }
    console.error("Profile update failed:", error);
    return res.status(500).json({ error: "Не удалось сохранить изменения. Попробуйте позже." });
  }
});

router.post("/logout", (_req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

export default router;
