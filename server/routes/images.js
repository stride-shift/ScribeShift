import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { geminiImageWithParts, buildImageParts } from '../services/gemini-client.js';
import { IMAGE_STYLE_MAP, IMAGE_STYLE_BRAND_ALIGNED, injectBrand } from '../config/skills.js';
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
    const { prompt, logoBase64, referenceImageBase64, referenceImageMimeType } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'No prompt provided' });

    const creditCheck = await checkCredits(req.user.company_id, 'generate_image');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    console.log(`[IMAGE] Single generation: ${prompt.substring(0, 80)}...${referenceImageBase64 ? ' (with reference image)' : ''}`);

    let parts = buildImageParts(prompt, logoBase64);
    // Inject the reference image at the start with an instruction so Gemini
    // treats it as style/composition inspiration rather than a literal source.
    if (referenceImageBase64) {
      parts = [
        {
          inline_data: {
            mime_type: referenceImageMimeType || 'image/png',
            data: referenceImageBase64,
          },
        },
        { text: 'STYLE REFERENCE: Use the image above as inspiration for visual style, mood, colour palette, and composition. Do NOT copy it literally — create something new that shares the same aesthetic. The brand and topic below take priority over the reference image.' },
        ...parts,
      ];
    }
    const result = await geminiImageWithParts(parts);

    if (result.success) {
      await deductCredits(req.user.id, req.user.company_id, 'generate_image', 1, {
        prompt: prompt.substring(0, 200),
        has_reference_image: !!referenceImageBase64,
      });
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
// Returns the list of prompts for the frontend to generate one at a time.
// Behaviour hierarchy when picking what visual style to use:
//   1. User-uploaded reference image (handled in /generate-image, passed via flag)
//   2. User-typed customStylePrompt
//   3. User-picked selectedStyles
//   4. Brand-aligned fallback (brand guidelines / CI document act as the style)
//   5. Generic minimal/vibrant/editorial default
// Brand context (guidelines + CI document) is layered into EVERY prompt so
// even with a preset style picked, brand voice still influences the output.
router.post('/build-image-prompts', imageLimiter, verifyToken, async (req, res) => {
  try {
    const {
      topicSummary, brandData, selectedStyles,
      customGuidelines, customStylePrompt, avoidList,
      hasReferenceImage,
    } = req.body;
    if (!topicSummary) return res.status(400).json({ success: false, error: 'No topic provided' });

    const hasUserStyle = (selectedStyles && selectedStyles.length > 0)
      || (customStylePrompt && customStylePrompt.trim())
      || hasReferenceImage;
    const hasBrandContext = !!(
      (brandData?.brandGuidelines && brandData.brandGuidelines.trim())
      || (brandData?.ciDocumentText && brandData.ciDocumentText.trim())
    );

    const styleEntries = [];
    if (selectedStyles && selectedStyles.length > 0) {
      for (const key of selectedStyles.filter(k => IMAGE_STYLE_MAP[k])) {
        styleEntries.push({ key, promptTemplate: IMAGE_STYLE_MAP[key] });
      }
    } else if (customStylePrompt && customStylePrompt.trim()) {
      // User typed their own style prompt, no preset picked.
      styleEntries.push({ key: 'custom', promptTemplate: customStylePrompt.trim() });
    } else if (hasBrandContext) {
      // Brand-aligned fallback: no preset style, but we have brand guidelines
      // or a CI document. Generate three variations using ONLY the brand voice
      // as the style guide — no preset aesthetic interfering.
      styleEntries.push({ key: 'brand-aligned', promptTemplate: IMAGE_STYLE_BRAND_ALIGNED });
    } else {
      // No preset, no brand context — fall back to the generic trio.
      for (const key of ['minimal', 'vibrant', 'editorial']) {
        styleEntries.push({ key, promptTemplate: IMAGE_STYLE_MAP[key] });
      }
    }

    // If user added customStylePrompt on top of preset selections, also
    // generate a custom variant (existing behaviour).
    if ((selectedStyles && selectedStyles.length > 0) && customStylePrompt && customStylePrompt.trim()) {
      styleEntries.push({ key: 'custom', promptTemplate: customStylePrompt.trim() });
    }

    const variantInstructions = [
      'Focus on the main concept with a centered composition.',
      'Try an alternative composition with asymmetric layout.',
      'Use a different visual metaphor or perspective.',
    ];

    // Hard guardrails included on EVERY image, regardless of user input.
    const BASE_AVOID = [
      'NO rotationally symmetric geometric shapes that resemble political, religious, or extremist symbols (especially: swastikas, Iron Cross, runic symbols, hammer-and-sickle).',
      'NO real human faces, NO recognisable celebrities or public figures, NO political figures.',
      'NO weapons, NO violence, NO gore, NO sexual content.',
      'NO copyrighted brand logos other than the brand whose logo was explicitly provided.',
      'NO text artefacts, gibberish text, or misspelled words rendered into the image — if text is included it must be the headline cleanly typeset.',
    ].join('\n- ');

    const userAvoidPart = avoidList && avoidList.trim()
      ? `\n\nAdditional user exclusions:\n${avoidList.trim()}`
      : '';
    const avoidBlock = `\n\nDO NOT include any of the following. Treat these as hard exclusions:\n- ${BASE_AVOID}${userAvoidPart}`;

    // Brand context block: included on every image unless the user opted to
    // override style via a reference image (in which case the reference IS
    // the style anchor and we don't want to fight it).
    let brandContextBlock = '';
    if (hasBrandContext && !hasReferenceImage) {
      const parts = [];
      if (brandData?.brandGuidelines?.trim()) {
        parts.push(`BRAND GUIDELINES (respect these):\n${brandData.brandGuidelines.trim()}`);
      }
      if (brandData?.ciDocumentText?.trim()) {
        parts.push(`BRAND IDENTITY DOCUMENT (authoritative):\n${brandData.ciDocumentText.trim().slice(0, 4000)}`);
      }
      brandContextBlock = `\n\n${parts.join('\n\n')}`;
    }

    const prompts = [];
    for (const { key, promptTemplate } of styleEntries) {
      const basePrompt = injectBrand(promptTemplate, { ...brandData, topicSummary });
      for (let v = 0; v < 3; v++) {
        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;
        prompt += brandContextBlock;
        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }
        prompt += avoidBlock;
        prompts.push({ style: key, variant: v, prompt });
      }
    }

    res.json({
      success: true,
      prompts,
      fallback_used: !hasUserStyle && hasBrandContext ? 'brand-aligned' : null,
    });
  } catch (err) {
    console.error('[PROMPTS] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
