import { z } from 'zod';
import { query } from './db';

export const SettingsSchema = z.object({
  experiment_enabled: z.boolean(),
  target_sample_size: z.number().int().min(1).max(100000),
  auto_close_at_target: z.boolean(),
  playback_volume: z.number().min(0).max(1),
  volume_cap: z.number().min(0).max(1),
  allocation_method: z.enum(['permuted_blocks', 'simple']),
  study_location: z.string().max(300),
  retention_years: z.number().int().min(1).max(50),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  experiment_enabled: false, // researchers must deliberately open the study
  target_sample_size: 40,
  auto_close_at_target: false,
  playback_volume: 0.3,
  volume_cap: 0.5, // conservative default; set the real approved limit after calibration
  allocation_method: 'permuted_blocks',
  study_location: '',
  retention_years: 7,
};

export async function getSettings(): Promise<Settings> {
  const { rows } = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  const parsed = SettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function setSetting(key: keyof Settings, value: unknown, by: string) {
  await query(
    `INSERT INTO settings(key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), by],
  );
}

/** The volume actually used for playback: never above the researcher-approved cap. */
export function effectiveVolume(s: Settings): number {
  return Math.max(0, Math.min(s.playback_volume, s.volume_cap));
}
