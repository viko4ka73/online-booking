import type { Pool } from "pg";

export async function migratePricing(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version='003_pricing'");
    if (!applied.rows.length) {
      await client.query(`
        ALTER TABLE courts ADD COLUMN hourly_rate INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0);
        ALTER TABLE courts ADD COLUMN extra_player_hourly_rate INTEGER NOT NULL DEFAULT 0 CHECK (extra_player_hourly_rate >= 0);
        ALTER TABLE equipment ADD COLUMN unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0);
        ALTER TABLE court_reservations ADD COLUMN pricing JSONB;
        UPDATE courts SET
          hourly_rate=CASE sport_id WHEN 'badminton' THEN 100000 WHEN 'table-tennis' THEN 70000
            WHEN 'volleyball' THEN 200000 WHEN 'football' THEN 250000 WHEN 'basketball' THEN 200000 ELSE 120000 END,
          extra_player_hourly_rate=CASE WHEN sport_id='badminton' THEN 15000 ELSE 10000 END;
        UPDATE equipment SET unit_price=CASE id WHEN 'racket' THEN 15000 WHEN 'shuttle' THEN 10000
          WHEN 'paddle' THEN 10000 WHEN 'table-ball' THEN 3000 WHEN 'volley-ball' THEN 20000 ELSE 0 END;
        INSERT INTO schema_migrations (version) VALUES ('003_pricing');
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
