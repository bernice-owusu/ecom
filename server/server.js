import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { readDb, writeDb } from './database.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve book cover image directly from public client if needed (handled by Vite, but fallback support)
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Products API
app.get('/api/products', (req, res) => {
  const db = readDb();
  res.json(db.products);
});

app.put('/api/products/:id', (req, res) => {
  const db = readDb();
  const { id } = req.params;
  const { price, active, description } = req.body;
  
  const product = db.products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  
  if (price !== undefined) product.price = Number(price);
  if (active !== undefined) product.active = Boolean(active);
  if (description !== undefined) product.description = String(description);
  
  writeDb(db);
  res.json(product);
});

// Checkout API - Initiates Order
app.post('/api/checkout', (req, res) => {
  const { customer, items, shippingAddress } = req.body;
  if (!customer || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required checkout information.' });
  }

  const db = readDb();
  const orderId = 'TB-' + Math.floor(100000 + Math.random() * 900000);
  
  // Calculate pricing based on matching products in db
  let subtotal = 0;
  const orderedProducts = [];
  
  for (const item of items) {
    const prod = db.products.find(p => p.id === item.id);
    if (!prod || !prod.active) {
      return res.status(400).json({ error: `Product ${item.id} is unavailable.` });
    }
    subtotal += prod.price * item.quantity;
    orderedProducts.push({
      id: prod.id,
      name: prod.name,
      format: prod.format,
      price: prod.price,
      quantity: item.quantity
    });
  }

  const physicalItem = orderedProducts.find(p => p.format === 'Hard Copy');
  const isPhysical = !!physicalItem;
  const hardCopyProduct = db.products.find(p => p.format === 'Hard Copy');
  const deliveryFee = physicalItem ? (hardCopyProduct?.deliveryFee || 0.1) : 0;
  const total = subtotal + deliveryFee;

  const newOrder = {
    id: orderId,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    },
    products: orderedProducts,
    subtotal,
    deliveryFee,
    total,
    paymentStatus: 'Pending',
    orderStatus: isPhysical ? 'Payment Received' : 'Completed',
    date: new Date().toISOString()
  };

  db.orders.push(newOrder);

  if (isPhysical && shippingAddress) {
    db.deliveries.push({
      orderId,
      country: shippingAddress.country,
      region: shippingAddress.region,
      city: shippingAddress.city,
      address: shippingAddress.address,
      additionalInfo: shippingAddress.additionalInfo,
      postalCode: shippingAddress.postalCode,
      status: 'Processing'
    });
  }

  writeDb(db);
  res.json({ orderId, total, isPhysical });
});

// Simulated Payment Endpoint
app.post('/api/payment/simulate', (req, res) => {
  const { orderId, method, status } = req.body; // status: 'Successful', 'Failed'
  
  const db = readDb();
  const order = db.orders.find(o => o.id === orderId);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const paymentId = 'PAY-' + Math.floor(100000 + Math.random() * 900000);
  const transactionRef = 'REF-' + Math.random().toString(36).substr(2, 9).toUpperCase();

  const newPayment = {
    id: paymentId,
    orderId,
    provider: method, // 'Mobile Money' or 'Card'
    transactionReference: transactionRef,
    amount: order.total,
    currency: 'GHS',
    status: status || 'Successful',
    timestamp: new Date().toISOString()
  };

  db.payments.push(newPayment);

  // Update order payment status
  order.paymentStatus = status || 'Successful';
  
  // If payment succeeded and there is an audiobook, create Entitlement
  const hasAudiobook = order.products.some(p => p.format === 'Audiobook');
  let downloadToken = null;

  if ((status === 'Successful' || !status) && hasAudiobook) {
    downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
    db.entitlements.push({
      orderId,
      customerEmail: order.customer.email,
      downloadToken,
      downloadCount: 0,
      maxDownloads: 5,
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days valid
      active: true
    });
  }

  writeDb(db);

  res.json({
    paymentId,
    transactionReference: transactionRef,
    status: order.paymentStatus,
    downloadToken
  });
});

// Paystack Payment Verification Endpoint
app.post('/api/payment/verify', async (req, res) => {
  const { reference, orderId } = req.body;
  if (!reference || !orderId) {
    return res.status(400).json({ error: 'Missing payment reference or order ID.' });
  }

  const db = readDb();
  const order = db.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const isFallbackSimulated = !secretKey || secretKey.includes('your_paystack_secret_key');

  if (isFallbackSimulated) {
    const paymentId = 'PAY-' + Math.floor(100000 + Math.random() * 900000);
    const newPayment = {
      id: paymentId,
      orderId,
      provider: 'Paystack (Simulated)',
      transactionReference: reference,
      amount: order.total,
      currency: 'GHS',
      status: 'Successful',
      timestamp: new Date().toISOString()
    };

    db.payments.push(newPayment);
    order.paymentStatus = 'Successful';

    const hasAudiobook = order.products.some(p => p.format === 'Audiobook');
    let downloadToken = null;
    if (hasAudiobook) {
      downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
      db.entitlements.push({
        orderId,
        customerEmail: order.customer.email,
        downloadToken,
        downloadCount: 0,
        maxDownloads: 5,
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        active: true
      });
    }

    writeDb(db);
    return res.json({
      paymentId,
      transactionReference: reference,
      status: 'Successful',
      downloadToken
    });
  }

  try {
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data.status !== 'success') {
      return res.status(400).json({ error: paystackData.message || 'Payment verification failed.' });
    }

    const expectedAmountSubunit = Math.round(order.total * 100);
    const actualAmountSubunit = paystackData.data.amount;
    const actualCurrency = paystackData.data.currency;

    if (actualAmountSubunit < expectedAmountSubunit || actualCurrency !== 'GHS') {
      return res.status(400).json({ error: 'Payment details mismatch (amount or currency).' });
    }

    const paymentId = 'PAY-' + Math.floor(100000 + Math.random() * 900000);
    const newPayment = {
      id: paymentId,
      orderId,
      provider: 'Paystack',
      transactionReference: reference,
      amount: order.total,
      currency: 'GHS',
      status: 'Successful',
      timestamp: new Date().toISOString()
    };

    db.payments.push(newPayment);
    order.paymentStatus = 'Successful';

    const hasAudiobook = order.products.some(p => p.format === 'Audiobook');
    let downloadToken = null;
    if (hasAudiobook) {
      downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
      db.entitlements.push({
        orderId,
        customerEmail: order.customer.email,
        downloadToken,
        downloadCount: 0,
        maxDownloads: 5,
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        active: true
      });
    }

    writeDb(db);
    return res.json({
      paymentId,
      transactionReference: reference,
      status: 'Successful',
      downloadToken
    });

  } catch (error) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({ error: 'Internal server error during verification.' });
  }
});


// Secure Audiobook Download Endpoint
app.get('/api/audiobooks/download', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<h1>Error: Download token is required</h1>');
  }

  const db = readDb();
  const entitlement = db.entitlements.find(e => e.downloadToken === token);

  if (!entitlement || !entitlement.active) {
    return res.status(403).send('<h1>Error: Invalid or inactive download link</h1>');
  }

  if (new Date(entitlement.expiration) < new Date()) {
    entitlement.active = false;
    writeDb(db);
    return res.status(410).send('<h1>Error: This download link has expired</h1>');
  }

  if (entitlement.downloadCount >= entitlement.maxDownloads) {
    return res.status(429).send('<h1>Error: Download limit reached (Max 5 downloads)</h1>');
  }

  // Increment download count
  entitlement.downloadCount += 1;
  writeDb(db);

  // Secure redirect or fallback streaming based on environment configuration
  const vercelBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const isVercelBlobConfigured = vercelBlobToken && !vercelBlobToken.includes('your_vercel_blob_token');

  if (isVercelBlobConfigured) {
    const secureAudiobookUrl = process.env.AUDIOBOOK_STORAGE_URL || 'https://your-app-id.public.blob.vercel-storage.com/resilience_audiobook.mp3';
    return res.redirect(secureAudiobookUrl);
  }

  // Fallback to local mock file download for development
  const audiobookFile = path.join(process.cwd(), 'server', 'audiobooks', 'resilience_audiobook.mp3');
  
  if (!fs.existsSync(audiobookFile)) {
    return res.status(404).send('<h1>Error: Audiobook file template is missing on server</h1>');
  }

  res.setHeader('Content-Disposition', 'attachment; filename="Resilience_Thomas_Baafi.mp3"');
  res.setHeader('Content-Type', 'audio/mpeg');
  
  const stream = fs.createReadStream(audiobookFile);
  stream.pipe(res);
});

// Admin Dashboard stats & metrics endpoint
app.get('/api/admin/metrics', (req, res) => {
  const db = readDb();
  
  const paidOrders = db.orders.filter(o => o.paymentStatus === 'Successful');
  const pendingPayments = db.orders.filter(o => o.paymentStatus === 'Pending');
  
  const revenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  
  // Audiobook download statistics
  const downloads = db.entitlements.reduce((sum, e) => sum + e.downloadCount, 0);

  res.json({
    totalOrders: db.orders.length,
    paidOrders: paidOrders.length,
    pendingPayments: pendingPayments.length,
    revenue,
    downloads,
    orders: db.orders,
    deliveries: db.deliveries
  });
});

// Admin Order Status Update
app.post('/api/admin/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // e.g. 'Processing', 'Shipped', 'Delivered'
  
  const db = readDb();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  
  order.orderStatus = status;

  // Sync delivery status if present
  const delivery = db.deliveries.find(d => d.orderId === id);
  if (delivery) {
    delivery.status = status;
  }

  writeDb(db);
  res.json(order);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Express API Server running on port ${PORT}`);
  });
}

export default app;
