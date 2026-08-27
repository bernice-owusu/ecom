// Minimal SQLite backend mock or database connector
// Using file-based JSON database for simplicity, robustness, and ease of porting on Windows workspace.
import fs from 'fs';
import path from 'path';

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
      deliveryFee: 0.1,
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
      description: "Complete digital eBook edition in PDF and ePub formats. Link is generated instantly on payment confirmation.",
      format: "Soft Copy",
      price: 0.15,
      currency: "GHS",
      active: true
    }
  ],
  orders: [],
  payments: [],
  deliveries: [],
  entitlements: []
};

// Ensure db directory exists
try {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
} catch (err) {
  console.warn('DB folder initialization skipped (read-only filesystem on Vercel)');
}

let memoryDb = null;

export function readDb() {
  if (memoryDb) {
    return memoryDb;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    memoryDb = JSON.parse(data);
    return memoryDb;
  } catch (err) {
    memoryDb = initialData;
    return initialData;
  }
}

export function writeDb(data) {
  memoryDb = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Database file update skipped (read-only filesystem on Vercel)');
  }
}
