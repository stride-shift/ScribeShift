import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';
import { supabase } from '../config/supabase.js';

const router = Router();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TTS_MODEL = 'gemini-2.0-flash';

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const systemPrompt = `You are a professional voice-over artist. Read the following text aloud in a ${voiceStyle} tone. Speak clearly, with natural pacing and appropriate emphasis.`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${text}` }] }],
        generationConfig: {
          temperature: 0.3,
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voiceStyle === 'casual' ? 'Kore' : 'Puck',
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[TTS] API error:', err.substring(0, 300));
      return res.status(500).json({ error: `TTS generation failed: ${response.status}` });
    }

    const data = await response.json();
    const audioPart = data.candidates?.[0]?.content?.parts?.find(
      p => p.inlineData || p.inline_data
    );

    const audioBase64 = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
    const audioMimeType = audioPart?.inlineData?.mimeType || audioPart?.inline_data?.mime_type || 'audio/wav';

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
