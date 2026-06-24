// Shared input-gathering helpers used across the generation paths
// (services/generation.js → worker, routes/generate.js, routes/detect-tone.js).
//
// These were previously duplicated in each entry point. They are now defined
// once here so a change to URL fetching, YouTube transcript extraction, or
// uploaded-file processing applies everywhere consistently.

import fs from 'fs/promises';
import { YoutubeTranscript } from 'youtube-transcript';
import {
  MEDIA_TYPES, uploadToGemini, waitForFileProcessing, transcribeWithGemini,
} from './gemini-client.js';

// Cap on total characters pulled in from uploaded files (matches the previous
// routes/generate.js limit). Per-file truncation accounts for what prior files
// already consumed.
const MAX_INPUT_CHARS = 800_000;

export async function extractYouTubeTranscript(url) {
  try {
    const items = await YoutubeTranscript.fetchTranscript(url);
    return items.map(i => i.text).join(' ');
  } catch (err) {
    console.warn(`[GEN] YouTube transcript failed: ${err.message}`);
    return null;
  }
}

export async function fetchUrlText(url, maxChars = 50_000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScribeShiftBot/1.0; +https://strideshift.ai)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain') && !ct.includes('application/xhtml')) return null;
    let t = await res.text();
    t = t
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ').trim();
    if (!t) return null;
    return t.length > maxChars ? t.slice(0, maxChars) + ' [...truncated]' : t;
  } catch (err) {
    console.warn(`[GEN] URL fetch failed for ${url}: ${err.message}`);
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

export { processFiles };

// Assemble source input from a typed prompt + reference/video URLs.
export async function assembleInput({ textPrompt = '', videoUrls = [] }) {
  const urlContents = [];
  for (const url of videoUrls || []) {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      const yt = await extractYouTubeTranscript(url);
      urlContents.push(yt ? `--- YouTube Transcript: ${url} ---\n${yt}` : `--- YouTube Video (transcript unavailable): ${url} ---`);
    } else {
      const page = await fetchUrlText(url);
      urlContents.push(page ? `--- Reference URL Content: ${url} ---\n${page}` : `--- Reference URL (content unavailable): ${url} ---`);
    }
  }
  const parts = [];
  if (textPrompt.trim()) parts.push(`--- Topic / Prompt ---\n${textPrompt.trim()}`);
  if (urlContents.length) parts.push(urlContents.join('\n\n'));
  return parts.filter(Boolean).join('\n\n');
}
