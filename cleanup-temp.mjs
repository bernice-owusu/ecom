import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
for (const id of ['TB-445015', 'TB-687544']) {
  await p.query('DELETE FROM entitlements WHERE order_id = $1', [id]);
  await p.query('DELETE FROM payments WHERE order_id = $1', [id]);
  await p.query('DELETE FROM deliveries WHERE order_id = $1', [id]);
  await p.query('DELETE FROM orders WHERE id = $1', [id]);
  console.log('cleaned', id);
}
await p.end();
