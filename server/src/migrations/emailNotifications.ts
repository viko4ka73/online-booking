import type { Pool } from "pg";

export async function migrateEmailNotifications(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await db.query("SELECT version FROM schema_migrations WHERE version='007_email_notifications'");
    if (!applied.rowCount) await db.query(`
      ALTER TABLE app_users ADD COLUMN email_reminders_enabled BOOLEAN NOT NULL DEFAULT true;
      CREATE TABLE email_notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        reservation_id UUID NOT NULL REFERENCES court_reservations(id) ON DELETE CASCADE,
        reservation_version INTEGER NOT NULL CHECK (reservation_version > 0),
        kind TEXT NOT NULL CHECK (kind IN ('created','cancelled','rescheduled','reminder')),
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
        scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        sent_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(reservation_id,reservation_version,kind)
      );
      CREATE INDEX email_notifications_pending_idx ON email_notifications(next_attempt_at,scheduled_at,id) WHERE status='pending';
      CREATE INDEX email_notifications_user_idx ON email_notifications(user_id);
      INSERT INTO schema_migrations(version) VALUES ('007_email_notifications');
    `);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
