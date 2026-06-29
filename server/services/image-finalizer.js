/**
 * server/services/image-finalizer.js
 *
 * Layer B — real per-platform image rendering.
 *
 * PURPOSE
 * -------
 * Called on post approval (both approve paths in review.js) to write one
 * `post_image_variants` row per target platform. Each row records a
 * platform-native image URL the scheduler uses when publishing.
 *
 * producePlatformVariant() downloads the base image, cover-crops it to the
 * platform's canonical pixel dimensions (centered, no distortion), re-encodes
 * as JPEG, and uploads the result to the `post-media` bucket. If anything in
 * that pipeline fails it falls back to the original URL (pass-through), so a
 * usable variant row is always produced — publishing never breaks on a render
 * error.
 */

import { Jimp } from 'jimp';
import { supabase } from '../config/supabase.js';
import { uploadBuffer } from '../config/storage.js';

/**
 * Canonical per-platform target dimensions (px) + the aspect label stored
 * alongside them.
 *
 * CAVEAT — verify against live platform docs; these are canonical defaults.
 * LinkedIn / Twitter / Facebook feed: 1.91:1 landscape (~1200×628).
 * Instagram feed: 4:5 portrait (1080×1350). Subject to platform policy changes.
 */
const PLATFORM_DIMS = {
  instagram: { w: 1080, h: 1350, aspect: '4:5' },
  linkedin:  { w: 1200, h: 628,  aspect: '1.91:1' },
  twitter:   { w: 1200, h: 628,  aspect: '1.91:1' },
  facebook:  { w: 1200, h: 630,  aspect: '1.91:1' },
};

const VARIANT_BUCKET = 'post-media';

/**
 * Fetch the base image bytes. Works for public Supabase storage URLs and any
 * other publicly fetchable image URL stored on the post.
 */
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Layer B: render a platform-native variant.
 *
 *   1. Download baseImageUrl.
 *   2. cover-crop (centered) to the platform's canonical dimensions — fills the
 *      frame with no distortion, trimming overflow.
 *   3. Re-encode as JPEG (quality 88) and upload to post-media/variants/.
 *   4. Return { url, aspect, width, height }.
 *
 * On ANY failure, falls back to the original URL with the canonical aspect and
 * null pixel dims (pass-through) — the caller still records a usable row.
 *
 * @param {string} baseImageUrl  The original image URL stored on the post.
 * @param {string} platform      One of: linkedin | twitter | facebook | instagram
 * @param {object} [opts]        { postId } used to build a stable storage path.
 * @returns {{ url: string, aspect: string|null, width: number|null, height: number|null }}
 */
export async function producePlatformVariant(baseImageUrl, platform, opts = {}) {
  const dims = PLATFORM_DIMS[platform];

  // Unknown platform or no image: nothing to render — pass through.
  if (!dims || !baseImageUrl) {
    return { url: baseImageUrl, aspect: dims?.aspect || null, width: null, height: null };
  }

  try {
    const buf = await downloadImage(baseImageUrl);
    const img = await Jimp.read(buf);

    // Already the right size? Skip the round-trip.
    if (img.bitmap.width === dims.w && img.bitmap.height === dims.h) {
      return { url: baseImageUrl, aspect: dims.aspect, width: dims.w, height: dims.h };
    }

    img.cover({ w: dims.w, h: dims.h }); // centered cover-crop, no distortion
    const out = await img.getBuffer('image/jpeg', { quality: 88 });

    // Stable path → idempotent re-render on re-approval (upsert overwrites).
    const path = `variants/${opts.postId || 'post'}/${platform}.jpg`;
    const url = await uploadBuffer(VARIANT_BUCKET, path, out, 'image/jpeg');

    return { url, aspect: dims.aspect, width: dims.w, height: dims.h };
  } catch (err) {
    // Render/upload failed — fall back to the original image so the post still
    // has a usable variant. finalizeDimensions logs and proceeds.
    console.warn(`[IMAGE-FINALIZER] variant render failed for ${platform} (using original):`, err.message);
    return { url: baseImageUrl, aspect: dims.aspect, width: null, height: null };
  }
}

/**
 * Materialise per-platform image variants for a post that has just been approved.
 *
 * Skips gracefully when:
 *   - image_mode === 'caption_only' (no image ever attached)
 *   - post_image_url is absent (legacy post with no image)
 *
 * FAILURE-ISOLATED: the entire function is wrapped in try/catch and NEVER
 * throws. Approval proceeds regardless of any variant-write error.
 *
 * Idempotent: uses `.upsert(..., { onConflict: 'scheduled_post_id,platform' })`
 * so re-approving (e.g. after a changes_requested cycle) overwrites existing rows
 * instead of inserting duplicates.
 *
 * @param {object} post  A scheduled_posts row with at minimum:
 *                       { id, company_id, platform, image_mode, post_image_url }
 */
export async function finalizeDimensions(post) {
  try {
    // ── Skip: no image on this post ──────────────────────────────────────────
    if (post.image_mode === 'caption_only' || !post.post_image_url) {
      return;
    }

    // ── Determine target platform(s) ─────────────────────────────────────────
    // Layer A: each scheduled_posts row has a single platform column → one variant.
    // Written as an array/loop so Layer B can extend to multi-platform rendering
    // without restructuring this function (e.g. pass `platforms: [...]` in post).
    const platforms = [post.platform];

    const now = new Date().toISOString();

    for (const platform of platforms) {
      const v = await producePlatformVariant(post.post_image_url, platform, { postId: post.id });

      const { error } = await supabase
        .from('post_image_variants')
        .upsert(
          {
            scheduled_post_id: post.id,
            company_id:        post.company_id,
            platform,
            storage_url:       v.url,
            aspect:            v.aspect,
            width:             v.width,
            height:            v.height,
            updated_at:        now,
          },
          { onConflict: 'scheduled_post_id,platform' }
        );

      if (error) {
        console.error(
          `[IMAGE-FINALIZER] Failed to upsert variant for post ${post.id} platform ${platform}:`,
          error.message
        );
        // Continue to next platform — don't abort the loop on a single failure
      }
    }
  } catch (err) {
    // NEVER re-throw: approval must succeed regardless of variant-write errors.
    console.error('[IMAGE-FINALIZER] Unexpected error in finalizeDimensions:', err.message);
  }
}
