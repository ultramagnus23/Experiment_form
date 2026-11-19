import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { participantById, requireParticipant, wrongStage } from '@/lib/p-helpers';

export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const body = await readJson<{ agree?: unknown }>(req);
  if (!body || typeof body.agree !== 'boolean') return fail(400, 'Please select an answer');
  if (p.status !== 'opened') return wrongStage(p);

  const r = await query(
    `UPDATE participants SET consent=$2, consented_at=now(), status=$3 WHERE id=$1 AND status='opened' RETURNING id`,
    [p.id, body.agree, body.agree ? 'consented' : 'declined'],
  );
  if (!r.rowCount) return wrongStage(await participantById(p.id));
  return json(await buildState(await participantById(p.id), await getSettings()));
}
