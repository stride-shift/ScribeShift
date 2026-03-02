import { supabase } from './supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

/**
 * Upload a buffer to Supabase Storage and return the public URL.
 */
export async function uploadBuffer(bucket, filePath, buffer, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
}

/**
 * Upload a base64-encoded file to Supabase Storage and return the public URL.
 */
export async function uploadBase64(bucket, filePath, base64, contentType = 'image/png') {
  const buffer = Buffer.from(base64, 'base64');
  return uploadBuffer(bucket, filePath, buffer, contentType);
}
