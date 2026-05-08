import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { geminiImageWithParts, buildImageParts } from '../config/gemini.js';
import { IMAGE_STYLE_MAP, injectBrand } from '../config/skills.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';

const router = Router();

// Image generation rate limiter (10/min) — applied per-route here so it
// doesn't accidentally catch unrelated /api/* requests at the mount point.
const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Image generation rate limit exceeded. Please wait a moment.' },
});

// ── POST /api/generate-image ────────────────────────────────────────
router.post('/generate-image', imageLimiter, verifyToken, async (req, res) => {
  try {
    const { prompt, logoBase64 } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'No prompt provided' });

    const creditCheck = await checkCredits(req.user.company_id, 'generate_image');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    console.log(`[IMAGE] Single generation: ${prompt.substring(0, 80)}...`);
    const parts = buildImageParts(prompt, logoBase64);
    const result = await geminiImageWithParts(parts);

    if (result.success) {
      await deductCredits(req.user.id, req.user.company_id, 'generate_image', 1, { prompt: prompt.substring(0, 200) });
    }

    res.json(result);
  } catch (err) {
    console.error('[IMAGE] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/edit-image ────────────────────────────────────────────
// Sends the existing image + edit instruction to Gemini for in-place editing.
// Unlike generate-image, this preserves the original image and only modifies what's requested.
router.post('/edit-image', imageLimiter, verifyToken, async (req, res) => {
  try {
    const { originalBase64, originalMimeType, editInstruction, logoBase64 } = req.body;
    if (!originalBase64 || !editInstruction) {
      return res.status(400).json({ success: false, error: 'Original image and edit instruction required' });
    }

    const creditCheck = await checkCredits(req.user.company_id, 'generate_image');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    console.log(`[IMAGE-EDIT] Editing: ${editInstruction.substring(0, 80)}...`);

    // Build parts: original image + edit instruction
    const parts = [
      {
        inline_data: {
          mime_type: originalMimeType || 'image/png',
          data: originalBase64,
        },
      },
      {
        text: `Edit this image with the following changes. Keep everything else the same — only modify what is specifically requested:\n\n${editInstruction}`,
      },
    ];

    // Include logo if provided
    if (logoBase64) {
      parts.push({
        inline_data: { mime_type: 'image/png', data: logoBase64 },
      });
      parts[1].text += '\n\nNote: The brand logo is also provided. Keep it in the image if it was there before.';
    }

    const result = await geminiImageWithParts(parts);

    if (result.success) {
      await deductCredits(req.user.id, req.user.company_id, 'generate_image', 1, {
        type: 'edit',
        instruction: editInstruction.substring(0, 200),
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[IMAGE-EDIT] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/build-image-prompts ───────────────────────────────────
// Returns the list of prompts for the frontend to generate one at a time
router.post('/build-image-prompts', imageLimiter, verifyToken, async (req, res) => {
  try {
    const { topicSummary, brandData, selectedStyles, customGuidelines, customStylePrompt, avoidList } = req.body;
    if (!topicSummary) return res.status(400).json({ success: false, error: 'No topic provided' });

    const styleEntries = [];
    const styleKeys = selectedStyles && selectedStyles.length > 0
      ? selectedStyles.filter(k => IMAGE_STYLE_MAP[k])
      : ['minimal', 'vibrant', 'editorial'];

    for (const key of styleKeys) {
      styleEntries.push({ key, promptTemplate: IMAGE_STYLE_MAP[key] });
    }

    if (customStylePrompt && customStylePrompt.trim()) {
      styleEntries.push({ key: 'custom', promptTemplate: customStylePrompt.trim() });
    }

    const variantInstructions = [
      'Focus on the main concept with a centered composition.',
      'Try an alternative composition with asymmetric layout.',
      'Use a different visual metaphor or perspective.',
    ];

    const avoidBlock = avoidList && avoidList.trim()
      ? `\n\nDO NOT include any of the following. Treat these as hard exclusions:\n${avoidList.trim()}`
      : '';

    const prompts = [];
    for (const { key, promptTemplate } of styleEntries) {
      const basePrompt = injectBrand(promptTemplate, { ...brandData, topicSummary });
      for (let v = 0; v < 3; v++) {
        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;
        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }
        prompt += avoidBlock;
        prompts.push({ style: key, variant: v, prompt });
      }
    }

    res.json({ success: true, prompts });
  } catch (err) {
    console.error('[PROMPTS] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
