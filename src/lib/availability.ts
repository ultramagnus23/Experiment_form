import { query } from './db';
import { Settings } from './settings';

export async function activeAudio(): Promise<{ crowd: number | null; brown: number | null }> {
  const { rows } = await query<{ slot: 'crowd' | 'brown'; id: number }>('SELECT slot, id FROM audio_versions WHERE is_active');
  const out = { crowd: null as number | null, brown: null as number | null };
  for (const r of rows) out[r.slot] = r.id;
  return out;
}

export async function audioReady(): Promise<boolean> {
  const a = await activeAudio();
  return a.crowd !== null && a.brown !== null;
}

export async function completedCount(): Promise<number> {
  const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM participants WHERE status='completed' AND NOT excluded");
  return rows[0].n;
}

/** Whether NEW participants may start / be allocated. */
export async function acceptingParticipants(s: Settings): Promise<{ open: boolean; reason?: string }> {
  if (!s.experiment_enabled) return { open: false, reason: 'disabled' };
  if (!(await audioReady())) return { open: false, reason: 'audio_missing' };
  if (s.auto_close_at_target && (await completedCount()) >= s.target_sample_size) return { open: false, reason: 'target_reached' };
  return { open: true };
}
