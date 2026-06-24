import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import {
  geminiText, cleanResponse, MEDIA_TYPES,
  uploadToGemini, waitForFileProcessing, transcribeWithGemini,
} from '../config/gemini.js';
import {
  SKILL_MAP, SKILL_TRANSCRIPT_TO_BLOG, injectBrand,
  TONE_DIRECTIVES, POLISH_DIRECTIVES, GOAL_DIRECTIVES,
  buildVoiceContext,
} from '../config/skills.js';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';
import { extractYouTubeTranscript, fetchUrlText, processFiles } from '../services/input-sources.js';

const router = Router();
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads/';
const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

// ── Helper: build style directives from options ─────────────────────
function buildStyleDirectives(options) {
  const parts = [];

  // Tone directive — supports preset, detected, and custom modes
  if (options.toneMode === 'detected' && options.detectedTone) {
    parts.push(`## TONE DIRECTIVE\nMatch this voice and style: ${options.detectedTone}`);
  } else if (options.toneMode === 'custom' && options.customTone && options.customTone.trim()) {
    parts.push(`## TONE DIRECTIVE\n${options.customTone.trim()}`);
  } else {
    const toneDirective = TONE_DIRECTIVES[options.tone];
    if (toneDirective) {
      parts.push(`## TONE DIRECTIVE\n${toneDirective}`);
    }
  }

  // Polish level directive
  const polishDirective = POLISH_DIRECTIVES[options.polish || 'natural'];
  if (polishDirective) {
    parts.push(`## POLISH LEVEL\n${polishDirective}`);
  }

  // Content goal directive
  if (options.goal && options.goal !== 'none') {
    const goalDirective = GOAL_DIRECTIVES[options.goal];
    if (goalDirective) {
      parts.push(`## CONTENT GOAL\n${goalDirective}`);
    }
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

// ── POST /api/generate ──────────────────────────────────────────────
router.post('/', verifyToken, upload.array('files', 20), async (req, res) => {
  try {
    const transcript = req.files?.length ? await processFiles(req.files) : '';
    const contentTypes = JSON.parse(req.body.contentTypes || '[]');
    const options = JSON.parse(req.body.options || '{}');
    const brandData = JSON.parse(req.body.brandData || '{}');
    const videoUrls = JSON.parse(req.body.videoUrls || '[]');
    const textPrompt = req.body.textPrompt || '';

    // Check credits
    const textTypes = contentTypes.filter(t => t !== 'images');
    const creditCheck = await checkCredits(req.user.company_id, 'generate_text', textTypes.length);
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    // Process YouTube / video URLs
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

    // Build style directives from new controls
    const styleDirectives = buildStyleDirectives(options);
    const voiceContext = buildVoiceContext(brandData);
    const brandDirectives = styleDirectives + voiceContext;
    console.log(`[GEN] Style: toneMode=${options.toneMode || 'preset'}, tone=${options.tone}, polish=${options.polish || 'natural'}, goal=${options.goal || 'none'}, voice=${voiceContext ? 'on' : 'off'}`);

    const results = {};

    // Generate blog upfront if any type needs it
    let blogContent = null;
    const needsBlog = contentTypes.some(t => ['video', 'newsletter'].includes(t));
    if (needsBlog || contentTypes.includes('blog')) {
      console.log('[GEN] Generating base blog from input...');
      blogContent = await geminiText(
        `${injectBrand(SKILL_TRANSCRIPT_TO_BLOG, brandData)}${brandDirectives}\n\nCRITICAL REMINDER: The blog post MUST be entirely derived from the source content below. Cover the actual topics, arguments, stories, and insights from the source. Do NOT invent new topics or add information not present in the source material.\n\nIMPORTANT: Output ONLY the blog post. Do NOT wrap in code blocks or fences. Do NOT include preambles.\n\nHere is the transcript/source content (provided directly below — do NOT ask for it separately):\n${allInput}`
      );
      if (contentTypes.includes('blog')) {
        results.blog = blogContent;
      }
    }

    // Generate remaining types in parallel for speed
    const remaining = contentTypes.filter(t => t !== 'blog');
    const generateOne = async (type) => {
      try {
        const skill = SKILL_MAP[type];
        if (!skill) return { type, result: `Unknown type: ${type}` };

        const input = ['video', 'newsletter'].includes(type) ? blogContent : allInput;
        const prompt = injectBrand(skill, brandData);
        const isSocial = ['linkedin', 'twitter', 'facebook', 'instagram'].includes(type);
        const contentLabel = ['video', 'newsletter'].includes(type)
          ? 'Here is the blog post to transform (provided directly below — do NOT ask for it separately):'
          : 'Here is the source content to transform (provided directly below — do NOT ask for it separately):';

        const sourceEnforcement = isSocial
          ? '\n\nCRITICAL REMINDER: Every single post you generate MUST be directly about the topics, ideas, and insights found in the source content below. Read the source carefully, identify the key themes, and make each post specifically about those themes. Do NOT produce generic social media posts.'
          : '\n\nCRITICAL REMINDER: Your output MUST be entirely derived from the source content below. Cover the actual topics, arguments, and insights from the source. Do NOT invent new topics or add information not present in the source material.';

        console.log(`[GEN] Generating ${type}...`);
        const result = await geminiText(
          `${prompt}${brandDirectives}${sourceEnforcement}\n\nIMPORTANT: Output ONLY the final content. Do NOT wrap in code blocks. Do NOT include preambles like "Here are X posts". Start directly with the content.\n\n${contentLabel}\n${input}\n\nOptions: ToneMode=${options.toneMode || 'preset'}, Tone=${options.tone}, Polish=${options.polish || 'natural'}, Length=${options.length}, Audience=${options.audience}, Industry=${options.industry || 'general'}, Goal=${options.goal || 'none'}`
        );
        return { type, result };
      } catch (err) {
        console.error(`[GEN] Error generating ${type}:`, err.message);
        return { type, result: `Error generating ${type}: ${err.message}` };
      }
    };

    const generated = await Promise.all(remaining.map(generateOne));
    for (const { type, result } of generated) {
      results[type] = result;
    }

    // Deduct credits only for content types that actually produced real content.
    // generateOne() never throws — it returns an "Error generating …"/"Unknown
    // type …" string on failure — so without this filter we'd bill the user the
    // full cost even when every Gemini call failed.
    const isReal = (body) => body && !body.startsWith('Error generating') && !body.startsWith('Unknown type');
    const succeededTypes = textTypes.filter(t => isReal(results[t]));
    const creditsToCharge = creditCheck.cost === 0
      ? 0
      : Math.round(creditCheck.cost * (succeededTypes.length / textTypes.length));
    await deductCredits(req.user.id, req.user.company_id, 'generate_text', creditsToCharge, {
      content_types: succeededTypes,
      options,
    });

    // Save generated content to database
    // Strip null bytes (\u0000) that Gemini sometimes returns — PostgreSQL rejects them
    const stripNulls = (str) => typeof str === 'string' ? str.replace(/\u0000/g, '') : str;
    const sourceSummary = stripNulls(allInput.substring(0, 500));
    for (const [type, body] of Object.entries(results)) {
      if (body && !body.startsWith('Error generating') && !body.startsWith('Unknown type')) {
        try {
          const cleanBody = stripNulls(body);
          const insertObj = {
            user_id: req.user.id,
            company_id: req.user.company_id || null,
            brand_id: brandData.brandId || null,
            content_type: type,
            title: cleanBody.split('\n')[0]?.replace(/^#+\s*/, '').substring(0, 200) || type,
            body: cleanBody,
            source_summary: sourceSummary,
            options: {
              tone: options.tone,
              toneMode: options.toneMode || 'preset',
              polish: options.polish || 'natural',
              length: options.length,
              audience: options.audience,
              industry: options.industry,
              goal: options.goal || 'none',
              hasDetectedTone: !!options.detectedTone,
            },
          };
          const { error: saveError } = await supabase.from('generated_content').insert(insertObj);
          if (saveError) {
            console.error(`[DB] Error saving ${type}:`, saveError.message, saveError.details);
          } else {
            console.log(`[DB] Saved ${type} content for user ${req.user.id}`);
          }
        } catch (saveErr) {
          console.error(`[DB] Exception saving ${type}:`, saveErr.message);
        }
      }
    }

    res.json({ success: true, content: results });
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
// src/hooks/useGenerationJob.js) and can navigate away. Handles typed prompts +
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
