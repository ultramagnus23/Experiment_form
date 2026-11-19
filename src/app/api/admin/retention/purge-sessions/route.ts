import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';

/** Removes OPERATIONAL session secrets of finished participants (research records are untouched). */
export const POST = admin(async (_req, { email }) => {
  const r = await query(`DELETE FROM participant_sessions WHERE participant_id IN (SELECT id FROM participants WHERE status IN ('completed','declined','ineligible'))`);
  await query(`DELETE FROM admin_login_tokens WHERE expires_at < now() - interval '1 day'`);
  await query(`DELETE FROM admin_sessions WHERE expires_at < now() - interval '1 day'`);
  await audit(email, 'purge_sessions', { sessions_deleted: r.rowCount });
  return json({ ok: true, deleted: r.rowCount });
});
