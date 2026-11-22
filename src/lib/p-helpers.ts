import { query } from './db';
import { ParticipantRow, currentParticipant, stageOf } from './participant';
import { fail } from './http';

export async function requireParticipant(): Promise<ParticipantRow | Response> {
  const p = await currentParticipant();
  if (!p) return fail(401, 'No active session', { stage: 'restart' });
  return p;
}

export async function participantById(id: string): Promise<ParticipantRow> {
  const { rows } = await query(
    `SELECT id, status, condition, framing, audio_type, audio_version_id, playback_volume, trial_started_at, trial_resumed, decision, manip_at, debrief_at
       FROM participants WHERE id=$1`,
    [id],
  );
  return rows[0] as ParticipantRow;
}

export function wrongStage(p: ParticipantRow) {
  return fail(409, 'This step is not available right now', { stage: stageOf(p.status) });
}
