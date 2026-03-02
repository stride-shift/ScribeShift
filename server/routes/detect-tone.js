import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { YoutubeTranscript } from 'youtube-transcript';
import {
  geminiText, MEDIA_TYPES,
  uploadToGemini, waitForFileProcessing, transcribeWithGemini,
} from '../config/gemini.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';

const router = Router();
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads/';
const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

const MAX_ANALYSIS_CHARS = 50_000;

const TONE_ANALYSIS_PROMPT = `Analyze the tone, voice, and style of the following content. Describe in 2-4 concise sentences:
- The overall tone (e.g., casual, authoritative, playful, urgent)
- The sentence structure and rhythm (short punchy sentences, long flowing ones, mix)
- The level of formality
- Any distinctive voice characteristics (humor, directness, use of jargon, storytelling, etc.)

Be specific and actionable — your description will be used as a writing directive for an AI to match this style. Do NOT be generic. Focus on what makes this voice distinctive.

Output ONLY the tone description. No preambles, no labels, no bullet points — just a cohesive paragraph that could be used as a writing instruction.

Content to analyze:
`;

router.post('/', verifyToken, upload.array('files', 20), async (req, res) => {
  try {
    // Check credits before AI call
    const creditCheck = await checkCredits(req.user.company_id, 'detect_tone');
    if (!creditCheck.allowed) {
      if (req.files) {
        for (const f of req.files) await fs.unlink(f.path).catch(() => {});
      }
      return res.status(402).json({ error: creditCheck.error });
    }

    const videoUrls = JSON.parse(req.body.videoUrls || '[]');
    const textPrompt = req.body.textPrompt || '';

    // Process uploaded files
    let fileContent = '';
    if (req.files?.length) {
      const contents = [];
      for (const file of req.files) {
        try {
          const isMedia = MEDIA_TYPES.has(file.mimetype);
          if (isMedia) {
            const uploaded = await uploadToGemini(file.path, file.mimetype, file.originalname);
            const processed = await waitForFileProcessing(uploaded.name);
            const transcript = await transcribeWithGemini(processed.uri, file.mimetype);
            if (transcript) contents.push(transcript);
          } else {
            const text = await fs.readFile(file.path, 'utf-8');
            contents.push(text);
          }
        } catch (err) {
          console.error(`[TONE] Error processing ${file.originalname}:`, err.message);
        }
        await fs.unlink(file.path).catch(() => {});
      }
      fileContent = contents.join('\n\n');
    }

    // Process YouTube URLs
    const urlContents = [];
    for (const url of videoUrls) {
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube) {
        try {
          const items = await YoutubeTranscript.fetchTranscript(url);
          const text = items.map(item => item.text).join(' ');
          if (text) urlContents.push(text);
        } catch (err) {
          console.error(`[TONE] YouTube transcript failed: ${err.message}`);
        }
      }
    }

    // Combine all inputs
    const parts = [];
    if (textPrompt.trim()) parts.push(textPrompt.trim());
    if (fileContent) parts.push(fileContent);
    if (urlContents.length) parts.push(urlContents.join('\n\n'));

    const allContent = parts.join('\n\n');
    if (!allContent.trim()) {
      return res.status(400).json({ error: 'No content to analyze. Upload files, add URLs, or enter text first.' });
    }

    const truncated = allContent.substring(0, MAX_ANALYSIS_CHARS);
    console.log(`[TONE] Analyzing tone from ${truncated.length.toLocaleString()} chars of content`);

    const detectedTone = await geminiText(TONE_ANALYSIS_PROMPT + truncated);
    if (!detectedTone) {
      return res.status(500).json({ error: 'Tone analysis returned empty. Try again.' });
    }

    // Deduct credits after successful analysis
    await deductCredits(req.user.id, req.user.company_id, 'detect_tone', creditCheck.cost, {
      input_length: truncated.length,
    });

    console.log(`[TONE] Detected: ${detectedTone.substring(0, 100)}...`);
    res.json({ success: true, detectedTone });
  } catch (err) {
    console.error('[TONE] Error:', err.message);
    if (req.files) {
      for (const f of req.files) await fs.unlink(f.path).catch(() => {});
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
