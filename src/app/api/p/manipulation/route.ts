import { z } from 'zod';
import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { participantById, requireParticipant, wrongStage } from '@/lib/p-helpers';

const Body = z.object({
  manip_distraction: z.number().int().min(1).max(4),
  manip_talking: z.number().int().min(1).max(4),
  manip_positive: z.number().int().min(1).max(4),
  attention: z.enum(['a', 'b', 'c', 'd']),
});

export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'Please answer every question');
  const b = parsed.data;

  // Only once, after the decision has been submitted and before the debrief.
  const r = await query(
    `UPDATE participants SET manip_distraction=$2, manip_talking=$3, manip_positive=$4,
            attention_answer=$5, manip_at=now()
      WHERE id=$1 AND status='completed' AND manip_at IS NULL AND debrief_at IS NULL
      RETURNING id`,
    [p.id, b.manip_distraction, b.manip_talking, b.manip_positive, b.attention],
  );
  if (!r.rowCount) return wrongStage(await participantById(p.id));
  return json(await buildState(await participantById(p.id), await getSettings()));
}
