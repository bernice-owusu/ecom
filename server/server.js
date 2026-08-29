import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { readDb, writeDb } from './database.js';
import { sendThankYouEmail } from './email.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MAX_DOWNLOADS = 3;
const DOWNLOAD_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const MAX_REVIEW_LENGTH = 1000;

// Generates a unique, unguessable token used to open the post-purchase review page.
function generateReviewToken() {
  return 'RVT-' + crypto.randomBytes(24).toString('hex');
}

// Strips HTML/tags and normalizes text before it is stored.
function sanitizeText(value, maxLength = MAX_REVIEW_LENGTH) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

// Admin auth: X-Admin-Token header must match ADMIN_TOKEN (server-only env).
function isAdminAuthorized(req) {
  if (!process.env.ADMIN_TOKEN) return null; // not configured
  return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
}

function requireAdmin(req, res) {
  const authorized = isAdminAuthorized(req);
  if (authorized === null) {
    res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_TOKEN in the server environment.' });
    return false;
  }
  if (!authorized) {
    res.status(401).json({ error: 'Unauthorised admin access.' });
    return false;
  }
  return true;
}

function getReviewStats(reviews) {
  const count = status => reviews.filter(r => r.status === status).length;
  const approved = reviews.filter(r => r.status === 'Approved');
  const averageRating = approved.length
    ? Math.round((approved.reduce((sum, r) => sum + r.rating, 0) / approved.length) * 10) / 10
    : 0;
  return {
    total: reviews.length,
    pending: count('Pending'),
    approved: count('Approved'),
    rejected: count('Rejected'),
    hidden: count('Hidden'),
    featured: reviews.filter(r => r.featured).length,
    averageRating
  };
}

// Public-safe review payload (never exposes customer email).
function publicReview(r) {
  return {
    id: r.id,
    productId: r.productId,
    customerName: r.customerName,
    rating: r.rating,
    review: r.review,
    format: r.format,
    verified: r.verified,
    featured: r.featured,
    createdAt: r.createdAt
  };
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve book cover image directly from public client if needed (handled by Vite, but fallback support)
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Products API
app.get('/api/products', async (req, res) => {
  const db = await readDb();
  res.json(db.products);
});

app.put('/api/products/:id', async (req, res) => {
  const db = await readDb();
  const { id } = req.params;
  const { price, active, description } = req.body;
  
  const product = db.products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  
  if (price !== undefined) product.price = Number(price);
  if (active !== undefined) product.active = Boolean(active);
  if (description !== undefined) product.description = String(description);
  
  await writeDb(db);
  res.json(product);
});

// Checkout API - Initiates Order
app.post('/api/checkout', async (req, res) => {
  const { customer, items, shippingAddress } = req.body;
  if (!customer || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required checkout information.' });
  }

  const db = await readDb();
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

  await writeDb(db);
  res.json({ orderId, total, isPhysical });
});

// Simulated Payment Endpoint
app.post('/api/payment/simulate', async (req, res) => {
  const { orderId, method, status } = req.body; // status: 'Successful', 'Failed'
  
  const db = await readDb();
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
  
  // Generate the review token before persisting so it survives server restarts
  const paymentSuccessful = status === 'Successful' || !status;
  if (paymentSuccessful && !order.reviewToken) order.reviewToken = generateReviewToken();

  // If payment succeeded and there is a digital product, create Entitlement
  const isDigital = order.products.some(p => p.format === 'Audiobook' || p.format === 'Soft Copy');
  let downloadToken = null;

  if (paymentSuccessful && isDigital) {
    downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
    db.entitlements.push({
      orderId,
      customerEmail: order.customer.email,
      downloadToken,
      downloadCount: 0,
        maxDownloads: MAX_DOWNLOADS,
        expiration: new Date(Date.now() + DOWNLOAD_EXPIRY_MS).toISOString(), // 3 days valid
      active: true
    });
  }

  await writeDb(db);

  if (paymentSuccessful) {
    await sendThankYouEmail(order.customer.email, order.customer.name, {
      products: order.products,
      downloadToken,
      reviewToken: order.reviewToken
    });
  }

  res.json({
    paymentId,
    transactionReference: transactionRef,
    status: order.paymentStatus,
    downloadToken,
    reviewToken: order.reviewToken || null
  });
});

// Paystack Payment Verification Endpoint
app.post('/api/payment/verify', async (req, res) => {
  const { reference, orderId } = req.body;
  if (!reference || !orderId) {
    return res.status(400).json({ error: 'Missing payment reference or order ID.' });
  }

  const db = await readDb();
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

    if (!order.reviewToken) order.reviewToken = generateReviewToken();

    const isDigital = order.products.some(p => p.format === 'Audiobook' || p.format === 'Soft Copy');
    let downloadToken = null;
    if (isDigital) {
      downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
      db.entitlements.push({
        orderId,
        customerEmail: order.customer.email,
        downloadToken,
        downloadCount: 0,
        maxDownloads: MAX_DOWNLOADS,
        expiration: new Date(Date.now() + DOWNLOAD_EXPIRY_MS).toISOString(),
        active: true
      });
    }

    await writeDb(db);
    await sendThankYouEmail(order.customer.email, order.customer.name, {
      products: order.products,
      downloadToken,
      reviewToken: order.reviewToken
    });
    return res.json({
      paymentId,
      transactionReference: reference,
      status: 'Successful',
      downloadToken,
      reviewToken: order.reviewToken
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

    if (!order.reviewToken) order.reviewToken = generateReviewToken();

    const isDigital = order.products.some(p => p.format === 'Audiobook' || p.format === 'Soft Copy');
    let downloadToken = null;
    if (isDigital) {
      downloadToken = 'TOK-' + Math.random().toString(36).substr(2, 16);
      db.entitlements.push({
        orderId,
        customerEmail: order.customer.email,
        downloadToken,
        downloadCount: 0,
        maxDownloads: MAX_DOWNLOADS,
        expiration: new Date(Date.now() + DOWNLOAD_EXPIRY_MS).toISOString(),
        active: true
      });
    }

    await writeDb(db);
    await sendThankYouEmail(order.customer.email, order.customer.name, {
      products: order.products,
      downloadToken,
      reviewToken: order.reviewToken
    });
    return res.json({
      paymentId,
      transactionReference: reference,
      status: 'Successful',
      downloadToken,
      reviewToken: order.reviewToken
    });

  } catch (error) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({ error: 'Internal server error during verification.' });
  }
});


// Secure Digital Download Endpoint
app.get('/api/audiobooks/download', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<h1>Error: Download token is required</h1>');
  }

  const db = await readDb();
  const entitlement = db.entitlements.find(e => e.downloadToken === token);

  if (!entitlement || !entitlement.active) {
    return res.status(403).send('<h1>Error: Invalid or inactive download link</h1>');
  }

  if (new Date(entitlement.expiration) < new Date()) {
    entitlement.active = false;
    await writeDb(db);
    return res.status(410).send('<h1>Error: This download link has expired</h1>');
  }

  if (entitlement.downloadCount >= entitlement.maxDownloads) {
    return res.status(429).send(`<h1>Error: Download limit reached (Max ${MAX_DOWNLOADS} downloads)</h1>`);
  }

  // Increment download count
  entitlement.downloadCount += 1;
  await writeDb(db);

  // Redirect to the storage URL configured in env
  const order = db.orders.find(o => o.id === entitlement.orderId);
  const isSoftCopy = order?.products.some(p => p.format === 'Soft Copy');

  const secureUrl = (isSoftCopy ? process.env.EBOOK_STORAGE_URL : process.env.AUDIOBOOK_STORAGE_URL);
  if (!secureUrl) {
    return res.status(500).send('<h1>Error: Download storage is not configured</h1>');
  }

  return res.redirect(secureUrl);
});

// ===== Customer: validate a post-purchase review token =====
app.get('/api/reviews/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Review token is required.' });
  }

  const db = await readDb();
  const order = db.orders.find(o => o.reviewToken === token);

  if (!order) {
    return res.status(404).json({ error: 'This review link is invalid.' });
  }
  if (order.paymentStatus !== 'Successful') {
    return res.status(403).json({ error: 'This purchase was not completed successfully, so it cannot be reviewed.' });
  }
  if (db.reviews.some(r => r.orderId === order.id)) {
    return res.status(409).json({ error: 'A review for this purchase has already been submitted.' });
  }

  const product = order.products && order.products[0];
  res.json({
    valid: true,
    order: {
      orderId: order.id,
      name: order.customer.name,
      email: order.customer.email,
      product: product ? product.name : 'RESILIENCE',
      format: product ? product.format : 'Hard Copy'
    }
  });
});

// ===== Customer: submit a review =====
app.post('/api/reviews', async (req, res) => {
  const { token, rating, review, name } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Review token is required.' });
  }

  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Please select a rating between 1 and 5 stars.' });
  }

  const reviewText = sanitizeText(review, MAX_REVIEW_LENGTH);
  if (!reviewText) {
    return res.status(400).json({ error: 'Please write a short review.' });
  }

  const db = await readDb();
  const order = db.orders.find(o => o.reviewToken === token);
  if (!order) {
    return res.status(404).json({ error: 'This review link is invalid.' });
  }
  if (order.paymentStatus !== 'Successful') {
    return res.status(403).json({ error: 'This purchase was not completed successfully.' });
  }
  if (db.reviews.some(r => r.orderId === order.id)) {
    return res.status(409).json({ error: 'A review for this purchase has already been submitted.' });
  }

  const product = order.products && order.products[0];
  const now = new Date().toISOString();
  const customerName = sanitizeText(name, 120) || order.customer.name;

  const newReview = {
    id: 'REV-' + Math.floor(100000 + Math.random() * 900000),
    productId: product ? product.id : 'prod-resilience-hardcover',
    orderId: order.id,
    customerId: order.id,
    customerName,
    customerEmail: order.customer.email,
    rating: stars,
    review: reviewText,
    format: product ? product.format : 'Hard Copy',
    verified: true,
    status: 'Pending',
    featured: false,
    createdAt: now,
    updatedAt: now
  };

  db.reviews.push(newReview);
  await writeDb(db);

  res.status(201).json({
    status: 'Pending',
    message: 'Your review has been submitted successfully and is awaiting approval.'
  });
});

// ===== Public: approved reviews =====
app.get('/api/reviews', async (req, res) => {
  const { sort } = req.query;
  const db = await readDb();
  let reviews = db.reviews
    .filter(r => r.status === 'Approved')
    .map(publicReview);

  if (sort === 'highest') {
    reviews.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'lowest') {
    reviews.sort((a, b) => a.rating - b.rating);
  } else {
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json({ reviews, count: reviews.length });
});

// ===== Public: review rating summary =====
app.get('/api/reviews/summary', async (req, res) => {
  const db = await readDb();
  const approved = db.reviews.filter(r => r.status === 'Approved');
  const ratings = approved.map(r => r.rating);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach(r => { breakdown[r] += 1; });

  res.json({
    total: approved.length,
    averageRating: ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : 0,
    breakdown
  });
});

// ===== Admin: list all reviews (authenticated) =====
app.get('/api/admin/reviews', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = await readDb();
  const reviews = db.reviews
    .map(r => {
      const order = db.orders.find(o => o.id === r.orderId);
      return {
        ...r,
        paymentStatus: order ? order.paymentStatus : null
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ reviews, summary: getReviewStats(db.reviews) });
});

// ===== Admin: update review status / featured flag =====
app.patch('/api/admin/reviews/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = await readDb();
  const review = db.reviews.find(r => r.id === req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found.' });
  }

  const { status, featured } = req.body || {};
  const allowed = ['Pending', 'Approved', 'Rejected', 'Hidden'];

  if (status !== undefined) {
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid review status.' });
    }
    review.status = status;
    if (status !== 'Approved') review.featured = false;
  }

  if (featured !== undefined) {
    if (featured && review.status !== 'Approved') {
      return res.status(400).json({ error: 'A review must be approved before it can be featured.' });
    }
    review.featured = Boolean(featured);
  }

  review.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json(review);
});

// ===== Admin: delete a review =====
app.delete('/api/admin/reviews/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = await readDb();
  const index = db.reviews.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Review not found.' });
  }

  db.reviews.splice(index, 1);
  await writeDb(db);
  res.json({ success: true });
});

// Admin Dashboard stats & metrics endpoint
app.get('/api/admin/metrics', async (req, res) => {
  const db = await readDb();
  
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
app.post('/api/admin/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // e.g. 'Processing', 'Shipped', 'Delivered'
  
  const db = await readDb();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  
  order.orderStatus = status;

  // Sync delivery status if present
  const delivery = db.deliveries.find(d => d.orderId === id);
  if (delivery) {
    delivery.status = status;
  }

  await writeDb(db);
  res.json(order);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Express API Server running on port ${PORT}`);
  });
}

export default app;
