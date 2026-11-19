import { admin } from '@/lib/admin-auth';
import { json } from '@/lib/http';
import { computeStats } from '@/lib/analytics';
import { getSettings } from '@/lib/settings';
import { audioReady } from '@/lib/availability';

export const GET = admin(async (req) => {
  const excludeFlagged = new URL(req.url).searchParams.get('exclude_flagged') === '1';
  const [stats, settings, ready] = await Promise.all([computeStats(excludeFlagged), getSettings(), audioReady()]);
  return json({ ...stats, target: settings.target_sample_size, enabled: settings.experiment_enabled, audioReady: ready });
});
