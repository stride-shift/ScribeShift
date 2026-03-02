import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { YoutubeTranscript } from 'youtube-transcript';
import {
  geminiText, cleanResponse, MEDIA_TYPES,
  uploadToGemini, waitForFileProcessing, transcribeWithGemini,
} from '../config/gemini.js';
import {
  SKILL_MAP, SKILL_TRANSCRIPT_TO_BLOG, injectBrand,
  TONE_DIRECTIVES, POLISH_DIRECTIVES, GOAL_DIRECTIVES,
} from '../../skills.js';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';

const router = Router();
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads/';
const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

const MAX_INPUT_CHARS = 800_000;

// ── Helper: extract YouTube transcript ──────────────────────────────
async function extractYouTubeTranscript(url) {
  try {
    const items = await YoutubeTranscript.fetchTranscript(url);
    const text = items.map(item => item.text).join(' ');
    console.log(`[YT] Extracted ${text.length.toLocaleString()} chars from ${url}`);
    return text;
  } catch (err) {
    console.error(`[YT] Failed to extract transcript: ${err.message}`);
    return null;
  }
}

// ── Helper: process multiple uploaded files ─────────────────────────
async function processFiles(files) {
  const contents = [];
  let totalChars = 0;

  for (const file of files) {
    try {
      const isMedia = MEDIA_TYPES.has(file.mimetype);

      if (isMedia) {
        console.log(`[FILES] Processing media: ${file.originalname} (${file.mimetype})`);
        const uploaded = await uploadToGemini(file.path, file.mimetype, file.originalname);
        console.log(`[FILES] Uploaded ${file.originalname}, waiting for processing...`);
        const processed = await waitForFileProcessing(uploaded.name);
        console.log(`[FILES] ${file.originalname} ready, transcribing with Gemini...`);
        const transcript = await transcribeWithGemini(processed.uri, file.mimetype);

        if (transcript) {
          const remaining = MAX_INPUT_CHARS - totalChars;
          let text = transcript;
          if (remaining <= 0) {
            contents.push(`--- Media: ${file.originalname} (skipped — input cap reached) ---`);
          } else {
            if (text.length > remaining) {
              text = text.slice(0, remaining) + '\n\n[... truncated ...]';
            }
            contents.push(`--- Media Transcript: ${file.originalname} ---\n${text}`);
            totalChars += text.length;
            console.log(`[FILES] Transcribed ${file.originalname}: ${text.length.toLocaleString()} chars`);
          }
        } else {
          contents.push(`--- Media: ${file.originalname} (transcription returned empty) ---`);
        }
      } else {
        let text = await fs.readFile(file.path, 'utf-8');
        const remaining = MAX_INPUT_CHARS - totalChars;
        if (remaining <= 0) {
          console.log(`[FILES] Skipping ${file.originalname} — input cap reached`);
          contents.push(`--- File: ${file.originalname} (skipped — input too large) ---`);
        } else {
          if (text.length > remaining) {
            console.log(`[FILES] Truncating ${file.originalname} from ${text.length} to ${remaining} chars`);
            text = text.slice(0, remaining) + '\n\n[... truncated — file too large ...]';
          }
          contents.push(`--- File: ${file.originalname} ---\n${text}`);
          totalChars += text.length;
        }
      }
    } catch (err) {
      console.error(`[FILES] Error processing ${file.originalname}:`, err.message);
      contents.push(`--- File: ${file.originalname} (could not process) ---`);
    }
    await fs.unlink(file.path).catch(() => {});
  }

  console.log(`[FILES] Total input: ${totalChars.toLocaleString()} chars from ${files.length} file(s)`);
  return contents.join('\n\n');
}

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
        urlContents.push(`--- Reference URL: ${url} ---`);
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
    console.log(`[GEN] Style: toneMode=${options.toneMode || 'preset'}, tone=${options.tone}, polish=${options.polish || 'natural'}, goal=${options.goal || 'none'}`);

    const results = {};

    // Generate blog upfront if any type needs it
    let blogContent = null;
    const needsBlog = contentTypes.some(t => ['video', 'newsletter'].includes(t));
    if (needsBlog || contentTypes.includes('blog')) {
      console.log('[GEN] Generating base blog from input...');
      blogContent = await geminiText(
        `${injectBrand(SKILL_TRANSCRIPT_TO_BLOG, brandData)}${styleDirectives}\n\nCRITICAL REMINDER: The blog post MUST be entirely derived from the source content below. Cover the actual topics, arguments, stories, and insights from the source. Do NOT invent new topics or add information not present in the source material.\n\nIMPORTANT: Output ONLY the blog post. Do NOT wrap in code blocks or fences. Do NOT include preambles.\n\nHere is the transcript/source content (provided directly below — do NOT ask for it separately):\n${allInput}`
      );
      if (contentTypes.includes('blog')) {
        results.blog = blogContent;
      }
    }

    // Generate remaining types
    const remaining = contentTypes.filter(t => t !== 'blog');
    for (let i = 0; i < remaining.length; i++) {
      const type = remaining[i];
      if (i > 0) {
        console.log('[GEN] Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }

      try {
        const skill = SKILL_MAP[type];
        if (!skill) { results[type] = `Unknown type: ${type}`; continue; }

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
        results[type] = await geminiText(
          `${prompt}${styleDirectives}${sourceEnforcement}\n\nIMPORTANT: Output ONLY the final content. Do NOT wrap in code blocks. Do NOT include preambles like "Here are X posts". Start directly with the content.\n\n${contentLabel}\n${input}\n\nOptions: ToneMode=${options.toneMode || 'preset'}, Tone=${options.tone}, Polish=${options.polish || 'natural'}, Length=${options.length}, Audience=${options.audience}, Industry=${options.industry || 'general'}, Goal=${options.goal || 'none'}`
        );
      } catch (err) {
        console.error(`[GEN] Error generating ${type}:`, err.message);
        results[type] = `Error generating ${type}: ${err.message}`;
      }
    }

    // Deduct credits
    await deductCredits(req.user.id, req.user.company_id, 'generate_text', creditCheck.cost, {
      content_types: textTypes,
      options,
    });

    // Save generated content to database
    const sourceSummary = allInput.substring(0, 500);
    for (const [type, body] of Object.entries(results)) {
      if (body && !body.startsWith('Error generating') && !body.startsWith('Unknown type')) {
        try {
          const insertObj = {
            user_id: req.user.id,
            company_id: req.user.company_id || null,
            brand_id: brandData.brandId || null,
            content_type: type,
            title: body.split('\n')[0]?.replace(/^#+\s*/, '').substring(0, 200) || type,
            body,
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
    if (req.files) {
      for (const f of req.files) await fs.unlink(f.path).catch(() => {});
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
