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

// ── POST /api/build-image-prompts ───────────────────────────────────
// Returns the list of prompts for the frontend to generate one at a time
router.post('/build-image-prompts', verifyToken, async (req, res) => {
  try {
    const { topicSummary, brandData, selectedStyles, customGuidelines, customStylePrompt } = req.body;
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

    const prompts = [];
    for (const { key, promptTemplate } of styleEntries) {
      const basePrompt = injectBrand(promptTemplate, { ...brandData, topicSummary });
      for (let v = 0; v < 3; v++) {
        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;
        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }
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
