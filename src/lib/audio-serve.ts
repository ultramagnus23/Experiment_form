import fs from 'node:fs';
import { get as blobGet } from '@vercel/blob';
import { audioPath } from './audio-store-paths';

/** Serve a stored audio file with HTTP Range support (needed for admin <audio> preview in Safari). */
export async function serveAudioFile(req: Request, stored: string, mime: string, size: number): Promise<Response> {
  const p = audioPath(stored);
  const range = req.headers.get('range');
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (!m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
      end = Math.min(end, size - 1);
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const stream = fs.createReadStream(p, { start, end });
      return new Response(stream as any, {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
  }
  const stream = fs.createReadStream(p);
  return new Response(stream as any, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}

export const BLOB_PREFIX = 'blob:';
export const isBlobRef = (stored: string) => stored.startsWith(BLOB_PREFIX);

type BlobGetter = (pathname: string, opts: { access: 'private'; useCache?: boolean }) => Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;

/**
 * Serve a stored track from either backend. For Blob the private object is STREAMED through this function
 * (never redirected), so the Blob URL is never exposed and Vercel's 4.5 MB response cap does not apply.
 */
export async function serveAudio(req: Request, stored: string, mime: string, size: number, getter: BlobGetter = blobGet as any): Promise<Response> {
  if (!isBlobRef(stored)) return serveAudioFile(req, stored, mime, size);
  const r = await getter(stored.slice(BLOB_PREFIX.length), { access: 'private' });
  if (!r || r.statusCode !== 200 || !r.stream) return new Response('Audio missing', { status: 404 });
  return new Response(r.stream, {
    status: 200,
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
