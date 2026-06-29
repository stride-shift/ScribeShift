// OpenAI client — structured JSON extraction via the Responses API.
// Mirrors the call shape from Justin's brand-guide-import edge function.
//
// THROW-ON-USE pattern (mirrors server/services/encryption.js):
//   - Missing key at module load → console.warn (NO throw — does not block boot)
//   - Missing key at call site   → throw inside the function

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-5.5';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

if (!OPENAI_API_KEY) {
  console.warn('[OPENAI] Missing OPENAI_API_KEY — brand extraction disabled until set');
}

/**
 * Call the OpenAI Responses API and return the parsed JSON object.
 *
 * Mirrors Justin's callExtraction shape exactly:
 *   POST https://api.openai.com/v1/responses
 *   body: { model, input: [{role:'system',content:systemPrompt},{role:'user',content:[{type:'input_text',text}]}],
 *           text: { format: { type: 'json_object' } } }
 *   header: Authorization: Bearer <key>
 *
 * We pass URL signals + page body as input_text (no PDF in this slice).
 *
 * @param {string} systemPrompt
 * @param {string} userText
 * @param {{ maxRetries?: number }} [opts]
 * @returns {Promise<object>} Parsed JSON object from the model.
 */
export async function extractStructuredJSON(systemPrompt, userText, { maxRetries = 2 } = {}) {
  // THROW-ON-USE: key must be present before proceeding
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const body = {
    model: OPENAI_EXTRACTION_MODEL,
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userText }],
      },
    ],
    text: { format: { type: 'json_object' } },
  };

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    let resp;
    try {
      resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt <= maxRetries) {
        const wait = 2000 * attempt;
        console.warn(`[OPENAI] Network error (attempt ${attempt}), retrying in ${wait}ms:`, networkErr.message);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(`OpenAI network error after ${attempt} attempts: ${networkErr.message}`);
    }

    // Transient server errors (5xx) → retry; client errors (4xx) → throw immediately.
    if (!resp.ok) {
      const body = await resp.text();
      if (resp.status >= 500 && attempt <= maxRetries) {
        lastErr = new Error(`OpenAI responses ${resp.status}: ${body.substring(0, 300)}`);
        const wait = 5000 * attempt;
        console.warn(`[OPENAI] Server error ${resp.status} (attempt ${attempt}), retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(`OpenAI responses ${resp.status}: ${body.substring(0, 300)}`);
    }

    const data = await resp.json();

    // Parse Responses API output — two shapes handled (mirrors Justin's parser):
    //   1. Convenience field: data.output_text (newer shape)
    //   2. Walk: data.output[] → find type:'message' → .content[] → type:'output_text'|'text'
    const messageOut = Array.isArray(data?.output)
      ? data.output.find(o => o.type === 'message')
      : undefined;
    const contentArr = messageOut?.content ?? data?.output ?? [];
    const textPart = (Array.isArray(contentArr) ? contentArr : [])
      .find(c => c.type === 'output_text' || c.type === 'text');
    const raw = textPart?.text ?? data?.output_text ?? '';

    if (!raw) {
      if (attempt <= maxRetries) {
        console.warn(`[OPENAI] Empty response (attempt ${attempt}), retrying...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error('OpenAI responses: no text in extraction response');
    }

    // Strip any stray code fences, then parse.
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(stripped);
  }

  throw lastErr ?? new Error('OpenAI extraction failed after all retries');
}

/**
 * Isolate / crop a single brand asset out of a source image via gpt-image edits
 * (mirrors Justin's brand-asset-isolate edge function). Logos/symbols come back
 * on a transparent background; watermarks/patterns keep their context.
 *
 * Requires the OpenAI image API to be enabled on the key. Env-overridable model
 * via OPENAI_IMAGE_MODEL (default 'gpt-image-1').
 *
 * @param {{ base64: string, mimeType?: string, instruction: string,
 *           transparent?: boolean, size?: string }} opts
 * @returns {Promise<string>} base64 PNG of the isolated asset.
 */
export async function isolateAssetImage({ base64, mimeType = 'image/png', instruction, transparent = true, size = '1024x1024' }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  if (!base64) throw new Error('No source image provided');

  const form = new FormData();
  form.append('model', OPENAI_IMAGE_MODEL);
  form.append('image', new Blob([Buffer.from(base64, 'base64')], { type: mimeType }), 'source.png');
  form.append('prompt', instruction);
  form.append('size', size);
  if (transparent) form.append('background', 'transparent');

  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI images/edits ${resp.status}: ${t.substring(0, 300)}`);
  }
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI images/edits: no image returned');
  return b64;
}
