import { query } from '@/lib/db';
import { fail } from '@/lib/http';
import { serveAudio } from '@/lib/audio-serve';
import { requireParticipant } from '@/lib/p-helpers';

/**
 * Serves ONLY the participant's own assigned track, pinned to the audio version recorded at allocation time.
 * The URL is identical for every condition and no filename/category is ever exposed.
 */
export async function GET(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  if (p.status !== 'assigned' || !p.audio_version_id) return fail(409, 'Audio is not available at this stage');
  const { rows } = await query('SELECT stored_filename, mime_type, size_bytes FROM audio_versions WHERE id=$1', [p.audio_version_id]);
  if (!rows.length) return fail(404, 'Audio missing');
  try {
    return await serveAudio(req, rows[0].stored_filename, rows[0].mime_type, rows[0].size_bytes);
  } catch {
    return fail(500, 'Audio unavailable');
  }
}
