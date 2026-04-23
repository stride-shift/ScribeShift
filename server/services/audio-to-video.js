// Convert an audio file to an MP4 with an animated waveform on a dark background.
// Used by the schedule media upload — social platforms don't accept raw audio,
// so we render a 1280×720 video the platforms will accept.

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Render audio → MP4 with a centered waveform on a dark background.
 *
 * @param {string} inputPath  Absolute path to the source audio file
 * @param {string} outputPath Absolute path where the MP4 should be written
 * @returns {Promise<string>} The output path on success
 */
export function renderAudioToVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      // Generate a smooth-line waveform sized for landscape video, then composite
      // it on a 1280x720 dark canvas using the brand blue.
      .complexFilter([
        'color=c=#0b1220:s=1280x720:d=10[bg]',
        '[0:a]showwaves=s=1280x360:mode=cline:colors=#3b82f6:rate=25[waves]',
        '[bg][waves]overlay=x=0:y=180:shortest=1[v]',
      ])
      .outputOptions([
        '-map [v]',
        '-map 0:a',
        '-c:v libx264',
        '-preset veryfast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
        '-movflags +faststart',
      ])
      .save(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`ffmpeg failed: ${err.message}`)));
  });
}

/**
 * Convenience: take a buffer + extension, write to a tmp file, render, return
 * the resulting MP4 buffer plus filename. Caller is responsible for uploading
 * the buffer somewhere durable (Supabase Storage).
 */
export async function audioBufferToVideoBuffer(audioBuffer, originalName) {
  const stamp = Date.now();
  const tmpDir = path.join(os.tmpdir(), 'scribeshift-a2v');
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(originalName) || '.mp3';
  const inputPath = path.join(tmpDir, `in-${stamp}${ext}`);
  const outputPath = path.join(tmpDir, `out-${stamp}.mp4`);

  await fs.writeFile(inputPath, audioBuffer);
  try {
    await renderAudioToVideo(inputPath, outputPath);
    const videoBuffer = await fs.readFile(outputPath);
    const baseName = path.basename(originalName, ext);
    return { videoBuffer, filename: `${baseName}.mp4` };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
