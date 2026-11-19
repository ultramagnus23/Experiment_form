import { admin } from '@/lib/admin-auth';
import { fail } from '@/lib/http';
import { query } from '@/lib/db';
import { serveAudio } from '@/lib/audio-serve';

/** Admin-only preview stream (supports HTTP Range). */
export const GET = admin(async (req, { params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail(400, 'Bad id');
  const { rows } = await query('SELECT stored_filename, mime_type, size_bytes FROM audio_versions WHERE id=$1', [id]);
  if (!rows.length) return fail(404, 'Not found');
  return serveAudio(req, rows[0].stored_filename, rows[0].mime_type, rows[0].size_bytes);
});
