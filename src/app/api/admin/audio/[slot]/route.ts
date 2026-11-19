import path from 'node:path';
import { createHash } from 'node:crypto';
import { del, get } from '@vercel/blob';
import { admin } from '@/lib/admin-auth';
import { fail, json, readJson } from '@/lib/http';
import { tx } from '@/lib/db';
import { MAX_AUDIO_BYTES, blobEnabled } from '@/lib/env';
import { BLOB_PREFIX } from '@/lib/audio-serve';
import { MIME, extensionOf, inspectAudio, saveAudio, sniffContainer } from '@/lib/audio-store';
import { audit } from '@/lib/audit';

export const maxDuration = 60;

/**
 * Register (or replace) the audio for one slot. Old versions are kept so each participant's exposure stays traceable.
 *  - Local-disk mode: multipart upload straight to this route.
 *  - Blob mode: the browser has ALREADY uploaded to private Blob storage; this route is called with
 *    { pathname, filename }, downloads the object server-side, validates it, and records it.
 * Both modes share the same validation (extension ↔ magic bytes ↔ parsed audio).
 */
export const POST = admin(async (req, { email, params }) => {
  const slot = String(params.slot);
  if (slot !== 'crowd' && slot !== 'brown') return fail(404, 'Unknown audio slot');

  let buf: Buffer;
  let filename: string;
  let blobPath: string | null = null;
  const cleanup = async () => {
    if (blobPath) await del(blobPath).catch(() => {});
  };

  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    if (!blobEnabled()) return fail(400, 'Blob storage is not configured');
    const b = await readJson<{ pathname?: string; filename?: string }>(req);
    if (!b?.pathname || !/^audio\/[A-Za-z0-9._-]{1,200}$/.test(b.pathname) || typeof b.filename !== 'string') return fail(400, 'Invalid request');
    blobPath = b.pathname;
    filename = b.filename;
    const got = await get(blobPath, { access: 'private', useCache: false });
    if (!got || got.statusCode !== 200) return fail(400, 'Uploaded file not found');
    if (got.blob.size > MAX_AUDIO_BYTES) {
      await cleanup();
      return fail(413, `File is too large (limit ${Math.round(MAX_AUDIO_BYTES / 1048576)} MB)`);
    }
    buf = Buffer.from(await new Response(got.stream).arrayBuffer());
  } else {
    if (blobEnabled()) return fail(400, 'This deployment uses direct-to-storage uploads; please use the dashboard uploader');
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail(400, 'Expected a multipart file upload');
    }
    const file = form.get('file');
    if (!(file instanceof File)) return fail(400, 'No file provided');
    if (file.size > MAX_AUDIO_BYTES) return fail(413, `File is too large (limit ${Math.round(MAX_AUDIO_BYTES / 1048576)} MB)`);
    filename = file.name;
    buf = Buffer.from(await file.arrayBuffer());
  }

  if (buf.length === 0) {
    await cleanup();
    return fail(400, 'The file is empty');
  }
  const byExt = extensionOf(filename);
  const bySniff = sniffContainer(buf);
  if (!byExt) {
    await cleanup();
    return fail(400, 'Only .mp3, .wav and .m4a files are supported');
  }
  if (!bySniff || bySniff !== byExt) {
    await cleanup();
    return fail(400, 'The file contents do not match its extension, or it is not a supported audio file');
  }
  let info;
  try {
    info = await inspectAudio(buf, bySniff);
  } catch (e: any) {
    await cleanup();
    return fail(400, `Could not read this audio file: ${e?.message ?? 'unknown error'}`);
  }

  const sha256 = createHash('sha256').update(buf).digest('hex');
  const stored = blobPath ? `${BLOB_PREFIX}${blobPath}` : (await saveAudio(buf, slot, bySniff)).stored;
  const original = path.basename(filename).slice(0, 200);

  const version = await tx(async (c) => {
    await c.query('UPDATE audio_versions SET is_active=false WHERE slot=$1 AND is_active', [slot]);
    const r = await c.query(
      `INSERT INTO audio_versions(slot, original_filename, stored_filename, mime_type, container, duration_seconds, size_bytes, sha256, uploaded_by, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       RETURNING id, slot, original_filename, duration_seconds::float AS duration_seconds, size_bytes, uploaded_at, is_active`,
      [slot, original, stored, MIME[bySniff], info.container, info.duration.toFixed(3), buf.length, sha256, email],
    );
    await audit(email, 'audio_upload', { slot, version_id: r.rows[0].id, filename: original, sha256, duration_seconds: info.duration, storage: blobPath ? 'blob' : 'local' }, c);
    return r.rows[0];
  });
  return json({ ok: true, version });
});
