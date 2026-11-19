import { z } from 'zod';
import { admin } from '@/lib/admin-auth';
import { fail, json, readJson } from '@/lib/http';
import { tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';

/**
 * Deletes research records older than the retention period (default 7 years).
 * Refuses unless a COMPLETE dataset export was downloaded within the last 24 hours.
 */
export const POST = admin(async (req, { email }) => {
  const b = z.object({ confirm: z.literal('DELETE') }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Type DELETE to confirm');
  const s = await getSettings();
  const result = await tx(async (c) => {
    const ex = await c.query(`SELECT 1 FROM admin_audit WHERE action='export' AND details->>'kind'='complete' AND at > now() - interval '24 hours' LIMIT 1`);
    if (!ex.rowCount) return { error: 'Download the complete CSV dataset first (within the last 24 hours) so you hold a copy before deletion.' };
    const del = await c.query(`DELETE FROM participants WHERE created_at < now() - ($1 || ' years')::interval`, [String(s.retention_years)]);
    await audit(email, 'retention_delete', { retention_years: s.retention_years, deleted: del.rowCount }, c);
    return { deleted: del.rowCount };
  });
  if ('error' in result) return fail(409, result.error!);
  return json({ ok: true, deleted: result.deleted });
});
