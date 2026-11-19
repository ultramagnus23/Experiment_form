import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const GET = admin(async () => {
  const s = await getSettings();
  const r = (
    await query(
      `SELECT min(created_at) AS oldest, count(*)::int AS total,
              count(*) FILTER (WHERE created_at < now() - ($1 || ' years')::interval)::int AS expired
         FROM participants`,
      [String(s.retention_years)],
    )
  ).rows[0];
  const lastExport = (
    await query(`SELECT max(at) AS at FROM admin_audit WHERE action='export' AND details->>'kind'='complete'`)
  ).rows[0].at;
  const sessions = (await query('SELECT count(*)::int AS n FROM participant_sessions')).rows[0].n;
  const purgeable = (
    await query(`SELECT count(*)::int AS n FROM participant_sessions s JOIN participants p ON p.id = s.participant_id WHERE p.status IN ('completed','declined','ineligible')`)
  ).rows[0].n;
  const dueAt = r.oldest ? new Date(new Date(r.oldest).setFullYear(new Date(r.oldest).getFullYear() + s.retention_years)) : null;
  return json({ retentionYears: s.retention_years, oldest: r.oldest, total: r.total, expired: r.expired, deletionDueAt: dueAt, lastCompleteExportAt: lastExport, sessions, purgeableSessions: purgeable });
});
