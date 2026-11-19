import { fail, json, readJson } from '@/lib/http';
import { query } from '@/lib/db';
import { requireParticipant } from '@/lib/p-helpers';

const KINDS = ['load_error', 'decode_error', 'blocked', 'play_error', 'interrupted', 'tap_required'];

/** Playback-quality telemetry only: no user agent, no IP, no fingerprinting. */
export async function POST(req: Request) {
  const p = await requireParticipant();
  if (p instanceof Response) return p;
  const b = await readJson<{ kind?: string; detail?: string }>(req);
  if (!b || !KINDS.includes(b.kind ?? '')) return fail(400, 'Invalid event');
  if (p.status !== 'assigned') return json({ ok: true });
  await query(
    `INSERT INTO audio_events(participant_id, kind, detail)
     SELECT $1, $2, $3 WHERE (SELECT count(*) FROM audio_events WHERE participant_id=$1) < 30`,
    [p.id, b.kind, (b.detail ?? '').slice(0, 200) || null],
  );
  return json({ ok: true });
}
