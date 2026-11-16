import type { Pool } from "pg";
export async function migrateCourtCreation(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await db.query("SELECT version FROM schema_migrations WHERE version='009_court_creation'");
    if (!applied.rowCount) await db.query(`
      CREATE TABLE court_creation_requests (
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        request_key UUID NOT NULL,
        court_id INTEGER NOT NULL UNIQUE REFERENCES courts(id) ON DELETE CASCADE,
        payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,request_key)
      );
      INSERT INTO schema_migrations(version) VALUES('009_court_creation');
    `);
    await db.query("COMMIT");
  } catch(error) {await db.query("ROLLBACK");throw error;}
  finally {db.release();}
}
