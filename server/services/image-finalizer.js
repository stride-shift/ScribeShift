/**
 * server/services/image-finalizer.js
 *
 * Layer A — per-platform image dimension storage (pass-through).
 *
 * PURPOSE
 * -------
 * Called on post approval (both approve paths in review.js) to write one
 * `post_image_variants` row per target platform. The row records the URL
 * that the scheduler should use when publishing to that platform.
 *
 * LAYER B SEAM
 * ------------
 * In Layer A, producePlatformVariant() is a PLACEHOLDER that simply returns
 * the base image URL unchanged. Layer B (the branding / image-quality rework)
 * replaces ONLY the body of producePlatformVariant() with real per-format
 * rendering + re-upload logic. Everything else — the table, the upsert, the
 * scheduler lookup, the approve-path call — requires no further change.
 */

import { supabase } from '../config/supabase.js';

/**
 * Canonical per-platform aspect ratios.
 *
 * CAVEAT — verify against live platform docs; these are canonical defaults.
 * LinkedIn feed: 1.91:1 (landscape). Twitter card: 1.91:1. Facebook feed: 1.91:1.
 * Instagram feed: 4:5 (portrait optimal). Subject to platform policy changes.
 */
const PLATFORM_ASPECT = {
  instagram: '4:5',
  linkedin:  '1.91:1',
  twitter:   '1.91:1',
  facebook:  '1.91:1',
};

/**
 * PLACEHOLDER / Layer-B insertion point.
 *
 * Layer A: returns the base image URL unchanged. No pixels are touched.
 *
 * Layer B replaces this function body with:
 *   1. Download baseImageUrl from storage.
 *   2. Resize / crop to the platform's canonical dimensions.
 *   3. Optionally composite brand overlays.
 *   4. Upload the result to the `post-media` bucket.
 *   5. Return { url: <new storage url>, aspect, width, height }.
 *
 * The rest of the system (finalizeDimensions, scheduler, migration) needs
 * NO other change when Layer B swaps this body.
 *
 * @param {string} baseImageUrl  The original image URL stored on the post.
 * @param {string} platform      One of: linkedin | twitter | facebook | instagram
 * @param {object} [opts]        Reserved for Layer B options (crop hints, branding).
 * @returns {{ url: string, aspect: string|null, width: number|null, height: number|null }}
 */
export async function producePlatformVariant(baseImageUrl, platform, opts = {}) {
  // ── LAYER A PASS-THROUGH ────────────────────────────────────────────────────
  // Return base URL as-is. Layer B replaces this entire block.
  return {
    url:    baseImageUrl,
    aspect: PLATFORM_ASPECT[platform] || null,
    width:  null,
    height: null,
  };
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
      const v = await producePlatformVariant(post.post_image_url, platform);

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
