import "dotenv/config";
import { pool } from "../src/db";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim().toLowerCase();
  if (args.length !== 1 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Укажите почту существующего аккаунта: npm run admin:grant -- email@example.com");
  const result = await pool.query("UPDATE app_users SET role='admin' WHERE email=$1 RETURNING id",[email]);
  if (!result.rowCount) throw new Error("Аккаунт не найден. Сначала зарегистрируйте его на сайте.");
  console.log("Доступ администратора назначен. Обновите страницу сайта.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Не удалось назначить администратора."); process.exitCode=1; }).finally(() => pool.end());
