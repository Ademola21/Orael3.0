import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

import { initDB, checkAndRunDraws, getUser, updateUser, addTransaction } from './db.js';
import verifyTelegramInitData from './auth.js';
import { generalLimit, actionLimit, webhookLimit, sensitiveLimit } from './middleware/rateLimit.js';
import { verifyWebhookSignature } from './services/flutterwave.js';

// Route Imports
import userRoutes from './routes/user.js';
import miningRoutes from './routes/mining.js';
import playRoutes from './routes/play.js';
import earnRoutes from './routes/earn.js';
import walletRoutes, { handleFlutterwaveWebhook } from './routes/wallet.js';
import leaderboardRoutes from './routes/leaderboard.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

// ─── Public webhook endpoints (signature-verified, NOT Telegram-auth-verified) ───
// Flutterwave webhook — receives transfer.completed + singlebillpayment.status events
// No per-user rate limit (no telegramUser). Signature verification is the protection.
app.post('/api/flutterwave-webhook', handleFlutterwaveWebhook);

// Body parsing middleware — 10kb limit to prevent abuse
app.use(express.json({ limit: '10kb' }));

// ─── Security: HTTPS redirect (production only) ───────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Allow webhook endpoints to skip HTTPS redirect (Flutterwave may POST over HTTP from some regions)
    if (req.path === '/api/flutterwave-webhook' || req.path === '/api/adsgram-callback') {
      return next();
    }
    // Check for HTTPS via Cloudflare/proxy headers
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    if (!isHttps) {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

// Simple request logger — sanitized (no PII, no tokens, no amounts)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Sanitize URL — strip query params (may contain tokens)
    const safePath = req.path;
    console.log(`[HTTP] ${req.method} ${safePath} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Configure CORS
const DOMAIN = process.env.DOMAIN || 'https://yorubacinemax.xyz';
app.use(cors({
  origin: [DOMAIN, 'http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Basic Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS — force HTTPS for 1 year (production only, HTTPS only)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content-Security-Policy — restrict script/style/img sources
  // Allowed: self, Telegram SDK, Adsgram SDK, Google Fonts
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://telegram.org https://sad.adsgram.ai https://*.adsgram.ai",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.telegram.org https://sad.adsgram.ai https://*.adsgram.ai",
    "frame-src 'self' https://oauth.telegram.org https://sad.adsgram.ai https://*.adsgram.ai",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));

  // Permissions Policy — disable camera/microphone/geolocation
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
});

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Client ad error logging
app.post('/api/log-ad-error', (req, res) => {
  const { userId, error, blockId } = req.body;
  console.log(`[Client Ad Error] User: ${userId || 'unknown'}, Block: ${blockId || 'unknown'}, Error:`, JSON.stringify(error));
  res.json({ success: true });
});

// Adsgram callback verification endpoint (public)
app.get('/api/adsgram-callback', async (req, res) => {
  const { blockId, userId, reward, hash, secret } = req.query;
  const configuredSecret = process.env.ADSGRAM_SECRET || 'your_adsgram_secret_here';

  // 1. Check if verifying via simple secret token (standard Adsgram dashboard integration)
  if (secret && secret === configuredSecret) {
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    
    try {
      const dbUser = await getUser(userId);
      if (dbUser) {
        const rewardAmount = parseInt(reward) || 30;
        dbUser.balance += rewardAmount;
        await addTransaction(dbUser.id, 'ad', rewardAmount, 'Adsgram ad reward');
        await updateUser(dbUser);
        console.log(`[Adsgram Callback] Successfully credited ${rewardAmount} ORL to user ${userId} via secret token`);
      } else {
        console.warn(`[Adsgram Callback] User ${userId} not found in database`);
      }
    } catch (dbErr) {
      console.error('[Adsgram Callback] Database error:', dbErr);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json({ success: true, message: 'Reward verified and credited successfully via secret' });
  }

  // 2. Check if verifying via cryptographic hash (placeholder/anti-cheat signature)
  if (hash) {
    if (!blockId || !userId || !reward) {
      return res.status(400).json({ error: 'Missing required parameters for signature verification' });
    }

    // Calculate hash: sha256(blockId:userId:reward:configuredSecret)
    const computedHash = crypto
      .createHash('sha256')
      .update(`${blockId}:${userId}:${reward}:${configuredSecret}`)
      .digest('hex');

    if (hash !== computedHash) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
      const dbUser = await getUser(userId);
      if (dbUser) {
        const rewardAmount = parseInt(reward) || 30;
        dbUser.balance += rewardAmount;
        await addTransaction(dbUser.id, 'ad', rewardAmount, 'Adsgram ad reward');
        await updateUser(dbUser);
        console.log(`[Adsgram Callback] Successfully credited ${rewardAmount} ORL to user ${userId} via signature`);
      } else {
        console.warn(`[Adsgram Callback] User ${userId} not found in database`);
      }
    } catch (dbErr) {
      console.error('[Adsgram Callback] Database error:', dbErr);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json({ success: true, message: 'Reward verified and credited successfully via signature' });
  }

  return res.status(400).json({ error: 'Missing verification credentials (hash or secret)' });
});

// NOTE: Offerwall callback endpoints (Mmwall, ayeT-Studios, BitcoTasks)
// were removed because those networks do not support Telegram Mini Apps.
// Only Adsgram rewarded video + Adsgram Tasks web component remain.

// Flutterwave webhook is mounted INSIDE /api/wallet routes (POST /flutterwave-webhook)
// It's signature-verified, not Telegram-auth-verified, so it bypasses the
// verifyTelegramInitData middleware naturally because it's a sub-route.

// Mount Routes (auth is applied as middleware, meaning initData is required)
app.use('/api/user', verifyTelegramInitData, generalLimit, userRoutes);
app.use('/api/mining', verifyTelegramInitData, generalLimit, actionLimit, miningRoutes);
app.use('/api/play', verifyTelegramInitData, generalLimit, actionLimit, playRoutes);
app.use('/api/earn', verifyTelegramInitData, generalLimit, actionLimit, earnRoutes);
app.use('/api/wallet', verifyTelegramInitData, generalLimit, actionLimit, walletRoutes);
app.use('/api/leaderboard', verifyTelegramInitData, generalLimit, leaderboardRoutes);
app.use('/api/admin', verifyTelegramInitData, generalLimit, adminRoutes);

// In production, serve static front-end assets
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      }
    }
  }));

  // Serve admin panel at /admin
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(distPath, 'admin.html'));
  });
  app.get('/admin.js', (req, res) => {
    res.sendFile(path.join(distPath, 'admin.js'));
  });

  // Catch-all route to serve the built index.html
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Dev mode: serve admin panel from public dir
  const publicPath = path.resolve(__dirname, '..', 'public');
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicPath, 'admin.html'));
  });
  app.get('/admin.js', (req, res) => {
    res.sendFile(path.join(publicPath, 'admin.js'));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database then start listening
async function startServer() {
  try {
    console.log('Initializing Orael Database...');
    await initDB();
    console.log('Database initialized successfully.');

    console.log('Checking lottery draws...');
    checkAndRunDraws();

    // Start background cron jobs (Flutterwave polling, DB backups, weekly leaderboard)
    const { startCronJobs } = await import('./services/cron.js');
    startCronJobs();

    app.listen(PORT, () => {
      console.log(`\n🚀 Orael server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Domain: ${DOMAIN}`);
      console.log(`   Database Path: data/orael.db\n`);
    });
  } catch (error) {
    console.error('Failed to start Orael server:', error);
    process.exit(1);
  }
}

startServer();
