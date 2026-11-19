import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { query } from '@/lib/db';

export const GET = admin(async () => {
  const { rows } = await query(`
    SELECT p.id, p.status, p.age, p.gender, p.major, p.condition, p.framing, p.audio_type, p.decision,
           p.latency_ms, p.submitted_at, p.audio_status, p.audio_interrupted, p.flags, p.excluded, p.created_at,
           p.latency_source, p.server_elapsed_ms, p.audio_version_id
      FROM participants p
     ORDER BY p.created_at DESC
     LIMIT 5000`);
  return json({ rows });
});
