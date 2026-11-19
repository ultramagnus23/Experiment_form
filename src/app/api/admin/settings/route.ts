import { admin } from '@/lib/admin-auth';
import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { DEFAULT_SETTINGS, SettingsSchema, getSettings, setSetting, Settings } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { audioReady, completedCount } from '@/lib/availability';

export const GET = admin(async () => {
  const [settings, ready, completed] = await Promise.all([getSettings(), audioReady(), completedCount()]);
  const alloc = (await query('SELECT count(*)::int AS n FROM allocations')).rows[0].n;
  return json({ settings, audioReady: ready, completed, allocationsExist: alloc > 0 });
});

export const PUT = admin(async (req, { email }) => {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body || typeof body !== 'object') return fail(400, 'Invalid body');
  const current = await getSettings();
  const partial = SettingsSchema.partial().strict().safeParse(body);
  if (!partial.success) return fail(400, partial.error.issues[0]?.message ?? 'Invalid settings');
  const next: Settings = { ...current, ...partial.data };

  if (next.playback_volume > next.volume_cap) return fail(400, 'Playback volume cannot exceed the approved volume cap');
  if (next.experiment_enabled && !(await audioReady())) return fail(400, 'Upload both the crowd-noise and brown-noise files before enabling the experiment');
  if (partial.data.allocation_method && partial.data.allocation_method !== current.allocation_method) {
    const n = (await query('SELECT count(*)::int AS n FROM allocations')).rows[0].n;
    if (n > 0) return fail(409, 'The allocation method cannot be changed once any participant has been allocated');
  }

  for (const key of Object.keys(partial.data) as (keyof Settings)[]) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    if (JSON.stringify(current[key]) === JSON.stringify(next[key])) continue;
    await setSetting(key, next[key], email);
    await audit(email, 'setting_change', { key, from: current[key], to: next[key] });
  }
  return json({ ok: true, settings: next });
});
