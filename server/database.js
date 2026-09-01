// Postgres-backed data store.
// Reads DATABASE_URL from env; auto-creates tables and seeds products.
// Falls back to the in-memory JSON file when no DATABASE_URL is configured
// (e.g. simple local dev without Postgres).
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const DB_FILE = path.join(process.cwd(), 'server', 'db.json');

// Initialize database template
const initialData = {
  products: [
    {
      id: "prod-resilience-hardcover",
      name: "RESILIENCE (Hard Copy)",
      subtitle: "A Journey of Grit, Growth, and Innovation",
      description: "Thomas Akwasi Baafi's inspiring journey from a remote village in Ghana to a pioneering tech leader. Physical hardcover edition.",
      format: "Hard Copy",
      price: 0.3,
      deliveryFee: 0,
      currency: "GHS",
      active: true
    },
    {
      id: "prod-resilience-audiobook",
      name: "RESILIENCE (Audiobook)",
      subtitle: "A Journey of Grit, Growth, and Innovation",
      description: "Complete unabridged digital audiobook read by the author. Includes access to instant download.",
      format: "Audiobook",
      price: 0.2,
      currency: "GHS",
      active: true
    },
    {
      id: "prod-resilience-softcopy",
      name: "RESILIENCE (Soft Copy)",
      subtitle: "A Journey of Grit, Growth, and Innovation",
      description: "Complete digital eBook edition in EPUB format. Readable on Kindle, Apple Books, Google Play Books, Kobo, or any other EPUB-compatible reader. Link is generated instantly on payment confirmation.",
      format: "Soft Copy",
      price: 0.15,
      currency: "GHS",
      active: true
    }
  ],
  orders: [],
  payments: [],
  deliveries: [],
  entitlements: [],
  reviews: []
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  format TEXT NOT NULL,
  price NUMERIC NOT NULL,
  delivery_fee NUMERIC,
  currency TEXT,
  active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer JSONB NOT NULL,
  products JSONB NOT NULL,
  subtotal NUMERIC,
  delivery_fee NUMERIC,
  total NUMERIC,
  payment_status TEXT,
  order_status TEXT,
  date TEXT,
  review_token TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  provider TEXT,
  transaction_reference TEXT,
  amount NUMERIC,
  currency TEXT,
  status TEXT,
  timestamp TEXT
);
CREATE TABLE IF NOT EXISTS deliveries (
  order_id TEXT PRIMARY KEY,
  country TEXT,
  region TEXT,
  city TEXT,
  address TEXT,
  additional_info TEXT,
  postal_code TEXT,
  status TEXT
);
CREATE TABLE IF NOT EXISTS entitlements (
  order_id TEXT PRIMARY KEY,
  customer_email TEXT,
  download_token TEXT UNIQUE,
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER DEFAULT 3,
  expiration TEXT,
  active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  order_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  rating INTEGER,
  review_text TEXT,
  format TEXT,
  verified BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'Pending',
  featured BOOLEAN DEFAULT false,
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_id_key ON reviews (order_id);
`;

let pool = null;
let memoryDb = null;

function pgAvailable() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  return pool;
}

async function ensureSchema() {
  await getPool().query(SCHEMA);
  await getPool().query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_token TEXT');
  const { rows } = await getPool().query('SELECT COUNT(*)::int AS c FROM products');
  if (rows[0].c === 0) {
    for (const p of initialData.products) {
      await getPool().query(
        `INSERT INTO products (id, name, subtitle, description, format, price, delivery_fee, currency, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.name, p.subtitle, p.description, p.format, p.price, p.deliveryFee ?? null, p.currency, p.active]
      );
    }
  }
}

async function loadFromDb() {
  const c = getPool();
  const [prods, orders, payments, deliveries, ent, revs] = await Promise.all([
    c.query('SELECT * FROM products ORDER BY id'),
    c.query('SELECT * FROM orders'),
    c.query('SELECT * FROM payments'),
    c.query('SELECT * FROM deliveries'),
    c.query('SELECT * FROM entitlements'),
    c.query('SELECT * FROM reviews ORDER BY created_at')
  ]);

  const products = prods.rows.map(r => ({
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
    description: r.description,
    format: r.format,
    price: Number(r.price),
    ...(r.delivery_fee != null ? { deliveryFee: Number(r.delivery_fee) } : {}),
    currency: r.currency,
    active: r.active
  }));

  const ordersList = orders.rows.map(r => ({
    id: r.id,
    customer: r.customer,
    products: r.products,
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee),
    total: Number(r.total),
    paymentStatus: r.payment_status,
    orderStatus: r.order_status,
    date: r.date,
    reviewToken: r.review_token || null
  }));

  const paymentsList = payments.rows.map(r => ({
    id: r.id,
    orderId: r.order_id,
    provider: r.provider,
    transactionReference: r.transaction_reference,
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    timestamp: r.timestamp
  }));

  const deliveriesList = deliveries.rows.map(r => ({
    orderId: r.order_id,
    country: r.country,
    region: r.region,
    city: r.city,
    address: r.address,
    additionalInfo: r.additional_info,
    postalCode: r.postal_code,
    status: r.status
  }));

  const entitlementsList = ent.rows.map(r => ({
    orderId: r.order_id,
    customerEmail: r.customer_email,
    downloadToken: r.download_token,
    downloadCount: r.download_count,
    maxDownloads: r.max_downloads,
    expiration: r.expiration,
    active: r.active
  }));

  const reviewsList = revs.rows.map(r => ({
    id: r.id,
    productId: r.product_id,
    orderId: r.order_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    rating: r.rating,
    review: r.review_text,
    format: r.format,
    verified: r.verified,
    status: r.status,
    featured: r.featured,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));

  return { products, orders: ordersList, payments: paymentsList, deliveries: deliveriesList, entitlements: entitlementsList, reviews: reviewsList };
}

async function persistDb(data) {
  const c = getPool();
  const client = await c.connect();
  try {
    await client.query('BEGIN');

    for (const p of data.products) {
      await client.query(
        `INSERT INTO products (id, name, subtitle, description, format, price, delivery_fee, currency, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, subtitle=EXCLUDED.subtitle, description=EXCLUDED.description,
           format=EXCLUDED.format, price=EXCLUDED.price, delivery_fee=EXCLUDED.delivery_fee,
           currency=EXCLUDED.currency, active=EXCLUDED.active`,
        [p.id, p.name, p.subtitle, p.description, p.format, p.price, p.deliveryFee ?? null, p.currency, p.active]
      );
    }

    for (const o of data.orders) {
      await client.query(
        `INSERT INTO orders (id, customer, products, subtotal, delivery_fee, total, payment_status, order_status, date, review_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           customer=EXCLUDED.customer, products=EXCLUDED.products, subtotal=EXCLUDED.subtotal,
           delivery_fee=EXCLUDED.delivery_fee, total=EXCLUDED.total, payment_status=EXCLUDED.payment_status,
           order_status=EXCLUDED.order_status, date=EXCLUDED.date, review_token=EXCLUDED.review_token`,
        [o.id, JSON.stringify(o.customer), JSON.stringify(o.products), o.subtotal, o.deliveryFee, o.total, o.paymentStatus, o.orderStatus, o.date, o.reviewToken || null]
      );
    }

    for (const pay of data.payments) {
      await client.query(
        `INSERT INTO payments (id, order_id, provider, transaction_reference, amount, currency, status, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           order_id=EXCLUDED.order_id, provider=EXCLUDED.provider, transaction_reference=EXCLUDED.transaction_reference,
           amount=EXCLUDED.amount, currency=EXCLUDED.currency, status=EXCLUDED.status, timestamp=EXCLUDED.timestamp`,
        [pay.id, pay.orderId, pay.provider, pay.transactionReference, pay.amount, pay.currency, pay.status, pay.timestamp]
      );
    }

    for (const d of data.deliveries) {
      await client.query(
        `INSERT INTO deliveries (order_id, country, region, city, address, additional_info, postal_code, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (order_id) DO UPDATE SET
           country=EXCLUDED.country, region=EXCLUDED.region, city=EXCLUDED.city, address=EXCLUDED.address,
           additional_info=EXCLUDED.additional_info, postal_code=EXCLUDED.postal_code, status=EXCLUDED.status`,
        [d.orderId, d.country, d.region, d.city, d.address, d.additionalInfo, d.postalCode, d.status]
      );
    }

    for (const e of data.entitlements) {
      await client.query(
        `INSERT INTO entitlements (order_id, customer_email, download_token, download_count, max_downloads, expiration, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (order_id) DO UPDATE SET
           customer_email=EXCLUDED.customer_email, download_token=EXCLUDED.download_token,
           download_count=EXCLUDED.download_count, max_downloads=EXCLUDED.max_downloads,
           expiration=EXCLUDED.expiration, active=EXCLUDED.active`,
        [e.orderId, e.customerEmail, e.downloadToken, e.downloadCount, e.maxDownloads, e.expiration, e.active]
      );
    }

    for (const r of data.reviews) {
      await client.query(
        `INSERT INTO reviews (id, product_id, order_id, customer_id, customer_name, customer_email, rating, review_text, format, verified, status, featured, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           product_id=EXCLUDED.product_id, order_id=EXCLUDED.order_id, customer_id=EXCLUDED.customer_id,
           customer_name=EXCLUDED.customer_name, customer_email=EXCLUDED.customer_email,
           rating=EXCLUDED.rating, review_text=EXCLUDED.review_text, format=EXCLUDED.format,
           verified=EXCLUDED.verified, status=EXCLUDED.status, featured=EXCLUDED.featured,
           created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at`,
        [r.id, r.productId, r.orderId, r.customerId, r.customerName, r.customerEmail, r.rating, r.review, r.format, r.verified, r.status, r.featured, r.createdAt, r.updatedAt]
      );
    }

    // Remove review records no longer present (e.g. deleted by an admin)
    const reviewIds = (data.reviews || []).map(r => r.id);
    await client.query('DELETE FROM reviews WHERE NOT (id = ANY($1::text[]))', [reviewIds]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Async read: returns a snapshot of the current DB state.
export async function readDb() {
  if (pgAvailable()) {
    await ensureSchema();
    memoryDb = await loadFromDb();
    return memoryDb;
  }

  // File fallback (no Postgres configured)
  if (memoryDb) return memoryDb;
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    memoryDb = JSON.parse(data);
  } catch {
    memoryDb = JSON.parse(JSON.stringify(initialData));
  }
  return memoryDb;
}

// Async write: persists the mutated data to Postgres (or file fallback).
export async function writeDb(data) {
  memoryDb = data;
  if (pgAvailable()) {
    await persistDb(data);
    return;
  }
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch {
    console.warn('Database file update skipped (read-only filesystem on Vercel)');
  }
}
