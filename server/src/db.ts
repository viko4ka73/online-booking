import "dotenv/config";
import {migrateAdjacency} from './migrations/adjacency';
import {migrateBadmintonTwo} from './migrations/badmintonTwo';
import {migrateRacketPhotos} from './migrations/racketPhotos';
import {migrateHallPhotos} from './migrations/hallPhotos';
import {migrateVipPricing} from './migrations/vipPricing';
import {migrateWaitlist} from './migrations/waitlist';
import {migrateCommercial} from './migrations/commercial';
import { migrateTimeBlocks } from './migrations/timeBlocks';
import { migrateAdminReservations } from './migrations/adminReservations';
import { Pool } from "pg";
import { migrateCatalog } from "./migrations/catalog";
import { migratePlayerLimits } from "./migrations/playerLimits";
import { migratePricing } from "./migrations/pricing";
import { migrateTimeRates } from "./migrations/timeRates";
import { migrateBookingChanges } from "./migrations/bookingChanges";
import { migrateFavorites } from "./migrations/favorites";
import { migrateEmailNotifications } from "./migrations/emailNotifications";
import { migrateCourtEditing } from "./migrations/courtEditing";
import { migrateCourtCreation } from "./migrations/courtCreation";
import { migrateHallResources } from "./migrations/hallResources";

import { migrateResourceSports } from './migrations/resourceSports';
import { migrateComplexLayout } from './migrations/complexLayout';
import { migrateCompactLayout } from './migrations/compactLayout';
import { migrateCourtLifecycle } from './migrations/courtLifecycle';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured. Add it to server/.env.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: "sport-booking-api",
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL client error:", error.message);
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      phone VARCHAR(24),
      birth_date DATE,
      profile_photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS birth_date DATE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
    CREATE INDEX IF NOT EXISTS app_users_created_at_idx ON app_users (created_at DESC);

    CREATE TABLE IF NOT EXISTS court_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      court_id INTEGER NOT NULL CHECK (court_id > 0),
      play_date DATE NOT NULL,
      start_minute SMALLINT NOT NULL CHECK (start_minute >= 0 AND start_minute % 30 = 0),
      end_minute SMALLINT NOT NULL CHECK (end_minute <= 1440 AND end_minute % 30 = 0),
      CHECK (end_minute - start_minute >= 60)
    );
    ALTER TABLE court_reservations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id);
    ALTER TABLE court_reservations ADD COLUMN IF NOT EXISTS players SMALLINT;
    ALTER TABLE court_reservations ADD COLUMN IF NOT EXISTS request_key UUID;
    CREATE UNIQUE INDEX IF NOT EXISTS court_reservations_request_idx ON court_reservations (user_id, request_key);
    CREATE INDEX IF NOT EXISTS court_reservations_user_date_idx
      ON court_reservations (user_id,play_date,start_minute,id);
    CREATE INDEX IF NOT EXISTS court_reservations_schedule_idx
      ON court_reservations (court_id, play_date, start_minute);
  `);
  await migrateCatalog(pool);
  await migratePlayerLimits(pool);
  await migratePricing(pool);
  await migrateTimeRates(pool);
  await migrateBookingChanges(pool);
  await migrateFavorites(pool);
  await migrateEmailNotifications(pool);
  await migrateCourtEditing(pool);
  await migrateCourtCreation(pool);
  await migrateHallResources(pool);
  await migrateResourceSports(pool);
  await migrateComplexLayout(pool);
  await migrateCompactLayout(pool);
  await migrateCourtLifecycle(pool);
  await migrateAdminReservations(pool);
  await migrateTimeBlocks(pool);
  await migrateCommercial(pool);
  await migrateWaitlist(pool);
  await migrateVipPricing(pool);
  await migrateHallPhotos(pool);
  await migrateRacketPhotos(pool);
  await migrateBadmintonTwo(pool);
  await migrateAdjacency(pool);
}
