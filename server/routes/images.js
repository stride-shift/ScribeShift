import { Router } from 'express';
import { geminiImageWithParts, buildImageParts } from '../config/gemini.js';
import { IMAGE_STYLE_MAP, injectBrand } from '../../skills.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';

const router = Router();

// ── POST /api/generate-image ────────────────────────────────────────
router.post('/generate-image', verifyToken, async (req, res) => {
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

// ── POST /api/generate-image-suite ──────────────────────────────────
router.post('/generate-image-suite', verifyToken, async (req, res) => {
  try {
    const { topicSummary, brandData, selectedStyles, customGuidelines, customStylePrompt } = req.body;
    if (!topicSummary) return res.status(400).json({ success: false, error: 'No topic provided' });

    // Compute styles first so we know the real cost
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

    // Check credits — cost scales with number of styles (3 credits per style)
    const creditCheck = await checkCredits(req.user.company_id, 'generate_image_suite', styleEntries.length);
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    const variantInstructions = [
      'Focus on the main concept with a centered composition.',
      'Try an alternative composition with asymmetric layout.',
      'Use a different visual metaphor or perspective.',
    ];

    // Build all generation tasks upfront
    const tasks = [];
    for (const { key, promptTemplate } of styleEntries) {
      const basePrompt = injectBrand(promptTemplate, { ...brandData, topicSummary });
      for (let v = 0; v < 3; v++) {
        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;
        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }
        tasks.push({ key, variant: v, prompt });
      }
    }

    // Generate in parallel batches of 3 to stay within rate limits
    const BATCH_SIZE = 3;
    const results = [];
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      if (i > 0) {
        console.log(`[SUITE] Waiting 2s before next batch...`);
        await new Promise(r => setTimeout(r, 2000));
      }
      const batchResults = await Promise.all(batch.map(({ key, variant, prompt }) => {
        const parts = buildImageParts(prompt, brandData?.logoBase64);
        console.log(`[SUITE] Generating ${key} variant ${variant + 1}...`);
        return geminiImageWithParts(parts).then(result => ({ style: key, variant, prompt, ...result }));
      }));
      results.push(...batchResults);
    }

    await deductCredits(req.user.id, req.user.company_id, 'generate_image_suite', creditCheck.cost, {
      styles: styleKeys,
      image_count: tasks.length,
    });

    res.json({ success: true, images: results });
  } catch (err) {
    console.error('[SUITE] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
