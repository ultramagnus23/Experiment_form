import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { query } from '@/lib/db';
import { blobEnabled } from '@/lib/env';

export const GET = admin(async () => {
  const { rows } = await query(`
    SELECT v.id, v.slot, v.original_filename, v.mime_type, v.container, v.duration_seconds::float AS duration_seconds,
           v.size_bytes, v.sha256, v.uploaded_by, v.uploaded_at, v.is_active,
           (SELECT count(*)::int FROM participants p WHERE p.audio_version_id = v.id) AS participants_assigned
      FROM audio_versions v ORDER BY v.uploaded_at DESC`);
  const active = { crowd: null as any, brown: null as any };
  for (const r of rows) if (r.is_active) active[r.slot as 'crowd' | 'brown'] = r;
  return json({ active, history: rows, storage: blobEnabled() ? 'blob' : 'local' });
});
