import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import campaignRoutes from './routes/campaign.js';
import detectToneRoutes from './routes/detect-tone.js';
import plannerRoutes from './routes/planner.js';
import { errorHandler } from './middleware/error-handler.js';
import { TEXT_MODEL, IMAGE_MODEL } from './config/gemini.js';
import { startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/generated', express.static(path.join(ROOT_DIR, 'generated')));

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api', imageRoutes);           // /api/generate-image, /api/generate-image-suite
app.use('/api/brands', brandRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/generate-tts', ttsRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/auth/linkedin', linkedinOAuthRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/detect-tone', detectToneRoutes);
app.use('/api/planner', plannerRoutes);

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
const PORT = process.env.PORT || 4321;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[SCRIBESHIFT] API on http://localhost:${PORT}`);
  console.log(`[SCRIBESHIFT] Text: ${TEXT_MODEL} | Image: ${IMAGE_MODEL}`);
  console.log(`[SCRIBESHIFT] Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'not configured'}`);

  // Start post scheduler
  startScheduler();
});
