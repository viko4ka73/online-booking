import type { Pool } from "pg";
export async function migrateCourtEditing(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await db.query("SELECT version FROM schema_migrations WHERE version='008_court_editing'");
    if (!applied.rowCount) await db.query(`
      ALTER TABLE courts ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 1 CHECK(edit_version>0);
      INSERT INTO schema_migrations(version) VALUES('008_court_editing');
    `);
    await db.query("COMMIT");
  } catch(error) {await db.query("ROLLBACK");throw error;}
  finally {db.release();}
}
