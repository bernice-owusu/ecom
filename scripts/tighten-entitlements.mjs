import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Aborting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MAX_DOWNLOADS = 3;
const EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

try {
  const now = new Date();
  const newExpiry = new Date(now.getTime() + EXPIRY_MS).toISOString();

  const result = await pool.query(
    `UPDATE entitlements
     SET max_downloads = $1,
         expiration = LEAST(expiration, $2::text)
     WHERE active = true`,
    [MAX_DOWNLOADS, newExpiry]
  );

  console.log(`Updated ${result.rowCount} active entitlement(s): max_downloads=3, expiration capped at now+3d.`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
