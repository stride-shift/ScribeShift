import 'dotenv/config';
import { Agent, setGlobalDispatcher } from 'undici';
// Fix Node 22 fetch timeout on Windows — disable IPv6 auto-select
// which causes ETIMEDOUT on LinkedIn, Twitter, and other APIs
setGlobalDispatcher(new Agent({ connect: { autoSelectFamily: false } }));

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Route modules
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import generateRoutes from './routes/generate.js';
import imageRoutes from './routes/images.js';
import brandRoutes from './routes/brands.js';
import contentRoutes from './routes/content.js';
import scheduleRoutes from './routes/schedule.js';
import metricsRoutes from './routes/metrics.js';
import ttsRoutes from './routes/tts.js';
import credentialsRoutes from './routes/credentials.js';
import linkedinOAuthRoutes from './routes/linkedin-oauth.js';
import twitterOAuthRoutes from './routes/twitter-oauth.js';
import facebookOAuthRoutes from './routes/facebook-oauth.js';
import instagramOAuthRoutes from './routes/instagram-oauth.js';
import googleCalendarRoutes from './routes/google-calendar.js';
import campaignRoutes from './routes/campaign.js';
import detectToneRoutes from './routes/detect-tone.js';
import plannerRoutes from './routes/planner.js';
import cronRoutes from './routes/cron.js';
import { errorHandler } from './middleware/error-handler.js';
import { TEXT_MODEL, IMAGE_MODEL } from './config/gemini.js';
import { checkDuePosts } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();

// ── Rate limiters ────────────────────────────────────────────────────
// Auth limiter — applies to /api/auth (login/signup/me).
// Status checks for OAuth providers are mounted earlier with their own oauthLimiter.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Generation rate limit exceeded. Please wait a moment.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// OAuth limiter — generous because status checks fire on every page focus
const oauthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OAuth requests. Please wait a moment.' },
});

// ── Middleware ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://*.supabase.in"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://*.supabase.in", "https://generativelanguage.googleapis.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// ── Routes ──────────────────────────────────────────────────────────
// IMPORTANT: more specific routes (e.g. /api/auth/linkedin) must be registered
// BEFORE less specific ones (e.g. /api/auth) so middleware doesn't double-up.
app.use('/api/auth/linkedin', oauthLimiter, linkedinOAuthRoutes);
app.use('/api/auth/twitter', oauthLimiter, twitterOAuthRoutes);
app.use('/api/auth/facebook', oauthLimiter, facebookOAuthRoutes);
app.use('/api/auth/instagram', oauthLimiter, instagramOAuthRoutes);
app.use('/api/auth/google-calendar', oauthLimiter, googleCalendarRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/generate', generateLimiter, generateRoutes);
// Image routes (limiter is applied inside the router, not here, to avoid
// catching unrelated /api/* requests)
app.use('/api', imageRoutes);
app.use('/api/brands', apiLimiter, brandRoutes);
app.use('/api/content', apiLimiter, contentRoutes);
app.use('/api/schedule', apiLimiter, scheduleRoutes);
app.use('/api/metrics', apiLimiter, metricsRoutes);
app.use('/api/generate-tts', generateLimiter, ttsRoutes);
app.use('/api/credentials', apiLimiter, credentialsRoutes);
app.use('/api/campaign', apiLimiter, campaignRoutes);
app.use('/api/detect-tone', generateLimiter, detectToneRoutes);
app.use('/api/planner', apiLimiter, plannerRoutes);
app.use('/api/cron', cronRoutes);

// ── Health check ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    supabase: !!process.env.SUPABASE_URL,
  });
});

// ── Error handler ───────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4321;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[SCRIBESHIFT] API on http://localhost:${PORT}`);
    console.log(`[SCRIBESHIFT] Text: ${TEXT_MODEL} | Image: ${IMAGE_MODEL}`);
    console.log(`[SCRIBESHIFT] Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'not configured'}`);

    // Check for due posts on startup (cron handles ongoing checks)
    checkDuePosts();
  });
}

export default app;
