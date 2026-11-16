import type { Pool } from "pg";

export async function migrateTimeRates(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73190351)");
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version='004_time_rates'");
    if (!applied.rows.length) {
      await client.query(`
        CREATE TABLE sport_time_rates (
          sport_id TEXT NOT NULL REFERENCES sports(id),
          day_type TEXT NOT NULL CHECK (day_type IN ('weekday','weekend')),
          start_minute SMALLINT NOT NULL CHECK (start_minute >= 0 AND start_minute % 30 = 0),
          end_minute SMALLINT NOT NULL CHECK (end_minute <= 1440 AND end_minute % 30 = 0),
          hourly_rate INTEGER NOT NULL CHECK (hourly_rate >= 0),
          extra_player_hourly_rate INTEGER NOT NULL CHECK (extra_player_hourly_rate >= 0),
          PRIMARY KEY (sport_id,day_type,start_minute),
          CHECK (end_minute > start_minute)
        );
        WITH prices(sport_id,morning,daytime,evening,extra) AS (
          VALUES ('badminton',80000,100000,120000,15000),
            ('table-tennis',50000,70000,90000,10000),
            ('volleyball',150000,200000,250000,10000),
            ('basketball',150000,200000,250000,10000),
            ('football',200000,250000,300000,10000),
            ('tennis',100000,120000,150000,10000)
        )
        INSERT INTO sport_time_rates
          SELECT sport_id,'weekday',period.start_minute,period.end_minute,
            CASE period.tier WHEN 1 THEN morning WHEN 2 THEN daytime ELSE evening END,extra
          FROM prices CROSS JOIN (VALUES (480,720,1),(720,1080,2),(1080,1380,3)) AS period(start_minute,end_minute,tier)
          UNION ALL SELECT sport_id,'weekend',540,1320,evening,extra FROM prices;
        INSERT INTO schema_migrations(version) VALUES ('004_time_rates');
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
