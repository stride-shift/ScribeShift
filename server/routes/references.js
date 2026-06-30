// /api/references — personal "References" library. Users upload images, docs,
// and PDFs the AI should look at when generating posts/images. Each reference is
// tagged with what to take from it (tone / look / imagery); documents/PDFs also
// store extracted text so the model can read them.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { uploadBase64 } from '../config/storage.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);

const MAX_REFERENCES = 50;
const VALID_PURPOSES = ['tone', 'look', 'imagery'];
const cleanPurposes = (p) => (Array.isArray(p) ? p.filter((x) => VALID_PURPOSES.includes(x)) : []);

// GET /api/references — the caller's own references (personal).
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_references')
      .select('id, storage_url, filename, mime_type, kind, purposes, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ references: data || [] });
  } catch (err) {
    console.error('[REFERENCES] list error:', err.message);
    res.status(500).json({ error: 'Failed to load references' });
  }
});

// POST /api/references — upload an image or document reference.
router.post('/', async (req, res) => {
  try {
    const { base64, mimeType, filename, purposes } = req.body;
    if (!base64) return res.status(400).json({ error: 'No file data provided' });

    const { count } = await supabase
      .from('ai_references').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id);
    if ((count || 0) >= MAX_REFERENCES) {
      return res.status(400).json({ error: `Reference limit reached (${MAX_REFERENCES}). Delete some to add more.` });
    }

    const mt = mimeType || 'application/octet-stream';
    const isImage = mt.startsWith('image/');
    const kind = isImage ? 'image' : 'document';
    const ext = ((mt.split('/')[1] || 'bin').split('+')[0]) || 'bin';
    const path = `references/${req.user.id}/${randomUUID()}.${ext}`;
    const url = await uploadBase64('post-media', path, base64, mt);

    // Extract text for documents (best-effort; never blocks the upload).
    let extractedText = null;
    if (!isImage) {
      try {
        if (mt === 'text/plain' || mt === 'text/markdown') {
          extractedText = Buffer.from(base64, 'base64').toString('utf-8').slice(0, 20000);
        } else if (mt === 'application/pdf') {
          const { uploadToGemini, waitForFileProcessing, geminiExtractFromFile } = await import('../services/gemini-client.js');
          const fs = await import('fs/promises');
          const p = await import('path');
          const os = await import('os');
          const tmp = p.join(os.tmpdir(), `ref-${randomUUID()}.pdf`);
          await fs.writeFile(tmp, Buffer.from(base64, 'base64'));
          try {
            const up = await uploadToGemini(tmp, mt, filename || 'reference.pdf');
            const proc = await waitForFileProcessing(up.name, 60_000);
            const text = await geminiExtractFromFile(proc.uri, mt, 'Extract the readable text/content of this document as plain text. No preamble, no markdown headings.');
            if (text) extractedText = text.slice(0, 20000);
          } finally { try { await fs.unlink(tmp); } catch {} }
        }
      } catch (e) {
        console.warn('[REFERENCES] text extraction failed (continuing):', e.message);
      }
    }

    const { data, error } = await supabase
      .from('ai_references')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id || null,
        storage_url: url,
        filename: (filename || '').toString().slice(0, 200) || null,
        mime_type: mt,
        kind,
        extracted_text: extractedText,
        purposes: cleanPurposes(purposes),
      })
      .select('id, storage_url, filename, mime_type, kind, purposes, created_at')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, reference: data });
  } catch (err) {
    console.error('[REFERENCES] upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload reference' });
  }
});

// PATCH /api/references/:id — update the purpose tags.
router.patch('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('ai_references')
      .update({ purposes: cleanPurposes(req.body?.purposes) })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reference' });
  }
});

// DELETE /api/references/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('ai_references').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reference' });
  }
});

export default router;
