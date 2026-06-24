import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';
import { supabase } from '../config/supabase.js';
import { geminiTts } from '../services/gemini-client.js';

const router = Router();

// ── POST /api/generate-tts ──────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { text, voiceStyle = 'professional', contentId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text content required' });
    }

    // Check credits
    const creditCheck = await checkCredits(req.user.company_id, 'generate_tts');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    console.log(`[TTS] Generating audio (${text.length} chars, style: ${voiceStyle})...`);

    // Use Gemini with audio response modality
    let audioBase64, audioMimeType;
    try {
      ({ audioBase64, audioMimeType } = await geminiTts(text, voiceStyle));
    } catch (apiErr) {
      console.error('[TTS] API error:', (apiErr.detail || apiErr.message || '').substring(0, 300));
      return res.status(500).json({ error: apiErr.message });
    }

    if (!audioBase64) {
      console.error('[TTS] No audio data returned');
      return res.status(500).json({ error: 'No audio data generated' });
    }

    // Deduct credits
    await deductCredits(req.user.id, req.user.company_id, 'generate_tts', 2, {
      text_length: text.length,
      voice_style: voiceStyle,
    });

    console.log(`[TTS] Generated audio (${(audioBase64.length / 1024).toFixed(0)}KB)`);

    res.json({
      success: true,
      audio: audioBase64,
      mimeType: audioMimeType,
    });
  } catch (err) {
    console.error('[TTS] Fatal error:', err);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

export default router;
