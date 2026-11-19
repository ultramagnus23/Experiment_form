import { json } from '@/lib/http';
import { tx } from '@/lib/db';
import { allocate } from '@/lib/allocation';
import { acceptingParticipants } from '@/lib/availability';
import { CONDITIONS } from '@/lib/experiment';
import { getSettings, effectiveVolume } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { stageOf } from '@/lib/participant';
import { participantById, requireParticipant, wrongStage } from '@/lib/p-helpers';

/**
 * Entering the experimental stage. This is the ONLY place a condition is assigned, and only for participants who
 * have passed consent, eligibility, demographics and instructions. Idempotent: a reload never re-randomizes.
 */
export async function POST() {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const s = await getSettings();

  if (p.status === 'assigned') return json(await buildState(p, s));
  if (p.status !== 'demographics_done') return wrongStage(p);

  const a = await acceptingParticipants(s);
  if (!a.open) return json({ stage: 'closed', closedReason: a.reason }, 503);

  await tx(async (c) => {
    const { condition, seq } = await allocate(c, p.id, s.allocation_method);
    const { framing, audio } = CONDITIONS[condition];
    const av = await c.query('SELECT id FROM audio_versions WHERE slot=$1 AND is_active', [audio]);
    if (!av.rows.length) throw new Error(`no active audio for slot ${audio}`);
    await c.query(
      `UPDATE participants
          SET condition=$2, framing=$3, audio_type=$4, assigned_at=now(), allocation_seq=$5, allocation_method=$6,
              audio_version_id=$7, playback_volume=$8, instructions_at=now(), status='assigned'
        WHERE id=$1 AND status='demographics_done'`,
      [p.id, condition, framing, audio, seq, s.allocation_method, av.rows[0].id, effectiveVolume(s).toFixed(3)],
    );
  });

  const fresh = await participantById(p.id);
  if (stageOf(fresh.status) !== 'trial') return wrongStage(fresh);
  return json(await buildState(fresh, s));
}
