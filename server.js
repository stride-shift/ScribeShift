import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { YoutubeTranscript } from 'youtube-transcript';
import { SKILL_MAP, SKILL_TRANSCRIPT_TO_BLOG, IMAGE_STYLE_MAP, injectBrand } from './skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 200 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/generated', express.static(path.join(__dirname, 'generated')));

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TEXT_MODEL = 'gemini-2.0-flash';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// ── Clean AI response (strip code fences, error patterns) ──────────
function cleanResponse(text) {
  if (!text) return '';
  // Strip wrapping code fences (```markdown ... ```, ```tool_code ... ```, etc.)
  let cleaned = text.replace(/^```[\w]*\n?/gm, '').replace(/^```\s*$/gm, '').trim();
  // Detect "I can't process" refusal patterns and return empty so caller can retry
  const refusalPatterns = [
    /I am unable to process/i,
    /I cannot process/i,
    /print\("I am unable/i,
    /I can't access external files/i,
    /please provide the content/i,
  ];
  for (const p of refusalPatterns) {
    if (p.test(cleaned) && cleaned.length < 300) return '';
  }
  return cleaned;
}

// ── Gemini Text Generation (with 429 retry + response validation) ──
async function geminiText(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });

    if (res.status === 429) {
      const wait = 15 * attempt;
      console.log(`[TEXT] Rate limited (attempt ${attempt}/${maxRetries}), waiting ${wait}s...`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini text API ${res.status}: ${err.substring(0, 300)}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = cleanResponse(raw);

    // If response was a refusal, retry with a stronger prompt
    if (!cleaned && attempt < maxRetries) {
      console.log(`[TEXT] Got refusal/empty response (attempt ${attempt}), retrying...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    return cleaned || raw;
  }
  throw new Error('Gemini text API: rate limited after all retries');
}

// ── Gemini Image Generation (with parts — supports logo inline_data) ─
async function geminiImageWithParts(parts, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[IMAGE] Generating (attempt ${attempt}/${maxRetries})...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.7,
            response_modalities: ['IMAGE'],
            image_config: { aspect_ratio: '16:9' },
          },
        }),
      });

      if (res.status === 429) {
        const wait = 15 * attempt;
        console.log(`[IMAGE] Rate limited, waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        console.error(`[IMAGE] API error ${res.status} (attempt ${attempt}):`, err.substring(0, 200));
        if (attempt === maxRetries) return { success: false, error: `${res.status}: ${err.substring(0, 200)}` };
        const wait = res.status === 400 ? 5000 * attempt : 2000 * attempt;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const data = await res.json();
      const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
      const base64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
      const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || 'image/png';

      if (!base64) {
        console.error(`[IMAGE] No image data (attempt ${attempt})`);
        if (attempt === maxRetries) return { success: false, error: 'No image data returned' };
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      const outputDir = path.join(__dirname, 'generated');
      await fs.mkdir(outputDir, { recursive: true });
      const filename = `image_${Date.now()}.png`;
      await fs.writeFile(path.join(outputDir, filename), Buffer.from(base64, 'base64'));
      console.log(`[IMAGE] Generated (${(base64.length / 1024).toFixed(0)}KB)`);

      return { success: true, base64, mimeType, filename };
    } catch (err) {
      console.error(`[IMAGE] Exception (attempt ${attempt}):`, err.message);
      if (attempt === maxRetries) return { success: false, error: err.message };
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return { success: false, error: 'Failed after all retries' };
}

// ── Helper: build image parts with optional logo ────────────────────
function buildImageParts(prompt, logoBase64) {
  const parts = [];
  if (logoBase64) {
    parts.push({ inline_data: { mime_type: 'image/png', data: logoBase64 } });
    parts.push({ text: `LOGO: The image above is the brand logo. Incorporate it tastefully (top-left corner, small). Do NOT recreate it — use the exact pixels.\n\n${prompt}` });
  } else {
    parts.push({ text: prompt });
  }
  return parts;
}

// ── Video/Audio media types that need transcription via Gemini ────────
const MEDIA_TYPES = new Set([
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/x-matroska', 'video/3gpp',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg',
]);

// ── Upload a file to Gemini File API ─────────────────────────────────
async function uploadToGemini(filePath, mimeType, displayName) {
  const fileData = await fs.readFile(filePath);

  // Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Failed to get upload URL from Gemini File API');

  // Upload the actual file data
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(fileData.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileData,
  });

  const result = await uploadRes.json();
  return result.file;
}

// ── Wait for Gemini to finish processing an uploaded file ────────────
async function waitForFileProcessing(fileName, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_KEY}`
    );
    const file = await res.json();
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error(`File processing failed: ${fileName}`);
    console.log(`[VIDEO] Waiting for ${fileName} (state: ${file.state})...`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`File processing timed out: ${fileName}`);
}

// ── Transcribe video/audio using Gemini multimodal ───────────────────
async function transcribeWithGemini(fileUri, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { file_data: { file_uri: fileUri, mime_type: mimeType } },
          { text: 'Transcribe all spoken content from this media file. Output ONLY the raw transcript text — no timestamps, no speaker labels, no formatting. If there are multiple speakers, just output their words in order. If there is no speech, describe the key visual and audio content instead.' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini transcription API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  return cleanResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

// ── Extract transcript from a YouTube URL ────────────────────────────
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

// ── Helper: process multiple uploaded files (with size cap) ──────────
const MAX_INPUT_CHARS = 800_000; // ~200K tokens, safe under Gemini's 1M limit

async function processFiles(files) {
  const contents = [];
  let totalChars = 0;

  for (const file of files) {
    try {
      const isMedia = MEDIA_TYPES.has(file.mimetype);

      if (isMedia) {
        // Video/audio: upload to Gemini File API → transcribe
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
        // Text/document files: read as UTF-8
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

// ── POST /api/generate ──────────────────────────────────────────────
// Multi-file text generation for all content types.
app.post('/api/generate', upload.array('files', 20), async (req, res) => {
  try {
    const transcript = req.files?.length ? await processFiles(req.files) : '';
    const contentTypes = JSON.parse(req.body.contentTypes || '[]');
    const options = JSON.parse(req.body.options || '{}');
    const brandData = JSON.parse(req.body.brandData || '{}');
    const videoUrls = JSON.parse(req.body.videoUrls || '[]');

    // Process YouTube / video URLs — extract actual transcripts
    const urlContents = [];
    for (const url of videoUrls) {
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube) {
        console.log(`[GEN] Extracting YouTube transcript: ${url}`);
        const ytText = await extractYouTubeTranscript(url);
        if (ytText) {
          urlContents.push(`--- YouTube Transcript: ${url} ---\n${ytText}`);
        } else {
          urlContents.push(`--- YouTube Video (transcript unavailable — captions may be disabled): ${url} ---`);
        }
      } else {
        urlContents.push(`--- Reference URL: ${url} ---`);
      }
    }

    const allInput = [
      transcript,
      urlContents.length ? urlContents.join('\n\n') : '',
    ].filter(Boolean).join('\n\n');

    if (!allInput.trim()) {
      return res.status(400).json({ success: false, error: 'No content provided' });
    }

    const results = {};

    // Generate blog upfront if any type needs it
    let blogContent = null;
    const needsBlog = contentTypes.some(t => ['video', 'newsletter'].includes(t));
    if (needsBlog || contentTypes.includes('blog')) {
      console.log('[GEN] Generating base blog from input...');
      blogContent = await geminiText(
        `${injectBrand(SKILL_TRANSCRIPT_TO_BLOG, brandData)}\n\nCRITICAL REMINDER: The blog post MUST be entirely derived from the source content below. Cover the actual topics, arguments, stories, and insights from the source. Do NOT invent new topics or add information not present in the source material.\n\nIMPORTANT: Output ONLY the blog post. Do NOT wrap in code blocks or fences. Do NOT include preambles.\n\nHere is the transcript/source content (provided directly below — do NOT ask for it separately):\n${allInput}`
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

        // Build a clear inline content prompt so the model doesn't ask for external files
        const isSocial = ['linkedin', 'twitter', 'facebook', 'instagram'].includes(type);
        const contentLabel = ['video', 'newsletter'].includes(type)
          ? 'Here is the blog post to transform (provided directly below — do NOT ask for it separately):'
          : 'Here is the source content to transform (provided directly below — do NOT ask for it separately):';

        const sourceEnforcement = isSocial
          ? '\n\nCRITICAL REMINDER: Every single post you generate MUST be directly about the topics, ideas, and insights found in the source content below. Read the source carefully, identify the key themes, and make each post specifically about those themes. Do NOT produce generic social media posts.'
          : '\n\nCRITICAL REMINDER: Your output MUST be entirely derived from the source content below. Cover the actual topics, arguments, and insights from the source. Do NOT invent new topics or add information not present in the source material.';

        console.log(`[GEN] Generating ${type}...`);
        results[type] = await geminiText(
          `${prompt}${sourceEnforcement}\n\nIMPORTANT: Output ONLY the final content. Do NOT wrap in code blocks. Do NOT include preambles like "Here are X posts". Start directly with the content.\n\n${contentLabel}\n${input}\n\nOptions: Tone=${options.tone}, Length=${options.length}, Audience=${options.audience}, Industry=${options.industry || 'general'}`
        );
      } catch (err) {
        console.error(`[GEN] Error generating ${type}:`, err.message);
        results[type] = `Error generating ${type}: ${err.message}`;
      }
    }

    res.json({ success: true, content: results });
  } catch (err) {
    console.error('[GEN] Fatal error:', err);
    // Clean up any uploaded files on error
    if (req.files) {
      for (const f of req.files) await fs.unlink(f.path).catch(() => {});
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/generate-image ────────────────────────────────────────
// Single image generation (for regenerating individual images).
app.post('/api/generate-image', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { prompt, logoBase64 } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'No prompt provided' });

    console.log(`[IMAGE] Single generation: ${prompt.substring(0, 80)}...`);
    const parts = buildImageParts(prompt, logoBase64);
    const result = await geminiImageWithParts(parts);
    res.json(result);
  } catch (err) {
    console.error('[IMAGE] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/generate-image-suite ──────────────────────────────────
// Generates images: selected styles × 3 variants each.
app.post('/api/generate-image-suite', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { topicSummary, brandData, selectedStyles, customGuidelines, customStylePrompt } = req.body;
    if (!topicSummary) return res.status(400).json({ success: false, error: 'No topic provided' });

    // Build list of style entries
    const styleEntries = [];
    const styleKeys = selectedStyles && selectedStyles.length > 0
      ? selectedStyles.filter(k => IMAGE_STYLE_MAP[k])
      : ['minimal', 'vibrant', 'editorial'];

    for (const key of styleKeys) {
      styleEntries.push({ key, promptTemplate: IMAGE_STYLE_MAP[key] });
    }

    // If user provided a custom style prompt, add it
    if (customStylePrompt && customStylePrompt.trim()) {
      styleEntries.push({ key: 'custom', promptTemplate: customStylePrompt.trim() });
    }

    const variantInstructions = [
      'Focus on the main concept with a centered composition.',
      'Try an alternative composition with asymmetric layout.',
      'Use a different visual metaphor or perspective.',
    ];

    const results = [];
    let generated = 0;

    for (const { key, promptTemplate } of styleEntries) {
      const basePrompt = injectBrand(promptTemplate, {
        ...brandData,
        topicSummary,
      });

      for (let v = 0; v < 3; v++) {
        if (generated > 0) {
          const delay = 2000 + (generated * 500);
          console.log(`[SUITE] Waiting ${delay}ms before next...`);
          await new Promise(r => setTimeout(r, delay));
        }

        let prompt = `${basePrompt}\n\nVariant ${v + 1} of 3: ${variantInstructions[v]}`;

        if (customGuidelines && customGuidelines.trim()) {
          prompt += `\n\nAdditional user guidelines: ${customGuidelines.trim()}`;
        }

        const parts = buildImageParts(prompt, brandData?.logoBase64);

        console.log(`[SUITE] Generating ${key} variant ${v + 1}...`);
        const result = await geminiImageWithParts(parts);
        results.push({ style: key, variant: v, prompt, ...result });
        generated++;
      }
    }

    res.json({ success: true, images: results });
  } catch (err) {
    console.error('[SUITE] Fatal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Health check ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: TEXT_MODEL, imageModel: IMAGE_MODEL });
});

// ── Start ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4321;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[SCRIBESHIFT] API on http://localhost:${PORT}`);
  console.log(`[SCRIBESHIFT] Text: ${TEXT_MODEL} | Image: ${IMAGE_MODEL}`);
});
