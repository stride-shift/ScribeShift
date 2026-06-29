import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { geminiImageWithParts, buildImageParts } from '../services/gemini-client.js';
import { IMAGE_STYLE_MAP, IMAGE_STYLE_BRAND_ALIGNED, injectBrand, composeBrandGuardrails } from '../config/skills.js';
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

// Kind-specific instruction for a typed brand asset attached as a reference
// image. Mirrors Justin's per-kind handling: logos are placed (exact pixels),
// watermarks/patterns/motifs are woven into the background (never pasted as a
// cut-out), everything else is a style reference.
function assetInstruction(kind, note) {
  const map = {
    'logo-primary':     'EXACT BRAND LOGO: place it cleanly in a corner (top-left preferred) at a modest size. Use the exact pixels — do NOT recolour, distort, crop, or redraw it.',
    'logo-symbol':      'EXACT BRAND SYMBOL/MARK: place small in a corner. Exact pixels; do not redraw.',
    'logo-mono-light':  'EXACT BRAND LOGO (light/mono): for use on darker areas — small, in a corner. Exact pixels.',
    'logo-mono-dark':   'EXACT BRAND LOGO (dark/mono): for use on lighter areas — small, in a corner. Exact pixels.',
    'sub-brand-lockup': 'EXACT SUB-BRAND LOCKUP: place small in a corner. Exact pixels; do not redraw.',
    'watermark':        'BRAND WATERMARK: weave subtly into the background at low opacity. NEVER paste it as a visible rectangle, box, or cut-out.',
    'pattern':          'BRAND PATTERN: use as a subtle background texture integrated into the composition. Do NOT paste it as a rectangle — weave it in.',
    'motif':            'BRAND MOTIF: incorporate this signature graphic device subtly (e.g. a corner, low opacity). Integrate it; do not paste as a cut-out.',
    'icon-set':         'BRAND ICON STYLE: if icons appear, match this iconography style. Reference only — do not paste.',
    'photo':            'PHOTOGRAPHY STYLE REFERENCE: match this mood/treatment. Do not copy literally.',
    'illustration':     'ILLUSTRATION STYLE REFERENCE: match this style. Do not copy literally.',
    'template':         'LAYOUT REFERENCE: echo this composition/structure. Do not copy literally.',
  };
  const base = map[kind] || 'STYLE REFERENCE: use for visual style, mood, and palette inspiration; do not copy literally.';
  return note ? `${base} Note: ${note}` : base;
}

// Build Gemini parts for typed brand assets: [{ base64, mimeType, kind, usage_note }].
// Each asset becomes an image part + a kind-specific instruction part.
function buildBrandAssetParts(brandAssets) {
  const parts = [];
  for (const a of (Array.isArray(brandAssets) ? brandAssets : []).slice(0, 6)) {
    if (!a?.base64) continue;
    parts.push({ inline_data: { mime_type: a.mimeType || 'image/png', data: a.base64 } });
    parts.push({ text: assetInstruction(a.kind, a.usage_note) });
  }
  return parts;
}

// ── POST /api/generate-image ────────────────────────────────────────
router.post('/generate-image', imageLimiter, verifyToken, async (req, res) => {
  try {
    const { prompt, logoBase64, referenceImageBase64, referenceImageMimeType, brandAssets } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'No prompt provided' });

    const creditCheck = await checkCredits(req.user.company_id, 'generate_image');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    console.log(`[IMAGE] Single generation: ${prompt.substring(0, 80)}...${referenceImageBase64 ? ' (with reference image)' : ''}`);

    // Typed brand assets (logo / watermark / pattern / motif …) attached with
    // kind-specific instructions. If an asset logo is present, it supersedes the
    // generic logoBase64 (avoid a double logo).
    const assetParts = buildBrandAssetParts(brandAssets);
    const hasAssetLogo = Array.isArray(brandAssets)
      && brandAssets.some((a) => typeof a?.kind === 'string' && (a.kind.startsWith('logo') || a.kind === 'sub-brand-lockup'));

    let parts = buildImageParts(prompt, hasAssetLogo ? null : logoBase64);
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
    // Brand asset parts go first so the model treats them as authoritative brand
    // inputs (logo to place, watermark/pattern to weave in).
    if (assetParts.length) parts = [...assetParts, ...parts];

    const result = await geminiImageWithParts(parts);

    if (result.success) {
      await deductCredits(req.user.id, req.user.company_id, 'generate_image', 1, {
        prompt: prompt.substring(0, 200),
        has_reference_image: !!referenceImageBase64,
        brand_asset_kinds: Array.isArray(brandAssets) ? brandAssets.map((a) => a?.kind).filter(Boolean) : [],
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

    // Brand do/don'ts → a guardrails SUFFIX appended after the creative
    // direction (mirrors Justin's composeBrandGuardrails). The deck-style-lock
    // (palette + typography + motif + no-invent-marks) is injected inside the
    // template via the {{BRAND_PALETTE_BLOCK}} token by injectBrand.
    const guardrails = composeBrandGuardrails(brandData);
    const guardrailsBlock = guardrails ? `\n\n---\n\n${guardrails}` : '';

    const prompts = [];
    for (const { key, promptTemplate } of styleEntries) {
      // brandData is spread whole so brand_palette / typography / motif_description
      // reach injectBrand → composeDeckStyleLock for the deck-style-lock block.
      // Falls back to primaryColor/secondaryColor when no structured palette.
      const basePrompt = injectBrand(promptTemplate, { ...brandData, topicSummary });
      for (let v = 0; v < 3; v++) {
        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;
        prompt += brandContextBlock;
        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }
        prompt += avoidBlock;
        prompt += guardrailsBlock;
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
