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

// Renders a branded, elegant error page for download/entitlement failures.
function renderErrorPage({ title, message, hint }) {
  const shopUrl = (
    process.env.SITE_BASE_URL ||
    (process.env.VERCEL ? "https://shop.thomasbaafi.com" : "http://localhost:5173")
  ).replace(/\/$/, "");

  const safe = (s = "") =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safe(title)} · Thomas Baafi</title>
<style>
  :root {
    --font-primary: 'Raleway', sans-serif;
    --font-secondary: 'Montserrat', sans-serif;
    --color-dark: #1f1f1f;
    --color-medium: #5f5f5f;
    --color-border: #e0e0e0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: var(--font-primary);
    color: var(--color-medium);
    background: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    max-width: 460px;
    width: 100%;
    text-align: center;
    background: #ffffff;
    border: 1px solid rgba(224, 224, 224, 0.7);
    border-radius: 20px;
    padding: 52px 40px 40px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04), 0 24px 60px rgba(0,0,0,0.18);
  }
  .badge {
    width: 68px;
    height: 68px;
    margin: 0 auto 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    background: linear-gradient(135deg, #fafafa, #f0f0f0);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.06);
  }
  .eyebrow {
    font-family: var(--font-secondary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--color-medium);
    margin-bottom: 10px;
  }
  h1 {
    font-family: var(--font-secondary);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--color-dark);
    line-height: 1.35;
    margin-bottom: 14px;
  }
  p.message {
    font-size: 15.5px;
    line-height: 1.7;
    color: var(--color-medium);
    margin-bottom: 26px;
  }
  p.hint {
    font-size: 13.5px;
    line-height: 1.65;
    color: #8a8a8a;
    margin-bottom: 30px;
  }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .btn {
    display: inline-block;
    background: var(--color-dark);
    color: #fff;
    border: 1px solid var(--color-dark);
    padding: 13px 22px;
    font-family: var(--font-secondary);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-decoration: none;
    border-radius: 999px;
    transition: all 0.3s ease;
  }
  .btn:hover { background: transparent; color: var(--color-dark); }
  .btn-ghost {
    background: transparent;
    color: var(--color-dark);
    border: 1px solid var(--color-border);
  }
  .btn-ghost:hover { border-color: var(--color-dark); background: #fcfcfc; }
  .foot {
    margin-top: 28px;
    font-family: var(--font-secondary);
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #9a9a9a;
  }
</style>
</head>
<body>
  <div class="card" role="alert">
    <div class="badge" aria-hidden="true">📖</div>
    <p class="eyebrow">RESILIENCE · Thomas Baafi</p>
    <h1>${safe(title)}</h1>
    <p class="message">${safe(message)}</p>
    ${hint ? `<p class="hint">${safe(hint)}</p>` : ""}
    <div class="actions">
      <a class="btn" href="${shopUrl}">Back to shop</a>
      <a class="btn btn-ghost" href="mailto:info@thomasbaafi.com">Contact support</a>
    </div>
    <p class="foot">RESILIENCE &nbsp;·&nbsp; By Thomas Baafi</p>
  </div>
</body>
</html>`;
}

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
  const deliveryFee = physicalItem ? (hardCopyProduct?.deliveryFee || 0) : 0;
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
    return res.status(400).send(renderErrorPage({
      title: 'Download link missing',
      message: 'This download link is incomplete. Please use the link that was sent to your email.',
      hint: 'If the link still doesn\'t work, contact support and we\'ll get you sorted right away.'
    }));
  }

  const db = await readDb();
  const entitlement = db.entitlements.find(e => e.downloadToken === token);

  if (!entitlement || !entitlement.active) {
    return res.status(403).send(renderErrorPage({
      title: 'Invalid download link',
      message: 'This download link is no longer valid or hasn\'t been activated yet.',
      hint: 'Please check the link in your confirmation email. If it still doesn\'t work, get in touch and we\'ll help.' 
    }));
  }

  if (new Date(entitlement.expiration) < new Date()) {
    entitlement.active = false;
    await writeDb(db);
    return res.status(410).send(renderErrorPage({
      title: 'Download link expired',
      message: 'Your download link has expired. Links are valid for a limited window to keep your purchase secure.',
      hint: 'If you missed the window or need a fresh link, contact support and we\'ll send a new one.'
    }));
  }

  if (entitlement.downloadCount >= entitlement.maxDownloads) {
    return res.status(429).send(renderErrorPage({
      title: 'Download limit reached',
      message: `This link has reached its download limit of ${MAX_DOWNLOADS}. Each purchase includes a limited number of downloads to protect your content.`,
      hint: 'Need another download? Just reach out to support and we\'ll restore access for you.'
    }));
  }

  // Increment download count
  entitlement.downloadCount += 1;
  await writeDb(db);

  // Redirect to the storage URL configured in env
  const order = db.orders.find(o => o.id === entitlement.orderId);
  const isSoftCopy = order?.products.some(p => p.format === 'Soft Copy');

  const secureUrl = (isSoftCopy ? process.env.EBOOK_STORAGE_URL : process.env.AUDIOBOOK_STORAGE_URL);
  if (!secureUrl) {
    return res.status(500).send(renderErrorPage({
      title: 'Download unavailable',
      message: 'The download service is temporarily unavailable. Please try again in a few minutes.',
      hint: 'No downloads were used while trying to load this file.'
    }));
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
  if (!requireAdmin(req, res)) return;

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
    products: db.products,
    payments: db.payments,
    deliveries: db.deliveries,
    entitlements: db.entitlements
  });
});

// Admin Order Status Update
app.post('/api/admin/orders/:id/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;

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
