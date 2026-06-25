import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { verifyToken } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { extractYouTubeTranscript, fetchUrlText, processFiles } from '../services/input-sources.js';
import { runGeneration } from '../services/generation.js';

const router = Router();
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads/';
const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

// ── POST /api/generate ──────────────────────────────────────────────
// Synchronous path: handles FILE UPLOADS (multer + processFiles) plus typed
// prompts and reference/YouTube URLs. It assembles those sources into a single
// `allInput` string, then delegates ALL prompt assembly, credit deduction, and
// DB persistence to services/generation.js (the sole orchestrator). This route
// runs types in PARALLEL inside Vercel's 60s cap (parallel:true below); the
// worker path runs the same runGeneration sequentially.
router.post('/', verifyToken, upload.array('files', 20), async (req, res) => {
  try {
    const transcript = req.files?.length ? await processFiles(req.files) : '';
    const contentTypes = JSON.parse(req.body.contentTypes || '[]');
    const options = JSON.parse(req.body.options || '{}');
    const brandData = JSON.parse(req.body.brandData || '{}');
    const videoUrls = JSON.parse(req.body.videoUrls || '[]');
    const textPrompt = req.body.textPrompt || '';

    // Process YouTube / video URLs (file uploads are processed above; the
    // orchestrator itself stays file-less).
    const urlContents = [];
    for (const url of videoUrls) {
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube) {
        console.log(`[GEN] Extracting YouTube transcript: ${url}`);
        const ytText = await extractYouTubeTranscript(url);
        if (ytText) {
          urlContents.push(`--- YouTube Transcript: ${url} ---\n${ytText}`);
        } else {
          urlContents.push(`--- YouTube Video (transcript unavailable): ${url} ---`);
        }
      } else {
        console.log(`[GEN] Fetching reference URL content: ${url}`);
        const pageText = await fetchUrlText(url);
        if (pageText) {
          urlContents.push(`--- Reference URL Content: ${url} ---\n${pageText}`);
        } else {
          urlContents.push(`--- Reference URL (content unavailable): ${url} ---`);
        }
      }
    }

    // Build combined input from all sources (any combination works)
    const inputParts = [];
    if (textPrompt.trim()) {
      inputParts.push(`--- Topic / Prompt ---\n${textPrompt.trim()}`);
    }
    if (transcript) inputParts.push(transcript);
    if (urlContents.length) inputParts.push(urlContents.join('\n\n'));

    const allInput = inputParts.filter(Boolean).join('\n\n');
    if (!allInput.trim()) {
      return res.status(400).json({ success: false, error: 'No content provided. Add a topic, upload files, or paste a URL.' });
    }

    // Delegate prompt assembly + credit deduction + DB save to the orchestrator.
    // parallel:true keeps the route's original concurrent behaviour (blog still
    // generates first inside runGeneration, so video/newsletter can derive it).
    const out = await runGeneration({
      allInput,
      contentTypes,
      options,
      brandData,
      userId: req.user.id,
      companyId: req.user.company_id,
      parallel: true,
    });

    if (!out.ok) {
      // 402 (credit check) preserves its original body shape: { error }.
      // Any other failure code keeps the route's { success:false, error } shape.
      if (out.code === 402) return res.status(402).json({ error: out.error });
      return res.status(out.code || 500).json({ success: false, error: out.error });
    }

    res.json({ success: true, content: out.results });
  } catch (err) {
    console.error('[GEN] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Always clean up uploaded temp files
    if (req.files) {
      for (const f of req.files) await fs.unlink(f.path).catch(() => {});
    }
  }
});

// ── POST /api/generate/enqueue ──────────────────────────────────────
// Queue a background generation job for the Cloud Run worker to pick up.
// Returns { jobId } immediately; the browser polls generation_jobs (see
// src/components/GenerationContext.jsx) and can navigate away. Handles typed prompts +
// reference/YouTube URLs (file uploads still use the synchronous route above).
router.post('/enqueue', verifyToken, async (req, res) => {
  try {
    const { contentTypes = [], options = {}, brandData = {}, textPrompt = '', videoUrls = [] } = req.body || {};
    if (!Array.isArray(contentTypes) || contentTypes.length === 0) {
      return res.status(400).json({ error: 'No content types selected' });
    }
    const { data: job, error } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id || null,
        status: 'pending',
        content_types: contentTypes,
        input: { contentTypes, options, brandData, textPrompt, videoUrls },
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ jobId: job.id });
  } catch (err) {
    console.error('[GEN] enqueue error:', err.message);
    res.status(500).json({ error: 'Failed to enqueue generation' });
  }
});

export default router;
