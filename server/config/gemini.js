import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
export const TEXT_MODEL = 'gemini-2.0-flash';
export const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// ── Clean AI response (strip code fences, error patterns) ──────────
export function cleanResponse(text) {
  if (!text) return '';
  let cleaned = text.replace(/^```[\w]*\n?/gm, '').replace(/^```\s*$/gm, '').trim();
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
export async function geminiText(prompt, maxRetries = 3) {
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
export async function geminiImageWithParts(parts, maxRetries = 3) {
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

      const outputDir = process.env.VERCEL ? '/tmp/generated' : path.join(ROOT_DIR, 'generated');
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
export function buildImageParts(prompt, logoBase64) {
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
export const MEDIA_TYPES = new Set([
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/x-matroska', 'video/3gpp',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg',
]);

// ── Upload a file to Gemini File API ─────────────────────────────────
export async function uploadToGemini(filePath, mimeType, displayName) {
  const fileData = await fs.readFile(filePath);
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
export async function waitForFileProcessing(fileName, maxWaitMs = 120_000) {
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
export async function transcribeWithGemini(fileUri, mimeType) {
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

export { GEMINI_KEY, ROOT_DIR };
