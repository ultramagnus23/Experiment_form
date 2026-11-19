import { after } from 'next/server';
import { query } from '@/lib/db';
import { json } from '@/lib/http';
import { createParticipant, currentParticipant, setParticipantCookie } from '@/lib/participant';
import { getSettings } from '@/lib/settings';
import { buildState } from '@/lib/state';
import { acceptingParticipants } from '@/lib/availability';

export async function POST() {
  const s = await getSettings();
  const existing = await currentParticipant();
  if (existing) return json(await buildState(existing, s));

  const a = await acceptingParticipants(s);
  if (!a.open) return json(await buildState(null, s));

  // Operational housekeeping: drop stale session secrets of finished participants.
  after(() =>
    query(
      `DELETE FROM participant_sessions WHERE created_at < now() - interval '30 days'
         AND participant_id IN (SELECT id FROM participants WHERE status IN ('completed','declined','ineligible'))`,
    ).catch(() => {}),
  );

  const { id, secret } = await createParticipant();
  await setParticipantCookie(id, secret);
  return json({ stage: 'consent', studyLocation: s.study_location });
}
