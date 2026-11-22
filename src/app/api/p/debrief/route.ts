import { json } from '@/lib/http';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { participantById, requireParticipant, wrongStage } from '@/lib/p-helpers';

/** Records that the participant has read the debrief. Only possible after the manipulation check. */
export async function POST() {
  const p = await requireParticipant();
  if (p instanceof Response) return p;

  const r = await query(
    `UPDATE participants SET debrief_at=now()
      WHERE id=$1 AND status='completed' AND manip_at IS NOT NULL AND debrief_at IS NULL
      RETURNING id`,
    [p.id],
  );
  if (!r.rowCount) return wrongStage(await participantById(p.id));
  return json(await buildState(await participantById(p.id), await getSettings()));
}
