import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { parseBuffer } from 'music-metadata';
import { audioDir } from './env';

export type Container = 'mp3' | 'wav' | 'm4a';
export const MIME: Record<Container, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };

export function sniffContainer(b: Buffer): Container | null {
  if (b.length < 12) return null;
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (b.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  if (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

export function extensionOf(name: string): Container | null {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.mp3') return 'mp3';
  if (ext === '.wav') return 'wav';
  if (ext === '.m4a') return 'm4a';
  return null;
}

export async function inspectAudio(buf: Buffer, container: Container) {
  const meta = await parseBuffer(buf, { mimeType: MIME[container], size: buf.length }, { duration: true });
  const duration = meta.format.duration;
  if (!duration || !isFinite(duration) || duration <= 0) throw new Error('Could not determine audio duration');
  return { duration, codec: meta.format.codec ?? null, container: meta.format.container ?? null };
}

export async function saveAudio(buf: Buffer, slot: string, container: Container) {
  const dir = audioDir();
  await fsp.mkdir(dir, { recursive: true });
  const stored = `${slot}-${randomUUID()}.${container}`;
  const tmp = path.join(dir, `.${stored}.tmp`);
  await fsp.writeFile(tmp, buf, { mode: 0o640 });
  await fsp.rename(tmp, path.join(dir, stored));
  return { stored, sha256: createHash('sha256').update(buf).digest('hex') };
}

export { audioPath } from './audio-store-paths';
