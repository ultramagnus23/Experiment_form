import { cookies } from 'next/headers';
import { query } from './db';
import { newParticipantId, newSecret, safeEqualHex, sha256hex } from './random';
import { PARTICIPANT_COOKIE, isSecureDeployment } from './env';

export interface ParticipantRow {
  id: string;
  status: 'opened' | 'declined' | 'consented' | 'ineligible' | 'eligible' | 'demographics_done' | 'assigned' | 'completed';
  condition: 1 | 2 | 3 | 4 | null;
  framing: 'positive' | 'negative' | null;
  audio_type: 'crowd' | 'brown' | null;
  audio_version_id: number | null;
  playback_volume: string | null;
  trial_started_at: Date | null;
  trial_resumed: boolean;
  decision: string | null;
}

export type Stage =
  | 'closed'
  | 'consent'
  | 'declined'
  | 'eligibility'
  | 'ineligible'
  | 'demographics'
  | 'instructions'
  | 'trial'
  | 'complete';

export function stageOf(status: ParticipantRow['status']): Stage {
  switch (status) {
    case 'opened': return 'consent';
    case 'declined': return 'declined';
    case 'consented': return 'eligibility';
    case 'ineligible': return 'ineligible';
    case 'eligible': return 'demographics';
    case 'demographics_done': return 'instructions';
    case 'assigned': return 'trial';
    case 'completed': return 'complete';
  }
}

export async function createParticipant(): Promise<{ id: string; secret: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newParticipantId();
    const secret = newSecret();
    try {
      const c = await (await import('./db')).pool().connect();
      try {
        await c.query('BEGIN');
        await c.query('INSERT INTO participants(id) VALUES ($1)', [id]);
        await c.query('INSERT INTO participant_sessions(participant_id, token_hash) VALUES ($1,$2)', [id, sha256hex(secret)]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
      return { id, secret };
    } catch (e: any) {
      if (e?.code === '23505') continue; // id collision, retry
      throw e;
    }
  }
  throw new Error('could not allocate participant id');
}

export async function setParticipantCookie(id: string, secret: string) {
  const jar = await cookies();
  jar.set(PARTICIPANT_COOKIE, `${id}.${secret}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureDeployment(),
    path: '/',
    maxAge: 60 * 60 * 24, // session info is operational and short-lived
  });
}

export async function currentParticipant(): Promise<ParticipantRow | null> {
  const jar = await cookies();
  const raw = jar.get(PARTICIPANT_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const id = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!/^P-[A-Z0-9]{10}$/.test(id)) return null;
  const { rows } = await query(
    `SELECT p.id, p.status, p.condition, p.framing, p.audio_type, p.audio_version_id, p.playback_volume,
            p.trial_started_at, p.trial_resumed, p.decision, s.token_hash
       FROM participants p JOIN participant_sessions s ON s.participant_id = p.id
      WHERE p.id = $1`,
    [id],
  );
  if (!rows.length) return null;
  if (!safeEqualHex(sha256hex(secret), rows[0].token_hash)) return null;
  const { token_hash, ...p } = rows[0];
  return p as ParticipantRow;
}
