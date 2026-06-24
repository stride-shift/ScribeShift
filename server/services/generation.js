// Shared content-generation core, used by the Cloud Run worker (worker.js) for
// background jobs. It reuses the SAME prompt templates from skills.js as the
// website's synchronous route (routes/generate.js), so output is identical —
// only the orchestration lives here. The sync route is left untouched.
//
// File uploads are NOT handled here (they need multer/disk) — the worker path
// covers typed prompts + reference/YouTube URLs, which is the long-running case.

import { geminiText } from '../config/gemini.js';
import {
  SKILL_MAP, SKILL_TRANSCRIPT_TO_BLOG, injectBrand,
  TONE_DIRECTIVES, POLISH_DIRECTIVES, GOAL_DIRECTIVES, buildVoiceContext,
} from '../config/skills.js';
import { supabase } from '../config/supabase.js';
import { checkCredits, deductCredits } from './credits.js';
import { extractYouTubeTranscript, fetchUrlText, assembleInput } from './input-sources.js';

// Re-export the shared input-gathering helpers so the existing public API of
// this module is preserved (server/worker.js imports assembleInput from here).
export { extractYouTubeTranscript, fetchUrlText, assembleInput } from './input-sources.js';

const NULL_BYTE = new RegExp(String.fromCharCode(0), 'g'); // Postgres rejects

// Mirrors buildStyleDirectives in routes/generate.js (kept in lockstep).
function buildStyleDirectives(options = {}) {
  const parts = [];
  if (options.toneMode === 'detected' && options.detectedTone) {
    parts.push(`## TONE DIRECTIVE\nMatch this voice and style: ${options.detectedTone}`);
  } else if (options.toneMode === 'custom' && options.customTone && options.customTone.trim()) {
    parts.push(`## TONE DIRECTIVE\n${options.customTone.trim()}`);
  } else {
    const t = TONE_DIRECTIVES[options.tone];
    if (t) parts.push(`## TONE DIRECTIVE\n${t}`);
  }
  const p = POLISH_DIRECTIVES[options.polish || 'natural'];
  if (p) parts.push(`## POLISH LEVEL\n${p}`);
  if (options.goal && options.goal !== 'none') {
    const g = GOAL_DIRECTIVES[options.goal];
    if (g) parts.push(`## CONTENT GOAL\n${g}`);
  }
  return parts.length ? '\n\n' + parts.join('\n\n') : '';
}

// Core generation: blog-first (since video/newsletter derive from it), then each
// remaining type, then proportional credit deduction + save to generated_content.
// onProgress({ current, total, label }) lets the worker stream progress to the job row.
export async function runGeneration({ allInput, contentTypes = [], options = {}, brandData = {}, userId, companyId, onProgress = () => {} }) {
  if (!allInput || !allInput.trim()) return { ok: false, code: 400, error: 'No content provided.' };

  const textTypes = contentTypes.filter(t => t !== 'images');
  const creditCheck = await checkCredits(companyId, 'generate_text', textTypes.length);
  if (!creditCheck.allowed) return { ok: false, code: 402, error: creditCheck.error };

  const brandDirectives = buildStyleDirectives(options) + buildVoiceContext(brandData);
  const results = {};
  const total = textTypes.length;
  let done = 0;

  let blogContent = null;
  const needsBlog = contentTypes.some(t => ['video', 'newsletter'].includes(t));
  if (needsBlog || contentTypes.includes('blog')) {
    onProgress({ current: done, total, label: 'Generating blog…' });
    blogContent = await geminiText(
      `${injectBrand(SKILL_TRANSCRIPT_TO_BLOG, brandData)}${brandDirectives}\n\nCRITICAL REMINDER: The blog post MUST be entirely derived from the source content below. Cover the actual topics, arguments, stories, and insights from the source. Do NOT invent new topics or add information not present in the source material.\n\nIMPORTANT: Output ONLY the blog post. Do NOT wrap in code blocks or fences. Do NOT include preambles.\n\nHere is the transcript/source content (provided directly below — do NOT ask for it separately):\n${allInput}`
    );
    if (contentTypes.includes('blog')) { results.blog = blogContent; done++; onProgress({ current: done, total }); }
  }

  const remaining = contentTypes.filter(t => t !== 'blog' && t !== 'images');
  for (const type of remaining) {
    onProgress({ current: done, total, label: `Generating ${type}…` });
    try {
      const skill = SKILL_MAP[type];
      if (!skill) {
        results[type] = `Unknown type: ${type}`;
      } else {
        const input = ['video', 'newsletter'].includes(type) ? (blogContent || allInput) : allInput;
        const isSocial = ['linkedin', 'twitter', 'facebook', 'instagram'].includes(type);
        const contentLabel = ['video', 'newsletter'].includes(type)
          ? 'Here is the blog post to transform (provided directly below — do NOT ask for it separately):'
          : 'Here is the source content to transform (provided directly below — do NOT ask for it separately):';
        const sourceEnforcement = isSocial
          ? '\n\nCRITICAL REMINDER: Every single post you generate MUST be directly about the topics, ideas, and insights found in the source content below. Read the source carefully, identify the key themes, and make each post specifically about those themes. Do NOT produce generic social media posts.'
          : '\n\nCRITICAL REMINDER: Your output MUST be entirely derived from the source content below. Cover the actual topics, arguments, and insights from the source. Do NOT invent new topics or add information not present in the source material.';
        results[type] = await geminiText(
          `${injectBrand(skill, brandData)}${brandDirectives}${sourceEnforcement}\n\nIMPORTANT: Output ONLY the final content. Do NOT wrap in code blocks. Do NOT include preambles like "Here are X posts". Start directly with the content.\n\n${contentLabel}\n${input}\n\nOptions: ToneMode=${options.toneMode || 'preset'}, Tone=${options.tone}, Polish=${options.polish || 'natural'}, Length=${options.length}, Audience=${options.audience}, Industry=${options.industry || 'general'}, Goal=${options.goal || 'none'}`
        );
      }
    } catch (err) {
      results[type] = `Error generating ${type}: ${err.message}`;
    }
    done++;
    onProgress({ current: done, total });
  }

  // Deduct credits proportionally to successes (generateOne never throws).
  const isReal = (b) => b && !b.startsWith('Error generating') && !b.startsWith('Unknown type');
  const succeeded = textTypes.filter(t => isReal(results[t]));
  const charge = creditCheck.cost === 0 ? 0 : Math.round(creditCheck.cost * (succeeded.length / Math.max(1, textTypes.length)));
  await deductCredits(userId, companyId, 'generate_text', charge, { content_types: succeeded, options });

  // Save to generated_content (skip error/unknown strings; strip null bytes).
  const stripNulls = (s) => typeof s === 'string' ? s.replace(NULL_BYTE, '') : s;
  const sourceSummary = stripNulls(allInput.substring(0, 500));
  for (const [type, body] of Object.entries(results)) {
    if (!isReal(body)) continue;
    try {
      const cleanBody = stripNulls(body);
      await supabase.from('generated_content').insert({
        user_id: userId,
        company_id: companyId || null,
        brand_id: brandData.brandId || null,
        content_type: type,
        title: cleanBody.split('\n')[0]?.replace(/^#+\s*/, '').substring(0, 200) || type,
        body: cleanBody,
        source_summary: sourceSummary,
        options: {
          tone: options.tone, toneMode: options.toneMode || 'preset', polish: options.polish || 'natural',
          length: options.length, audience: options.audience, industry: options.industry,
          goal: options.goal || 'none', hasDetectedTone: !!options.detectedTone,
        },
      });
    } catch (e) {
      console.error(`[GEN] save ${type} failed:`, e.message);
    }
  }

  return { ok: true, results };
}
