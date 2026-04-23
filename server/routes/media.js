// Universal media upload for scheduled posts.
// Accepts image / video / document (PDF, DOCX) / audio.
// Audio is auto-converted to MP4 with a waveform overlay because no social
// platform accepts raw audio. Result is uploaded to Supabase Storage and the
// public URL is returned.

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { verifyToken } from '../middleware/auth.js';
import { uploadBuffer } from '../config/storage.js';
import { audioBufferToVideoBuffer } from '../services/audio-to-video.js';

const router = Router();

const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads/';
// 50MB matches the post-media Supabase bucket limit so we fail fast with a
// clear message rather than uploading then erroring at storage.
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

const BUCKET = 'post-media';

const TYPE_MAP = {
  // image
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  // video
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-matroska': 'video',
  // document
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  // audio (will be converted)
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
};

function safeName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80);
}

router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { mimetype, originalname, path: tmpPath } = req.file;
  const kind = TYPE_MAP[mimetype];

  if (!kind) {
    await fs.unlink(tmpPath).catch(() => {});
    return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
  }

  try {
    const buffer = await fs.readFile(tmpPath);
    const stamp = Date.now();
    const userPrefix = req.user.id.slice(0, 8);
    let publicUrl;
    let mediaType = kind;
    let filename;
    let contentType = mimetype;

    if (kind === 'audio') {
      console.log(`[MEDIA] Converting audio "${originalname}" to MP4 with waveform...`);
      const { videoBuffer, filename: convertedName } = await audioBufferToVideoBuffer(buffer, originalname);
      filename = `${userPrefix}/${stamp}-${safeName(convertedName)}`;
      contentType = 'video/mp4';
      mediaType = 'video';
      publicUrl = await uploadBuffer(BUCKET, filename, videoBuffer, contentType);
      console.log(`[MEDIA] Audio converted and uploaded: ${publicUrl}`);
    } else {
      filename = `${userPrefix}/${stamp}-${safeName(originalname)}`;
      publicUrl = await uploadBuffer(BUCKET, filename, buffer, contentType);
      console.log(`[MEDIA] ${kind} uploaded: ${publicUrl}`);
    }

    res.json({
      success: true,
      url: publicUrl,
      type: mediaType,
      filename: path.basename(filename),
      original_filename: originalname,
      original_type: mimetype,
    });
  } catch (err) {
    console.error('[MEDIA] Upload failed:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
});

export default router;
