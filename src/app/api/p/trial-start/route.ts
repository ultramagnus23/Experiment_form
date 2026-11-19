import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { requireParticipant, wrongStage } from '@/lib/p-helpers';

/** Called once the vignette is actually on screen (after audio is confirmed running). */
export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const body = await readJson<{ audioStatus?: string }>(req);
  if (!body || !['started', 'started_after_tap'].includes(body.audioStatus ?? '')) return fail(400, 'Invalid audio status');
  if (p.status !== 'assigned') return wrongStage(p);

  // trial_started_at keeps the FIRST display time. A second call means the page was reloaded mid-trial.
  const r = await query<{ trial_resumed: boolean }>(
    `UPDATE participants
        SET trial_resumed = trial_resumed OR (trial_started_at IS NOT NULL),
            trial_started_at = COALESCE(trial_started_at, now()),
            audio_status = $2
      WHERE id=$1 AND status='assigned' AND decision IS NULL
      RETURNING trial_resumed`,
    [p.id, body.audioStatus],
  );
  if (!r.rowCount) return wrongStage(p);
  return json({ ok: true, resumed: r.rows[0].trial_resumed });
}
