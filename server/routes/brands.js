import { Router } from 'express';
import { Agent, fetch as undiciFetch } from 'undici';
import { supabase } from '../config/supabase.js';
import { uploadBase64 } from '../config/storage.js';
import { verifyToken } from '../middleware/auth.js';
import { geminiText } from '../config/gemini.js';

// Node's built-in fetch can hang on TCP connect when DNS returns an IPv6
// address that times out (common on dev machines without working v6
// connectivity). Use an undici Agent with autoSelectFamily so the client
// races A and AAAA records (Happy Eyeballs) and falls back quickly. Also
// raise the connect timeout for slow public sites.
const externalFetchAgent = new Agent({
  connect: { timeout: 30_000 },
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
  autoSelectFamily: true,
});

// Wrapper that always uses the tolerant Agent above. Only use for fetches
// of arbitrary external URLs (Shanne's site, logo images, etc.) — internal
// API calls should keep using the default fetch.
function externalFetch(url, init = {}) {
  return undiciFetch(url, { ...init, dispatcher: externalFetchAgent });
}

const router = Router();
router.use(verifyToken);

// Brands are a COMPANY-shared resource: every member of the org sees the same
// set, regardless of who created them. Brand-count limits are also enforced
// per-company, so a teammate creating a brand consumes the shared quota.
//
// We don't reuse the generic scopeByRole helper here because that one scopes
// regular users to their own user_id, which would silo a brand to a single
// teammate and hide it from the rest of the org.
function scopeBrands(req, query) {
  if (req.user.role === 'super_admin') return query;
  if (req.user.company_id) return query.eq('company_id', req.user.company_id);
  // Edge case: user without a company → show only their personal brands.
  return query.eq('user_id', req.user.id);
}

// Default brand-count limit per plan. A company row can override with `max_brands`.
const PLAN_BRAND_LIMITS = {
  free: 1,
  starter: 3,
  agency: 10,
  enterprise: 50,
};

async function getBrandLimit(companyId) {
  if (!companyId) return { limit: 1, plan: 'free' };
  const { data } = await supabase
    .from('companies')
    .select('plan, max_brands')
    .eq('id', companyId)
    .single();
  if (!data) return { limit: 1, plan: 'free' };
  if (typeof data.max_brands === 'number') return { limit: data.max_brands, plan: data.plan };
  return { limit: PLAN_BRAND_LIMITS[data.plan] ?? PLAN_BRAND_LIMITS.free, plan: data.plan };
}

// ── URL → brand extraction helpers ──────────────────────────────────
// Resolve a possibly-relative URL against a base.
function resolveUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

// Download a remote image and upload it to our brand-logos bucket so the
// brand record points at a URL we own. If anything fails (timeout, non-image
// content type, oversize, network error) we return null and the caller falls
// back to the original remote URL — the brand still gets a logo, just less
// durable.
const ALLOWED_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

function extForType(contentType) {
  if (contentType.includes('svg')) return 'svg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('icon')) return 'ico';
  return 'png';
}

async function mirrorLogo(sourceUrl, userId) {
  if (!sourceUrl || !userId) return null;
  let controller;
  try {
    controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await externalFetch(sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScribeShiftBot/1.0)' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_LOGO_TYPES.has(contentType)) return null;

    const sizeHeader = res.headers.get('content-length');
    if (sizeHeader && parseInt(sizeHeader, 10) > MAX_LOGO_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_LOGO_BYTES || buf.byteLength === 0) return null;

    const base64 = buf.toString('base64');
    const ext = extForType(contentType);
    const filePath = `${userId}/extracted-${Date.now()}.${ext}`;
    return await uploadBase64('brand-logos', filePath, base64, contentType);
  } catch (err) {
    console.warn('[BRANDS] Logo mirror failed:', err.message);
    return null;
  }
}

// Strip script/style tags, then strip remaining HTML, collapse whitespace.
function extractBodyText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull common single-string meta values (og:image, theme-color, etc.).
function extractMeta(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// Parse all JSON-LD blocks. Many marketing sites embed an Organization schema
// here with brand name, logo URL, description, and sameAs (social URLs) — far
// more reliable than guessing from meta tags or body text.
function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      // JSON-LD can be a single object or an array; @graph nests further.
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const it of items) {
        if (it && it['@graph'] && Array.isArray(it['@graph'])) {
          for (const g of it['@graph']) out.push(g);
        } else if (it) {
          out.push(it);
        }
      }
    } catch {
      // Sites occasionally ship invalid JSON-LD with comments or trailing
      // commas. Skip silently — we have plenty of other signals.
    }
  }
  return out;
}

// Find the Organization-like block in a JSON-LD pile.
function findOrganization(ldBlocks) {
  const types = new Set(['Organization', 'Corporation', 'LocalBusiness', 'NewsMediaOrganization', 'EducationalOrganization', 'WebSite']);
  for (const b of ldBlocks) {
    const t = b['@type'];
    if (typeof t === 'string' && types.has(t)) return b;
    if (Array.isArray(t) && t.some((x) => types.has(x))) return b;
  }
  // Fallback: any block that looks like it has brand-ish fields
  return ldBlocks.find((b) => b && (b.name || b.logo || b.url)) || null;
}

// Pull logo URL out of a JSON-LD logo field (can be string or ImageObject).
function logoFromLd(org) {
  if (!org || !org.logo) return null;
  if (typeof org.logo === 'string') return org.logo;
  if (typeof org.logo === 'object' && (org.logo.url || org.logo['@id'])) {
    return org.logo.url || org.logo['@id'];
  }
  return null;
}

// Hunt for <link rel="apple-touch-icon" sizes="..."> tags. Apple touch icons
// are typically square, ≥180x180, and basically always the brand logo on a
// solid background — way more useful than the favicon for our preview UI.
function findAppleTouchIcons(html) {
  const out = [];
  const re = /<link\b([^>]*\brel=["'](?:apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    const sizesMatch = tag.match(/\bsizes=["']([^"']+)["']/i);
    if (hrefMatch) {
      const size = sizesMatch ? parseInt(sizesMatch[1].split('x')[0], 10) || 0 : 0;
      const precomposed = tag.toLowerCase().includes('precomposed');
      out.push({ href: hrefMatch[1], size, precomposed });
    }
  }
  return out;
}

// Pick the best logo candidate from all our signals. Ranking, best-first:
//   1. JSON-LD Organization.logo (explicit, brand-curated)
//   2. apple-touch-icon (highest size; usually the brand mark on bg)
//   3. og:image / twitter:image (often a hero, but better than nothing)
//   4. favicon (last resort, low-res)
function pickBestLogo({ jsonLdLogo, appleTouchIcons, ogImage, twitterImage, favicon }, baseUrl) {
  if (jsonLdLogo) return resolveUrl(jsonLdLogo, baseUrl);
  if (appleTouchIcons.length) {
    const best = [...appleTouchIcons].sort((a, b) => b.size - a.size)[0];
    return resolveUrl(best.href, baseUrl);
  }
  if (ogImage) return resolveUrl(ogImage, baseUrl);
  if (twitterImage) return resolveUrl(twitterImage, baseUrl);
  if (favicon) return resolveUrl(favicon, baseUrl);
  return null;
}

// Extract social profile URLs from JSON-LD sameAs OR from raw href attributes
// pointing at LinkedIn / Twitter / etc. Returns a deduped object keyed by
// platform.
function extractSocialUrls(html, ldOrg) {
  const found = {};

  const patterns = {
    linkedin: /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in|school)\/[^\s"'<>?#]+/i,
    twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s"'<>?#\/]+/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>?#\/]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>?#\/]+/i,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:c|channel|user|@)[^\s"'<>?#]+/i,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>?#]+/i,
  };

  // Start with sameAs from JSON-LD if present (curated by the site).
  const sameAs = Array.isArray(ldOrg?.sameAs) ? ldOrg.sameAs : (ldOrg?.sameAs ? [ldOrg.sameAs] : []);
  for (const url of sameAs) {
    if (typeof url !== 'string') continue;
    for (const [key, re] of Object.entries(patterns)) {
      if (!found[key] && re.test(url)) found[key] = url;
    }
  }

  // Fall back to scanning the rest of the HTML for hrefs.
  for (const [key, re] of Object.entries(patterns)) {
    if (found[key]) continue;
    const m = html.match(re);
    if (m) found[key] = m[0];
  }

  return found;
}

// Normalize writing samples to an array of non-empty strings, capped at 5.
function normalizeSamples(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

// ── GET /api/brands ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('brands')
      .select('*')
      .order('created_at', { ascending: false });

    query = scopeBrands(req, query);
    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    const { limit } = await getBrandLimit(req.user.company_id);
    res.json({ brands: data, limit, used: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// ── POST /api/brands/extract-from-url ───────────────────────────────
// Given a public website URL, fetches the page, parses obvious meta tags
// (og:image as logo, theme-color as primary colour), strips the body to
// readable text, and asks Gemini to infer the rest (brand name, ICP, tone,
// industry, writing samples). Returns a partial brand draft the client can
// pre-fill the form with — user still reviews & saves.
//
// We do NOT save anything to the DB here — the client decides whether to
// keep the suggestions or override them. Treat the response as a draft.
router.post('/extract-from-url', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

  let url;
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).toString();
  } catch {
    return res.status(400).json({ error: 'Please enter a valid URL' });
  }

  try {
    const pageRes = await externalFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScribeShiftBot/1.0; +https://scribe-shift.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!pageRes.ok) {
      return res.status(400).json({ error: `Couldn't reach that site (HTTP ${pageRes.status})` });
    }
    const html = await pageRes.text();
    const finalUrl = pageRes.url || url;

    // ── Cheap structured extraction first — these usually beat AI guessing ──
    const ogImage = extractMeta(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ]);
    const twitterImage = extractMeta(html, [
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const favicon = extractMeta(html, [
      /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i,
    ]);
    const themeColor = extractMeta(html, [
      /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const tileColor = extractMeta(html, [
      /<meta[^>]+name=["']msapplication-TileColor["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const ogTitle = extractMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const ogSiteName = extractMeta(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const ogDescription = extractMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const pageTitle = extractMeta(html, [
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);

    // JSON-LD: rich structured data. When a site has Organization markup we
    // get the curated brand name, logo, description, and social URLs for free.
    const ldBlocks = extractJsonLd(html);
    const ldOrg = findOrganization(ldBlocks);
    const ldName = ldOrg?.name || null;
    const ldDescription = ldOrg?.description || null;
    const ldLogo = logoFromLd(ldOrg);
    const ldSlogan = ldOrg?.slogan || null;

    // Apple touch icons — usually the brand mark, square, ≥180px.
    const appleTouchIcons = findAppleTouchIcons(html);

    // Pick the best logo across all signals, then mirror to our bucket.
    const remoteLogoUrl = pickBestLogo(
      { jsonLdLogo: ldLogo, appleTouchIcons, ogImage, twitterImage, favicon },
      finalUrl
    );
    const mirroredLogoUrl = await mirrorLogo(remoteLogoUrl, req.user.id);
    const logoUrl = mirroredLogoUrl || remoteLogoUrl;

    // Social URLs (curated sameAs first, then scan body for hrefs)
    const socials = extractSocialUrls(html, ldOrg);

    const bodyText = extractBodyText(html).slice(0, 10000);

    // Ask Gemini to fill in what we couldn't get from structured signals.
    // Low temperature (0.2) and JSON response mode keep the output reliable.
    // The prompt gives the model every structured signal we already have so
    // it doesn't second-guess things we know for sure.
    const aiPrompt = `You are a brand strategist analysing a company's website. Read the structured signals and page content below, then produce a single JSON object describing the brand.

# Structured signals (trust these — they came directly from the page)
URL: ${finalUrl}
Page title: ${pageTitle || '(none)'}
Open Graph site name: ${ogSiteName || '(none)'}
Open Graph title: ${ogTitle || '(none)'}
Open Graph description: ${ogDescription || '(none)'}
JSON-LD organisation name: ${ldName || '(none)'}
JSON-LD organisation description: ${ldDescription || '(none)'}
JSON-LD slogan: ${ldSlogan || '(none)'}
theme-color meta: ${themeColor || '(none)'}
msapplication-TileColor: ${tileColor || '(none)'}

# Cleaned page body (truncated)
${bodyText}

# Output schema — return EXACTLY this shape, no extras, no comments
{
  "brand_name": "human-friendly brand name (prefer ogSiteName > JSON-LD name > a cleaned page title without 'Home -' or '| Description' suffixes)",
  "tagline": "one short sentence — the brand's positioning line, ≤12 words. If none on page, distil one from hero copy. Empty string if impossible.",
  "industry": "one of: general | tech | marketing | healthcare | finance | education | other",
  "primary_color": "#rrggbb — use theme-color or msapplication-TileColor if either is present, otherwise pick the dominant brand colour you can infer from copy or default to #3b82f6",
  "secondary_color": "#rrggbb — complementary accent. Default #475569 if you can't tell.",
  "icp_description": "2-3 sentences. WHO is the target customer? Role/title, company stage or size, the problem they need solved. Be specific — 'mid-market revenue leaders' beats 'businesses'.",
  "brand_guidelines": "2-4 sentences capturing the brand voice: tone, formality, vocabulary preferences, things they avoid. E.g. 'Direct, plain-spoken, founder-voice. Skips buzzwords like leverage and synergy. Confident but not arrogant. Numbers over adjectives.'",
  "tone_descriptors": ["3-6 short adjectives describing the voice (e.g. 'direct', 'witty', 'technical', 'warm')"],
  "suggested_pillars": ["3-5 content pillar names the brand could publish under, derived from what the site already talks about. 1-3 words each."],
  "writing_samples": ["3 ACTUAL passages copied VERBATIM from the page that best represent the brand voice — hero copy, value props, about-page paragraphs. 1-4 sentences each. Must be exact quotes."]
}

Rules:
- Strict JSON only. No markdown, no comments, no trailing prose.
- writing_samples MUST be verbatim from the body content above. Do not paraphrase, summarise, or invent.
- If a field truly can't be inferred, return a sensible default ("" for strings, [] for arrays, "general" for industry).
- Never wrap in \`\`\` fences.`;

    let extracted = {};
    try {
      const aiRaw = await geminiText(aiPrompt, 3, {
        temperature: 0.2,
        responseMimeType: 'application/json',
      });
      const cleaned = aiRaw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      extracted = JSON.parse(cleaned);
    } catch (err) {
      console.warn('[BRANDS] AI extraction parse failed:', err.message);
      extracted = {};
    }

    // Pick a primary colour: prefer AI suggestion → theme-color meta → tile-color → fallback.
    const colorRe = /^#[0-9a-fA-F]{6}$/;
    let primaryColor = '#3b82f6';
    if (colorRe.test(extracted.primary_color || '')) primaryColor = extracted.primary_color;
    else if (themeColor && colorRe.test(themeColor)) primaryColor = themeColor;
    else if (tileColor && colorRe.test(tileColor)) primaryColor = tileColor;

    const secondaryColor = colorRe.test(extracted.secondary_color || '')
      ? extracted.secondary_color
      : '#475569';

    // Brand name: AI's pick, but if it's the same as the raw page title we can
    // try to strip common boilerplate suffixes ("| The X for Y", "- Home").
    let brandName = extracted.brand_name || ldName || ogSiteName || ogTitle || pageTitle || '';
    brandName = brandName.replace(/\s*[|·•—–-]\s.+$/, '').trim();

    // Compose brand_guidelines: if AI gave us guidelines AND we have a tagline,
    // tuck the tagline at the front so the user sees positioning + voice in one place.
    let guidelines = extracted.brand_guidelines || '';
    if (extracted.tagline) {
      guidelines = guidelines
        ? `Tagline: ${extracted.tagline}\n\n${guidelines}`
        : `Tagline: ${extracted.tagline}`;
    }
    if (Array.isArray(extracted.tone_descriptors) && extracted.tone_descriptors.length) {
      const tones = extracted.tone_descriptors.filter((t) => typeof t === 'string').slice(0, 6).join(', ');
      if (tones) guidelines = guidelines ? `${guidelines}\n\nTone: ${tones}.` : `Tone: ${tones}.`;
    }

    const draft = {
      brand_name: brandName,
      tagline: extracted.tagline || ldSlogan || '',
      industry: ['general', 'tech', 'marketing', 'healthcare', 'finance', 'education', 'other']
        .includes(extracted.industry) ? extracted.industry : 'general',
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      icp_description: extracted.icp_description || ldDescription || '',
      brand_guidelines: guidelines,
      tone_descriptors: Array.isArray(extracted.tone_descriptors)
        ? extracted.tone_descriptors.filter((s) => typeof s === 'string').slice(0, 6)
        : [],
      suggested_pillars: Array.isArray(extracted.suggested_pillars)
        ? extracted.suggested_pillars
            .filter((s) => typeof s === 'string' && s.trim())
            .map((s) => s.trim())
            .slice(0, 6)
        : [],
      writing_samples: Array.isArray(extracted.writing_samples)
        ? extracted.writing_samples
            .filter((s) => typeof s === 'string' && s.trim())
            .map((s) => s.trim())
            .slice(0, 5)
        : [],
      logo_url: logoUrl,
      socials, // { linkedin?: url, twitter?: url, ... }
      source_url: finalUrl,
    };

    res.json({ draft });
  } catch (err) {
    console.error('[BRANDS] extract-from-url error:', err);
    res.status(500).json({ error: err.message || 'Failed to extract brand info' });
  }
});

// ── POST /api/brands ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      brand_name, primary_color, secondary_color, logo_url, industry,
      icp_description, brand_guidelines, writing_samples,
    } = req.body;

    // Enforce per-plan brand count before insert
    const { limit } = await getBrandLimit(req.user.company_id);
    const { count } = await supabase
      .from('brands')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', req.user.company_id);
    if ((count ?? 0) >= limit) {
      return res.status(403).json({
        error: `Brand limit reached (${count}/${limit}). Contact your admin to upgrade your plan.`,
        limit,
        used: count,
      });
    }

    const { data, error } = await supabase
      .from('brands')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        brand_name: brand_name || '',
        primary_color: primary_color || '#fbbf24',
        secondary_color: secondary_color || '#38bdf8',
        logo_url,
        industry: industry || 'general',
        icp_description: icp_description || null,
        brand_guidelines: brand_guidelines || null,
        writing_samples: normalizeSamples(writing_samples),
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ brand: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

// ── PUT /api/brands/:id ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'brand_name', 'primary_color', 'secondary_color', 'logo_url', 'industry',
      'icp_description', 'brand_guidelines',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.writing_samples !== undefined) {
      updates.writing_samples = normalizeSamples(req.body.writing_samples);
    }
    updates.updated_at = new Date().toISOString();

    let query = supabase.from('brands').update(updates).eq('id', req.params.id);
    query = scopeBrands(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// ── POST /api/brands/:id/logo ──────────────────────────────────────
router.post('/:id/logo', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: 'No image data provided' });

    const ext = (mimeType || 'image/png').split('/')[1] || 'png';
    const filePath = `${req.user.id}/${req.params.id}.${ext}`;
    const publicUrl = await uploadBase64('brand-logos', filePath, base64, mimeType || 'image/png');

    // Save URL to brand record
    await supabase
      .from('brands')
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, logo_url: publicUrl });
  } catch (err) {
    console.error('[BRANDS] Logo upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// ── DELETE /api/brands/:id ──────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    let query = supabase.from('brands').delete().eq('id', req.params.id);
    query = scopeBrands(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

export default router;
