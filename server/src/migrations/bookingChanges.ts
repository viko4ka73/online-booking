import type { Pool } from "pg";

export async function migrateBookingChanges(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version='005_booking_changes'");
    if (!applied.rows.length) {
      await client.query(`
        ALTER TABLE court_reservations
          ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
          ADD COLUMN cancelled_at TIMESTAMPTZ,
          ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
        INSERT INTO schema_migrations(version) VALUES ('005_booking_changes');
      `);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
