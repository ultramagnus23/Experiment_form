import { z } from 'zod';
import { admin } from '@/lib/admin-auth';
import { fail, json, readJson } from '@/lib/http';
import { tx } from '@/lib/db';
import { audit } from '@/lib/audit';

/**
 * Individual records are never edited. The only permitted actions are:
 *   PATCH  -> mark excluded / include (analysis flag; data untouched), reason required
 *   DELETE -> remove the record entirely (e.g. withdrawal), reason + typed ID confirmation required
 * Both are written to the audit log.
 */
export const PATCH = admin(async (req, { email, params }) => {
  const b = z.object({ excluded: z.boolean(), reason: z.string().trim().min(3).max(300) }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'A reason (3+ characters) is required');
  const id = String(params.id);
  const ok = await tx(async (c) => {
    const r = await c.query('UPDATE participants SET excluded=$2 WHERE id=$1 RETURNING id', [id, b.data.excluded]);
    if (!r.rowCount) return false;
    await audit(email, b.data.excluded ? 'exclude_response' : 'include_response', { participant_id: id, reason: b.data.reason }, c);
    return true;
  });
  return ok ? json({ ok: true }) : fail(404, 'Not found');
});

export const DELETE = admin(async (req, { email, params }) => {
  const b = z.object({ reason: z.string().trim().min(3).max(300), confirmId: z.string() }).safeParse(await readJson(req));
  const id = String(params.id);
  if (!b.success || b.data.confirmId !== id) return fail(400, 'Type the participant ID and give a reason to confirm deletion');
  const ok = await tx(async (c) => {
    const cur = await c.query('SELECT condition, status FROM participants WHERE id=$1', [id]);
    if (!cur.rowCount) return false;
    await c.query('DELETE FROM participants WHERE id=$1', [id]);
    await audit(email, 'delete_response', { participant_id: id, status: cur.rows[0].status, reason: b.data.reason }, c);
    return true;
  });
  return ok ? json({ ok: true }) : fail(404, 'Not found');
});
