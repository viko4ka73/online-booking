import type { Pool } from "pg";

export async function migrateFavorites(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version='006_favorites'");
    if (!applied.rows.length) {
      await client.query(`
        CREATE TABLE user_favorite_courts (
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          court_id INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id,court_id)
        );
        CREATE INDEX user_favorite_courts_court_idx ON user_favorite_courts(court_id);
        INSERT INTO schema_migrations(version) VALUES ('006_favorites');
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
