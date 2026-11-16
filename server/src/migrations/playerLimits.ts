import type { Pool } from "pg";

export async function migratePlayerLimits(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version='002_player_limits'");
    if (!applied.rows.length) {
      await client.query(`
        ALTER TABLE sports ADD COLUMN min_players SMALLINT NOT NULL DEFAULT 2 CHECK (min_players > 0);
        UPDATE sports SET min_players=10 WHERE id IN ('volleyball','football','basketball');
        UPDATE courts c SET capacity=GREATEST(c.capacity,s.min_players)
          FROM sports s WHERE s.id=c.sport_id;
        UPDATE courts SET capacity=GREATEST(capacity,12),
          description='Крытая площадка для командной игры и тренировок подачи и приёма.'
          WHERE sport_id='volleyball';
        INSERT INTO schema_migrations (version) VALUES ('002_player_limits');
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
